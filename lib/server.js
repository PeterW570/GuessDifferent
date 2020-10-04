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

function onSocketConnect(ws) {
	clients.add(ws);
	clientData.set(ws, {});
	console.log(new Date(), '[ws] Connection added');

	ws.on('message', function (m) {
		console.log(`Received message => ${m}`);
		const { key, message } = JSON.parse(m);

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
		}
	});

	ws.on('close', function () {
		clients.delete(ws);
	});
}

const wss = new WebSocket.Server({ server });
wss.on('connection', onSocketConnect);

server.listen(PORT, (error) => {
	if (error) return console.error(error);
	console.log(new Date(), `Server listening on port ${PORT}`);
});
