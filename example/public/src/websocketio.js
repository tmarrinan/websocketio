function WebSocketIO(url) {
	if (url !== undefined && url !== null) this.url = url;
	else this.url = (window.location.protocol === "https:" ? "wss" : "ws") + "://" + window.location.host + "/" + window.location.pathname.split("/")[1];

	this.ws = null;
	this.messages = {};
	this.outbound = {};
	this.aliasCount = 1;
	this.remoteListeners = {"#WSIO#addListener": "0000"};
	this.localListeners = {"0000": "#WSIO#addListener"};

	this.open = function(callback) {
		var _this = this;

		console.log('WebsocketIO> open', this.url);
		this.ws = new WebSocket(this.url);
		this.ws.binaryType = "arraybuffer";
		this.ws.onopen = callback;

		// Handler when a message arrives
		this.ws.onmessage = function(message) {
			var fName;
			// text message
			if (typeof message.data === "string") {
				var msg = JSON.parse(message.data);
				fName = _this.localListeners[msg.f];
				//console.log("WebsocketIO> received " + msg.f + "(" + fName + ")");
				if (fName === undefined) {
					console.log('WebsocketIO> No handler for message');
				}

				if (fName === "#WSIO#addListener") {
					_this.remoteListeners[msg.d.listener] = msg.d.alias;
					if (_this.outbound.hasOwnProperty(msg.d.listener)) {
						var i;
						for (i=0; i<_this.outbound[msg.d.listener].length; i++) {
							_this.emit(msg.d.listener, _this.outbound[msg.d.listener][i]);
						}
						delete _this.outbound[msg.d.listener];
					}
				}

				else {
					_this.messages[fName](msg.d);
				}
			}
			else {
				var uInt8 = new Uint8Array(message.data);
				var func  = String.fromCharCode(uInt8[0]) +
							String.fromCharCode(uInt8[1]) +
							String.fromCharCode(uInt8[2]) +
							String.fromCharCode(uInt8[3]);
				fName = _this.localListeners[func];
				var buffer = uInt8.subarray(4, uInt8.length);
				_this.messages[fName](buffer);
			}
		};
		// triggered by unexpected close event
		this.ws.onclose = function(evt) {
			console.log("WebsocketIO> socket closed");
			if ('close' in _this.messages)
				_this.messages.close(evt);
		};
	};

	this.on = function(name, callback) {
		var alias = ("0000" + this.aliasCount.toString(16)).substr(-4);
		this.localListeners[alias] = name;
		this.messages[name] = callback;
		this.aliasCount++;
		if(name === "close") return;
		this.emit('#WSIO#addListener', {listener: name, alias: alias});
	};

	this.emit = function(name, data, attempts) {
		if (name === null || name === "") {
			console.log("Error: no message name specified");
			return;
		}

		var _this = this;
		var message;
		var alias

		if (this.remoteListeners.hasOwnProperty(name)) {
			alias = this.remoteListeners[name];

			// send binary data as array buffer
			if (data instanceof Uint8Array) {
				// build an array with the name of the function
				var funcName = new Uint8Array(4);
				funcName[0] = alias.charCodeAt(0);
				funcName[1] = alias.charCodeAt(1);
				funcName[2] = alias.charCodeAt(2);
				funcName[3] = alias.charCodeAt(3);
				message = new Uint8Array(4 + data.length);
				// copy the name of the function first
				message.set(funcName, 0);
				// then copy the payload
				message.set(data, 4);
				// send the message using websocket
				this.ws.send(message.buffer);
			}
			// send data as JSON string
			else {
				message = {f: alias, d: data};
				this.ws.send(JSON.stringify(message));
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
	};

	this.removeOutbound = function(name) {
		if (this.outbound.hasOwnProperty(name) && this.outbound[name].length > 0) {
			console.log("WebsocketIO>\tWarning: not sending message, recipient has no listener (" + name + ")");
			this.outbound[name].splice(0, 1);
			if (this.outbound[name].length == 0) {
				delete this.outbound[name];
			}
		}
	}

	this.close = function() {
		// disable onclose handler first
		this.ws.onclose = function () {};
		// then close
		this.ws.close();
    };
}
