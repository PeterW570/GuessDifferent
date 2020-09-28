const fs = require('fs');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');
const PORT = 3000;

const server = http.createServer((req, res) => {
	const { method, url, headers } = req;

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
	}
});

const clients = new Set();

function onSocketConnect(ws) {
	clients.add(ws);
	console.log(new Date(), '[ws] Connection added');

	ws.on('message', function (message) {
		console.log(`Received message => ${message}`);
		for (let client of clients) {
			client.send(message);
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
