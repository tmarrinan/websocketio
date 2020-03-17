// SAGE2 is available for use under the SAGE2 Software License
//
// University of Illinois at Chicago's Electronic Visualization Laboratory (EVL)
// and University of Hawai'i at Manoa's Laboratory for Advanced Visualization and
// Applications (LAVA)
//
// See full text, terms and conditions in the LICENSE.txt included file
//
// Copyright (c) 2014

/**
 * Lightweight object around websocket, handles string and binary communication
 *
 * @module server
 * @submodule WebsocketIO
 * @requires ws
 */

// require variables to be declared
"use strict";

var WebSocket = require('ws');
var WebSocketServer = WebSocket.Server;

/**
 * Client socket object
 *
 * @class WebsocketIO
 * @constructor
 * @param ws {Object} ULR of the server or actual websocket
 * @param strictSSL {Bool} require or not SSL verification with a certiifcate
 * @param openCallback {Function} callback when the socket opens
 */
function WebSocketIO(ws, strictSSL, openCallback, logLevel) {
	if (typeof ws === "string")
		this.ws = new WebSocket(ws, null, {rejectUnauthorized: strictSSL});
	else
		this.ws = ws;

	this.id = "";

	var _this = this;
	this.messages = {};
	this.outbound = {};
	if (this.ws.readyState === 1) {
		this.remoteAddress = {address: this.ws._socket.remoteAddress, port: this.ws._socket.remotePort};
		this.id = this.remoteAddress.address + ":" + this.remoteAddress.port;
	}

	this.closeCallbacks = [];
	this.aliasCount = 1;
	this.logLevel = logLevel || "quiet"
	this.remoteListeners = {"#WSIO#addListener": "0000"};
	this.localListeners = {"0000": "#WSIO#addListener"};

	this.ws.on('error', function(err) {
		if (err.errno === "ECONNREFUSED") return; // do nothing
	});

	this.ws.on('open', function() {
		_this.ws.binaryType = "arraybuffer";
		_this.remoteAddress = {address: _this.ws._socket.remoteAddress, port: _this.ws._socket.remotePort};
		_this.id = _this.remoteAddress.address + ":" + _this.remoteAddress.port;
		if(openCallback !== null) openCallback();
	});

	this.ws.on('message', function(message) {
		var fName;
		if (typeof message === "string") {
			var msg = JSON.parse(message);
			fName = _this.localListeners[msg.f];
			if(fName === undefined) {
				if (_this.logLevel != "quiet")
					console.log("WebsocketIO>\tno handler for message");
			}

			// add lister to client
			else if(fName === "#WSIO#addListener") {
				_this.remoteListeners[msg.d.listener] = msg.d.alias;
				if (_this.outbound.hasOwnProperty(msg.d.listener)) {
					var i;
					for (i=0; i<_this.outbound[msg.d.listener].length; i++) {
						if (typeof _this.outbound[msg.d.listener][i] === "string") {
							_this.emitString(msg.d.listener, _this.outbound[msg.d.listener][i]);
						}
						else {
							_this.emit(msg.d.listener, _this.outbound[msg.d.listener][i]);
						}
					}
					delete _this.outbound[msg.d.listener];
				}
			}

			// handle message
			else {
				_this.messages[fName](_this, msg.d);
			}
		}
		else {
			var bufmessage = Buffer.from(message);
			var func  = String.fromCharCode(bufmessage[0]) +
						String.fromCharCode(bufmessage[1]) +
						String.fromCharCode(bufmessage[2]) +
						String.fromCharCode(bufmessage[3]);
			fName = _this.localListeners[func];
			var buf = bufmessage.slice(4, bufmessage.length);
			_this.messages[fName](_this, buf);
		}
	});

	this.ws.on('close', function() {
		for(var i=0; i<_this.closeCallbacks.length; i++) {
			_this.closeCallbacks[i](_this);
		}
	});
}

/**
* Setting a callback when the socket closes
*
* @method onclose
* @param callback {Function} function to execute after closing
*/
WebSocketIO.prototype.onclose = function(callback) {
	this.closeCallbacks.push(callback);
};

/**
* Set a message handler for a given name
*
* @method on
* @param name {String} name for the handler
* @param callback {Function} handler to be called for a given name
*/
WebSocketIO.prototype.on = function(name, callback) {
	var alias = ("0000" + this.aliasCount.toString(16)).substr(-4);
	this.localListeners[alias] = name;
	this.messages[name] = callback;
	this.aliasCount++;
	this.emit('#WSIO#addListener', {listener: name, alias: alias});
};

/**
* Send a message with a given name and payload (format> f:name d:payload)
*
* @method emit
* @param name {String} name of the message (i.e. RPC)
* @param data {Object} data to be sent with the message
*/
WebSocketIO.prototype.emit = function(name, data, attempts) {
	if (this.ws.readyState === 1) {
		if (name === null || name === "") {
			if (this.logLevel != "quiet")
				console.log("WebsocketIO>\tError, no message name specified");
			return;
		}

		var _this = this;
		var message;
		var alias;

		if (this.remoteListeners.hasOwnProperty(name)) {
			alias = this.remoteListeners[name];
			if (Buffer.isBuffer(data)) {
				var funcName = new Buffer(alias);
				message = Buffer.concat([funcName, data]);

				// double error handling
				try {
					this.ws.send(message, {binary: true, mask: false}, function(err){
						if (_this.logLevel != "quiet")
							if(err) console.log("WebsocketIO>\t---ERROR (ws.send)---", name);
							// else success
					});
				}
				catch(e) {
					if (_this.logLevel != "quiet")
						console.log("WebsocketIO>\t---ERROR (try-catch)---", name);
				}
			}
			else {
				message = {f: alias, d: data};

				// double error handling
				try {
					var msgString = JSON.stringify(message);
					this.ws.send(msgString, {binary: false, mask: false}, function(err){
						if (_this.logLevel != "quiet")
							if(err) console.log("WebsocketIO>\t---ERROR (ws.send)---", name);
							// else success
					});
				}
				catch(e) {
					if (_this.logLevel != "quiet")
						console.log("WebsocketIO>\t---ERROR (try-catch)---", name);
				}
			}
		}
		else {
			if (!this.outbound.hasOwnProperty(name)) {
				this.outbound[name] = [];
			}
			this.outbound[name].push(data);
			setTimeout(function() {
				_this.removeOutbound(name);
			}, 1000);
		}
	}
};

/**
* Removes outbound message from queue: called if no listener is registered after 1 sec
*
* @method removeOutbound
* @param name {String} name of sending message
*/
WebSocketIO.prototype.removeOutbound = function(name) {
	if (this.outbound.hasOwnProperty(name) && this.outbound[name].length > 0) {
		if (this.logLevel != "quiet")
			console.log("WebsocketIO>\tWarning: not sending message, recipient has no listener (" + name + ")");
		this.outbound[name].splice(0, 1);
		if (this.outbound[name].length == 0) {
			delete this.outbound[name];
		}
	}
};

/**
* Faster version for emit: No JSON stringigy and no check version
*
* @method emitString
* @param data {String} data to be sent as the message
*/
WebSocketIO.prototype.emitString = function(name, dataString, attempts) {
	if (this.ws.readyState === 1) {
		var _this = this;
		var message;
		var alias;

		if (this.remoteListeners.hasOwnProperty(name)) {
			alias = this.remoteListeners[name];
			message = "{\"f\":\"" + alias + "\",\"d\":" + dataString + "}";
			this.ws.send(message, {binary: false, mask: false});

		}
		else {
			if (!this.outbound.hasOwnProperty(name)) {
				this.outbound[name] = [];
			}
			this.outbound[name].push(dataString);
			setTimeout(function() {
				_this.removeOutbound(name);
			}, 1000);
		}
	}
};

/**
* Update the remote address of the client
*
* @method updateRemoteAddress
* @param host {String} hostname / ip address
* @param port {Integer} port number
*/
WebSocketIO.prototype.updateRemoteAddress = function(host, port) {
	if(typeof host === "string") this.remoteAddress.address = host;
	if(typeof port === "number") this.remoteAddress.port = port;
	this.id = this.remoteAddress.address + ":" + this.remoteAddress.port;
};


/**
 * Server socket object
 *
 * @class WebsocketIOServer
 * @constructor
 * @param data {Object} object containing .server or .port information
 */
function WebSocketIOServer(data) {
	if (data.server !== undefined)
		this.wss = new WebSocketServer({server: data.server, perMessageDeflate: false});
	else if(data.port !== undefined)
		this.wss = new WebSocketServer({port: data.port, perMessageDeflate: false});

	this.clients = {};
	this.logLevel = data.logLevel || "quiet";
}

/**
* Setting a callback when a connection happens
*
* @method onconnection
* @param callback {Function} function taking the new client (WebsocketIO) as parameter
*/
WebSocketIOServer.prototype.onconnection = function(callback) {
	var _this = this;
	this.wss.on('connection', function(ws) {
		ws.binaryType = "arraybuffer";

		var wsio = new WebSocketIO(ws, null, null, this.logLevel);
		wsio.onclose(function(closed) {
			delete _this.clients[closed.id];
		});
		_this.clients[wsio.id] = wsio;
		callback(wsio);
	});
};

WebSocketIOServer.prototype.broadcast = function(name, data) {
	var key;
	var alias;
	// send as binary buffer
	if (Buffer.isBuffer(data)) {
		for(key in this.clients) {
			this.clients[key].emit(name, data);
		}
	}
	// send data as JSON string
	else {
		var dataString = JSON.stringify(data);
		for(key in this.clients) {
			this.clients[key].emitString(name, dataString);
		}
	}
};



module.exports = WebSocketIO;
module.exports.Server = WebSocketIOServer;
