# websocketio
WebSocket high-level abstraction

### Use ###
 * Simlar programming style to packages such as [socket.io](http://socket.io/)
 * Send JSON objects as Strings or Binary data as ArrayBuffers
 * Support for external applications (Python, C++)
 * Fast streaming for high-performance networking

```
var WebSocketIO = require('websocketio');

var server = http.createServer(...);
var wsioServer = new WebSocketIO.Server({server: server});
wsioServer.onconnection(openWebSocketClient);

function openWebSocketClient(wsio) {
	console.log("Client connect: "+ wsio.id);
	wsio.onclose(closeWebSocketClient);

	wsio.on('requestJSONMessage', wsRequestJSONMessage);
	wsio.on('broadcastToAllClients', wsBroadcastToAllClients);
}

function closeWebSocketClient(wsio) {
	console.log("Client disconnect: "+ wsio.id);
}

function wsRequestJSONMessage(wsio, data) {
	wsio.emit('JSONMessage', {foo: "hello", bar: "world"});
}

function wsBroadcastToAllClients(wsio, data) {
	wsioServer.broadcast('dataFromClient', data); // sends to all connected clients who are listening to message 'dataFromClient'
}


server.listen(8000, "0.0.0.0");
console.log("Now listening on port 8000");
```