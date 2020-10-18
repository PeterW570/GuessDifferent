const url = `ws://${window.location.hostname}${
	window.location.port ? `:${window.location.port}` : ''
}`;
const connection = new WebSocket(url);
let connected = false;
const sendQueue = []; // in case we try to send things before connected
const onMessageSubscribers = new Set();

const UTILS = {
	$: {
		addClass: ($el, className) => $el.classList.add(className),
		removeClass: ($el, className) => $el.classList.remove(className),
		appendHTML: ($el, htmlStr) => ($el.innerHTML += htmlStr),
		empty: ($el) => {
			while ($el.firstChild) $el.removeChild($el.firstChild);
		},
	},
	WS: {
		connect: (cb) => {
			connection.onopen = () => {
				connected = true;
				sendQueue.forEach((d) => UTILS.WS.send(d));
				if (cb) cb();

				let heartbeatTimeout = setTimeout(() => {
					console.error('Heartbeat missed.');
				}, 10000);
				UTILS.WS.addSub(
					() => {
						if (heartbeatTimeout) clearTimeout(heartbeatTimeout);
						UTILS.WS.send({ key: 'pong' });
						heartbeatTimeout = setTimeout(() => {
							console.error('Heartbeat missed.');
						}, 10000);
					},
					{ key: 'ping' }
				);
			};

			connection.onerror = (error) => {
				console.log(`WebSocket error: ${error}`);
				// TODO: show error message
			};

			connection.onmessage = (e) => {
				console.log('On Message: ', e.data);
				for (const sub of onMessageSubscribers) sub(JSON.parse(e.data));
			};
		},
		send: ({ message, key }) => {
			if (connected) connection.send(JSON.stringify({ message, key }));
			else sendQueue.push({ message, key });
		},
		addSub: (sub, { key: keyToMatch, once = false }) => {
			if (keyToMatch) {
				function checkKey(e) {
					const { key } = e;
					if (key !== keyToMatch) return;
					sub(e);
					if (once) onMessageSubscribers.delete(checkKey);
				}
				onMessageSubscribers.add(checkKey);
			} else onMessageSubscribers.add(sub);
		},
		delSub: (sub) => onMessageSubscribers.delete(sub),
	},
};

export default UTILS;
