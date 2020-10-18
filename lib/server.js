const fs = require('fs');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');
const PORT = 3000;

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

function sendUpdatedData() {
	for (let client of clients) {
		client.send(
			JSON.stringify({
				key: 'all-players',
				message: [...clientData.values()],
			})
		);
	}
}

const questions = [
	{
		question: 'Tabs or spaces',
		possibleAnswers: ['Tabs', 'Spaces'],
		answer: 'Tabs',
	},
];
let currentQuestion = 0;

function sendQuestion() {
	const { question, possibleAnswers } = questions[currentQuestion];
	for (let client of clients) {
		client.send(
			JSON.stringify({
				key: 'new:question',
				message: {
					question,
					possibleAnswers,
				},
			})
		);
	}
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

function onSocketConnect(ws) {
	clients.add(ws);
	clientData.set(ws, {});
	console.log(new Date(), '[ws] Connection added');
	handleHeartbeat(ws);

	ws.on('message', function (m) {
		console.log(`Received message => ${m}`);
		const { key, message } = JSON.parse(m);

		if (key === 'pong') {
			handleHeartbeat(ws);
		}
		if (key === 'set:name') {
			const data = clientData.get(ws);
			data.name = message;
			data.score = 0;
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
			sendQuestion();
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
