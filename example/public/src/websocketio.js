/**
 * Client socket object
 *
 * @class WebsocketIO
 */
class WebSocketIO {
    /**
     * @constructor
     * @param {String} url URL of the server
     */
    constructor(url) {
        if (url !== undefined && url !== null) {
            this.url = url;
        }
        else {
            let protocol = (window.location.protocol === 'https:') ? 'wss://' : 'ws://';
            this.url = protocol + window.location.host + '/' + window.location.pathname.split('/')[1];
        }
        this.ws = null;
        this.messages = {};
        this.outbound = {};
        this.aliasCount = 1;
        this.remoteListeners = {'#WSIO#addListener': '0000'};
        this.localListeners = {'0000': '#WSIO#addListener'};
    }
    
    /**
     * Open WebSocket connection and get callback when successful
     *
     * @method open
     * @param {Function} success function to execute after successful connection
     * @param {Function} error function to execute if error occurs during connection
     */
    open(success, error) {
        console.log('WebsocketIO> open', this.url);
        this.ws = new WebSocket(this.url);
		this.ws.binaryType = 'arraybuffer';
		if (success instanceof Function) {
            this.ws.onopen = success;
        }
        if (error instanceof Function) {
            this.ws.onerror = error;
        }
        
        // Handler when a message arrives
		this.ws.onmessage = (message) => {
            let f_name;
            // text message
			if (typeof message.data === 'string') {
				let msg = JSON.parse(message.data);
				f_name = this.localListeners[msg.f];
                if (f_name === undefined) {
					console.log('WebsocketIO> No handler for message');
				}
                else if (f_name === '#WSIO#addListener') {
                    this.remoteListeners[msg.d.listener] = msg.d.alias;
                    if (this.outbound.hasOwnProperty(msg.d.listener)) {
						let i;
						for (i = 0; i < this.outbound[msg.d.listener].length; i++) {
							this.emit(msg.d.listener, this.outbound[msg.d.listener][i]);
						}
						delete this.outbound[msg.d.listener];
					}
                }
                else {
                    this.messages[f_name](msg.d);
                }
            }
            else {
                let uint8 = new Uint8Array(message.data);
				let func  = String.fromCharCode(uint8[0]) +
							String.fromCharCode(uint8[1]) +
							String.fromCharCode(uint8[2]) +
							String.fromCharCode(uint8[3]);
				f_name = this.localListeners[func];
                let buffer = uint8.subarray(4, uint8.length);
				this.messages[f_name](buffer);
            }
        };
        
        // Triggered by unexpected close event
		this.ws.onclose = (evt) => {
			console.log('WebsocketIO> socket closed');
			if ('close' in this.messages) {
				this.messages.close(evt);
            }
		};
    }
    
    /**
     * Set a message handler for a given name
     *
     * @method on
     * @param {String} name name for the handler
     * @param {Function} callback handler to be called for a given name
     */
    on(name, callback) {
        let alias = ('0000' + this.aliasCount.toString(16)).substr(-4);
		this.localListeners[alias] = name;
		this.messages[name] = callback;
		this.aliasCount++;
		if(name !== 'close') {
            this.emit('#WSIO#addListener', {listener: name, alias: alias});
        }
    }
    
    /**
     * Send a message with a given name and payload (format> f:name d:payload)
     *
     * @method emit
     * @param {String} name name of the message (i.e. RPC)
     * @param {Object} data data to be sent with the message
     */
    emit(name, data) {
        if (name === undefined || name === null || name === '') {
			console.log('WebSocketIO> No message name specified');
			return;
		}

		let message;
		let alias;

		if (this.remoteListeners.hasOwnProperty(name)) {
			alias = this.remoteListeners[name];

			// Send binary data as array buffer
			if (data instanceof Uint8Array) {
				// build an array with the name of the function
				let func_name = new Uint8Array(4);
				func_name[0] = alias.charCodeAt(0);
				func_name[1] = alias.charCodeAt(1);
				func_name[2] = alias.charCodeAt(2);
				func_name[3] = alias.charCodeAt(3);
				message = new Uint8Array(4 + data.length);
				// copy the name of the function first
				message.set(func_name, 0);
				// then copy the payload
				message.set(data, 4);
				// send the message using websocket
				this.ws.send(message.buffer);
			}
			// Send data as JSON string
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
			setTimeout(() => {
				this.removeOutbound(name);
			}, 1000);
		}
    }
    
    /**
     * Remove an outbound message from the queue
     *
     * @method removeOutbound
     * @param {String} name name of the message (i.e. RPC)
     */
    removeOutbound(name) {
		if (this.outbound.hasOwnProperty(name) && this.outbound[name].length > 0) {
			console.log("WebsocketIO> Warning: not sending message, recipient has no listener (" + name + ")");
			this.outbound[name].splice(0, 1);
			if (this.outbound[name].length == 0) {
				delete this.outbound[name];
			}
		}
	}
    
    /**
     * Close WebSocket connection
     *
     * @method close
     */
    close() {
		// Disable onclose handler first
		this.ws.onclose = function () {};
		// Then close
		this.ws.close();
    }
}
