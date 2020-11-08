const fs = require('fs');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');
const PORT = 3300;

// const { debounce } = require('./utils');

const server = http.createServer((req, res) => {
	const { method, url, body, headers } = req;

	console.log(new Date(), method, url);

	if (method === 'GET') {
		if (url === '/') {
			fs.readFile(path.join(__dirname, '../public/index.html'), function (
				err,
				html
			) {
				if (err) throw err;
				res.writeHeader(200, { 'Content-Type': 'text/html' });
				res.write(html);
				res.end();
			});
		} else if (['.html', '.css', '.js'].some((ext) => url.endsWith(ext))) {
			fs.readFile(`./public/${url}`, (err, data) => {
				if (err) {
					res.writeHeader(404, {
						'Content-Type': 'text/plain',
					});
					res.write('404 Not Found');
					res.end();
					return;
				}

				if (url.endsWith('.html')) {
					res.writeHeader(200, {
						'Content-Type': 'text/html',
					});
				}

				if (url.endsWith('.js')) {
					res.writeHeader(200, {
						'Content-Type': 'application/javascript',
					});
				}

				res.write(data);
				res.end();
			});
		} else {
			res.statusCode = 404;
			res.end();
		}
	} else {
		res.statusCode = 404;
		res.end();
	}
});

const clients = new Set();
const clientData = new Map();

function sendToAll(data) {
	for (let client of clients) {
		client.send(JSON.stringify(data));
	}
}

function sendUpdatedData() {
	sendToAll({
		key: 'all-players',
		message: [...clientData.values()],
	});
}

const questions = [
	{
		type: 'unique',
		question: 'Name a european country',
		answer: [
			'albania',
			'andorra',
			'austria',
			'belarus',
			'belgium',
			'bosnia and herzegovina',
			'bulgaria',
			'croatia',
			'cyprus',
			'czech republic',
			'denmark',
			'estonia',
			'finland',
			'france',
			'germany',
			'greece',
			'hungary',
			'iceland',
			'ireland',
			'italy',
			'kosovo',
			'latvia',
			'liechtenstein',
			'lithuania',
			'luxembourg',
			'north macedonia',
			'malta',
			'moldova',
			'monaco',
			'montenegro',
			'netherlands',
			'norway',
			'poland',
			'portugal',
			'romania',
			'russia',
			'san marino',
			'serbia',
			'slovakia',
			'slovenia',
			'spain',
			'sweden',
			'switzerland',
			'turkey',
			'ukraine',
			'united kingdom',
			'vatican city',
		],
	},
	{
		type: 'multi-choice',
		question:
			'For about how many weeks after their birth are leopard cubs hidden by their mothers?',
		possibleAnswers: ['Four', 'Six', 'Eight', 'Ten'],
		answer: 'Eight',
	},
	{
		type: 'multi-choice',
		question: 'Where do leopards often hide their food?',
		possibleAnswers: ['Bushes', 'Trees', 'Lakes', 'Rivers'],
		answer: 'Trees',
	},
	{
		type: 'multi-choice',
		question: 'When do leopards usually hunt?',
		possibleAnswers: ['Morning', 'Afternoon', 'Evening', 'Night'],
		answer: 'Night',
	},
];

function sendQuestion({
	type,
	question,
	possibleAnswers,
	timeForQuestion = 20,
}) {
	sendToAll({
		key: 'new:question',
		message: {
			type,
			question,
			possibleAnswers,
		},
	});
	setTimeout(() => {
		checkAnswers();
	}, timeForQuestion * 1000);
}

let getQuestion;
function* questionGenerator() {
	yield* questions;
}

function handleUniqueQuestion() {
	const lastQuestionResults = { correct: [], incorrect: [] };
	const answerFrequencies = {};
	for (let client of clients) {
		const data = clientData.get(client);
		if (data.name === 'One Admin') continue;

		if (answerFrequencies[data.pendingAnswer])
			answerFrequencies[data.pendingAnswer]++;
		else answerFrequencies[data.pendingAnswer] = 1;
	}
	for (let client of clients) {
		const data = clientData.get(client);
		if (data.name === 'One Admin') continue;

		const gotUniqueAnswer = answerFrequencies[data.pendingAnswer] === 1;
		const gotCorrectAnswer =
			data.pendingAnswer &&
			gotUniqueAnswer &&
			currentQuestion.answer.includes(data.pendingAnswer.toLowerCase());
		data.pendingAnswer = null;
		if (gotCorrectAnswer) {
			lastQuestionResults.correct.push(data);
			data.score++;
			data.answerStreak++;
		} else {
			lastQuestionResults.incorrect.push(data);
			data.answerStreak = 0;
		}
	}
	return lastQuestionResults;
}

function handleMultiChoiceQuestion() {
	const lastQuestionResults = { correct: [], incorrect: [] };
	for (let client of clients) {
		const data = clientData.get(client);
		if (data.name === 'One Admin') continue;
		const gotCorrectAnswer = data.pendingAnswer === currentQuestion.answer;
		data.pendingAnswer = null;
		if (gotCorrectAnswer) {
			lastQuestionResults.correct.push(data);
			data.score++;
			data.answerStreak++;
		} else {
			lastQuestionResults.incorrect.push(data);
			data.answerStreak = 0;
		}
	}
	return lastQuestionResults;
}

function checkAnswers() {
	const lastQuestionResults = (() => {
		switch (currentQuestion.type) {
			case 'unique': // if you choose the same answer as someone else, you don't get any points
				return handleUniqueQuestion();
			case 'multi-choice': // standard multi-choice question
				return handleMultiChoiceQuestion();
			default:
				throw new Error('Unhandled question type');
		}
	})();
	currentQuestion = null;
	sendToAll({
		key: 'question-results',
		message: lastQuestionResults,
	});
	sendUpdatedData();
}

const sendHeartbeatTimeouts = new Map();
const recieveHeartbeatTimeouts = new Map();
function handleHeartbeat(ws) {
	if (sendHeartbeatTimeouts.has(ws)) {
		clearTimeout(sendHeartbeatTimeouts.get(ws));
		sendHeartbeatTimeouts.delete(ws);
	}
	if (recieveHeartbeatTimeouts.has(ws)) {
		clearTimeout(recieveHeartbeatTimeouts.get(ws));
		recieveHeartbeatTimeouts.delete(ws);
	}
	sendHeartbeatTimeouts.set(
		ws,
		setTimeout(() => {
			recieveHeartbeatTimeouts.set(
				ws,
				setTimeout(() => {
					console.error('Missed heartbeat, removing client');
					clients.delete(ws);
					clientData.delete(ws);
					sendUpdatedData();
				}, 4000)
			);
			ws.send(
				JSON.stringify({
					key: 'ping',
				})
			);
			console.log('ping');
		}, 4000)
	);
}

let currentQuestion = null;
function onSocketConnect(ws) {
	clients.add(ws);
	clientData.set(ws, { score: 0, answerStreak: 0 });
	console.log(new Date(), '[ws] Connection added');
	handleHeartbeat(ws);

	// TODO: check if there's a question in progress, and send them it if there is?

	ws.on('message', function (m) {
		console.log(`Received message => ${m}`);
		const { key, message } = JSON.parse(m);

		if (key === 'pong') {
			handleHeartbeat(ws);
		}
		if (key === 'set:name') {
			const data = clientData.get(ws);
			data.name = message;
			ws.send(
				JSON.stringify({
					key: 'set:name',
					message: 'OK',
				})
			);
			sendUpdatedData();
		} else if (key === 'get:players') {
			sendUpdatedData();
		} else if (key === 'start:quiz') {
			getQuestion = questionGenerator();
			const { value: firstQuestion, done } = getQuestion.next();
			currentQuestion = firstQuestion;
			sendQuestion(firstQuestion);
		} else if (key === 'next:question') {
			const { value, done } = getQuestion.next();
			if (done) {
				sendToAll({
					key: 'game-over',
					message: [...clientData.values()]
						.sort((a, b) => b.score - a.score)
						.filter((d) => d.name !== 'One Admin'),
				});
			} else {
				currentQuestion = value;
				sendQuestion(value);
			}
		} else if (key === 'updated:answer') {
			const data = clientData.get(ws);
			data.pendingAnswer = message;
		}
	});

	ws.on('close', function () {
		clients.delete(ws);
		sendUpdatedData();
	});
}

const wss = new WebSocket.Server({ server });
wss.on('connection', onSocketConnect);

server.listen(PORT, (error) => {
	if (error) return console.error(error);
	console.log(new Date(), `Server listening on port ${PORT}`);
});
