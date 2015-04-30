// require variables to be declared
"use strict";

// node: built-in
var fs    = require('fs');     // file system
var http  = require('http');   // http server
var path  = require('path');   // file paths

// custom node modules
var WebSocketIO         = require('../../websocketio');     // creates WebSocket server and clients

var publicDirectory = "public";

var server = http.createServer(function(req, res) {
	if (req.url === "/") req.url = "/index.html";
    var stream = fs.createReadStream(path.join(__dirname, publicDirectory, req.url));
    stream.on('error', function() {
        res.writeHead(404);
        res.end();
    });
    stream.pipe(res);
});

var wsioServer = new WebSocketIO.Server({server: server});
wsioServer.onconnection(openWebSocketClient);


function openWebSocketClient(wsio) {
	console.log("Client connect: "+ wsio.id);
	wsio.onclose(closeWebSocketClient);

	wsio.on('requestStringMessage', wsRequestStringMessage);
	wsio.on('requestBinaryMessage', wsRequestBinaryMessage);
}

function closeWebSocketClient(wsio) {
	console.log("Client disconnect: "+ wsio.id);
}

function wsRequestStringMessage(wsio, data) {
	console.log(data);
	
	var message = {
		type: "rectangle",
		geometry: [
			data.x,
			data.y,
			data.w,
			data.h
		]
	};

	wsio.emit('stringMessage', message);
}

function wsRequestBinaryMessage(wsio, data) {
	console.log(data);

	var i;
	var triple = [];
	for (i=0; i<data.length; i++) {
		triple.push(Math.min(3*data[i], 255));
	}
	var message = new Buffer(triple);

	wsio.emit('binaryMessage', message);
}


// start the HTTP server
server.listen(8000, "0.0.0.0");
console.log("Now listening on port 8000");
