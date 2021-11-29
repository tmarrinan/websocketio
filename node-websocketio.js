/**
 * Lightweight object around websocket, handles string and binary communication
 *
 * @module WebsocketIO
 * @requires ws
 */

// require variables to be declared
"use strict";

const WebSocket = require('ws');
const WebSocketServer = WebSocket.Server;

/**
 * Client socket object
 *
 * @class WebsocketIO
 */ 
class WebSocketIO {
    /**
     * @constructor
     * @param {Object} ws URL of the server -or- actual websocket
     * @param {Bool} strictSSL require or not SSL verification with a certiifcate
     * @param {Function} openCallback callback when the socket opens
     * @param {String} logLevel set to 'quiet' to supress messages
     */
    constructor(ws, strictSSL, openCallback, logLevel) {
        if (typeof ws === 'string') {
            this.ws = new WebSocket(ws, null, {rejectUnauthorized: strictSSL});
        }
        else {
            this.ws = ws;
        }
    
        this.id = '';
    
        this.messages = {};
        this.outbound = {};
        if (this.ws.readyState === 1) {
            this.remoteAddress = {address: this.ws._socket.remoteAddress, port: this.ws._socket.remotePort};
            this.id = this.remoteAddress.address + ':' + this.remoteAddress.port;
        }
    
        this.closeCallbacks = [];
        this.aliasCount = 1;
        this.logLevel = logLevel || 'quiet'
        this.remoteListeners = {'#WSIO#addListener': '0000'};
        this.localListeners = {'0000': '#WSIO#addListener'};
    
        this.ws.on('error', (err) => {
            if (err.errno === 'ECONNREFUSED') {
                return; // do nothing
            }
        });
    
        this.ws.on('open', () => {
            this.ws.binaryType = 'arraybuffer';
            this.remoteAddress = {address: this.ws._socket.remoteAddress, port: this.ws._socket.remotePort};
            this.id = this.remoteAddress.address + ':' + this.remoteAddress.port;
            if (openCallback instanceof Function) {
                openCallback();
            }
        });
    
        this.ws.on('message', (message, isBinary) => {
            let fName;
            if (isBinary) {
                let bufmessage = Buffer.from(message);
                var func  = String.fromCharCode(bufmessage[0]) +
                            String.fromCharCode(bufmessage[1]) +
                            String.fromCharCode(bufmessage[2]) +
                            String.fromCharCode(bufmessage[3]);
                fName = this.localListeners[func];
                // function does not exist
                if (fName === undefined) {
                    if (this.logLevel !== 'quiet') {
                        console.log('WebsocketIO>  no handler for message');
                    }
                }
                // function for custom message
                else {
                    let buf = bufmessage.slice(4, bufmessage.length);
                    this.messages[fName](this, buf);
                }
            }
            else {
                let msg = JSON.parse(message.toString());
                fName = this.localListeners[msg.f];
                // function does not exist
                if (fName === undefined) {
                    if (this.logLevel !== 'quiet') {
                        console.log('WebsocketIO>  no handler for message');
                    }
                }
                // function for adding lister to client
                else if(fName === '#WSIO#addListener') {
                    this.remoteListeners[msg.d.listener] = msg.d.alias;
                    if (this.outbound.hasOwnProperty(msg.d.listener)) {
                        let i;
                        for (i = 0; i < this.outbound[msg.d.listener].length; i++) {
                            if (typeof this.outbound[msg.d.listener][i] === 'string') {
                                this.emitString(msg.d.listener, this.outbound[msg.d.listener][i]);
                            }
                            else {
                                this.emit(msg.d.listener, this.outbound[msg.d.listener][i]);
                            }
                        }
                        delete this.outbound[msg.d.listener];
                    }
                }
                // function for custom message
                else {
                    this.messages[fName](this, msg.d);
                }
            }
        });
    
        this.ws.on('close', (code, data) => {
            let i;
            for (i = 0; i < this.closeCallbacks.length; i++) {
                this.closeCallbacks[i](this);
            }
        });
    }

    /**
     * Setting a callback when the socket closes
     *
     * @method onclose
     * @param {Function} callback function to execute after closing
     */
    onclose(callback) {
        this.closeCallbacks.push(callback);
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
        this.emit('#WSIO#addListener', {listener: name, alias: alias});
    }

    /**
     * Send a message with a given name and payload (format> f:name d:payload)
     *
     * @method emit
     * @param {String} name name of the message (i.e. RPC)
     * @param {Object} data data to be sent with the message
     */
    emit(name, data) {
        if (this.ws.readyState === 1) {
            if (name === null || name === '') {
                if (this.logLevel !== 'quiet') {
                    console.log('WebsocketIO>  Error, no message name specified');
                }
                return;
            }

            let message;
            let alias;

            if (this.remoteListeners.hasOwnProperty(name)) {
                alias = this.remoteListeners[name];
                if (Buffer.isBuffer(data)) {
                    let funcName = Buffer.from(alias, 'utf8');
                    message = Buffer.concat([funcName, data]);

                    // double error handling
                    try {
                        this.ws.send(message, {binary: true, mask: false}, (err) => {
                            if (this.logLevel !== 'quiet' && err) {
                                console.log('WebsocketIO>  Error, ws.send() failed for ' + name);
                            }
                        });
                    }
                    catch(e) {
                        if (this.logLevel !== 'quiet') {
                            console.log('WebsocketIO>  Error, exception in ws.send() for ' + name);
                        }
                    }
                }
                else {
                    message = {f: alias, d: data};

                    // double error handling
                    try {
                        var msgString = JSON.stringify(message);
                        this.ws.send(msgString, {binary: false, mask: false}, (err) => {
                            if (this.logLevel !== 'quiet' && err)
                                console.log('WebsocketIO>  Error, ws.send() failed for ' + name);
                        });
                    }
                    catch(e) {
                        if (this.logLevel !== 'quiet') {
                            console.log('WebsocketIO>  Error, exception in ws.send() for ' + name);
                        }
                    }
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
        else {
            if (this.logLevel !== 'quiet') {
                console.log('WebsocketIO>  Error, cannot emit message before WebSocket connection established');
            }
        }
    }

    /**
     * Faster version for emit: No JSON stringigy and no check version
     *
     * @method emitString
     * @param {String} name of the message (i.e. RPC)
     * @param {String} dataString data to be sent with the message (pre-converted from Object to String)
     */
    emitString(name, dataString) {
        if (this.ws.readyState === 1) {
            let message;
            let alias;

            if (this.remoteListeners.hasOwnProperty(name)) {
                alias = this.remoteListeners[name];
                message = '{"f":"' + alias + '","d":' + dataString + '}';
                this.ws.send(message, {binary: false, mask: false});
            }
            else {
                if (!this.outbound.hasOwnProperty(name)) {
                    this.outbound[name] = [];
                }
                this.outbound[name].push(dataString);
                setTimeout(() => {
                    this.removeOutbound(name);
                }, 1000);
            }
        }
        else {
            if (this.logLevel !== 'quiet') {
                console.log('WebsocketIO>  Error, cannot emit message before WebSocket connection established');
            }
        }
    }

    /**
     * Removes outbound message from queue: called if no listener is registered after 1 sec
     *
     * @method removeOutbound
     * @param {String} name name of sending message
     */
    removeOutbound(name) {
        if (this.outbound.hasOwnProperty(name) && this.outbound[name].length > 0) {
            if (this.logLevel !== 'quiet') {
                console.log('WebsocketIO>  Warning: not sending message, recipient has no listener (' + name + ')');
            }
            this.outbound[name].splice(0, 1);
            if (this.outbound[name].length == 0) {
                delete this.outbound[name];
            }
        }
    }

    /**
     * Update the remote address of the client
     *
     * @method updateRemoteAddress
     * @param {String} host hostname / ip address
     * @param {Integer} port port number
     */
    updateRemoteAddress(host, port) {
        if (typeof host === 'string') this.remoteAddress.address = host;
        if (typeof port === 'number') this.remoteAddress.port = port;
        this.id = this.remoteAddress.address + ':' + this.remoteAddress.port;
    }
};


/**
 * Server socket object
 *
 * @class WebsocketIOServer
 */
class WebSocketIOServer {
    /**
     * @constructor
     * @param {Object} data object containing .server or .port information
     */
    constructor(data) {
        this.logLevel = data.logLevel || 'quiet';
        if (data.hasOwnProperty('server')) {
            this.wss = new WebSocketServer({server: data.server, perMessageDeflate: false});
        }
        else if(data.hasOwnProperty('port')) {
            this.wss = new WebSocketServer({port: data.port, perMessageDeflate: false});
        }
        else {
            this.wss = null;
            if (this.logLevel !== 'quiet') {
                console.log('WebSocketIO>  Error, could not create WebSocket server - no HTTP server or port specified');
            }
        }
        this.clients = {};
    }

    /**
     * Setting a callback when a connection happens
     *
     * @method onconnection
     * @param {Function} callback function taking the new client (WebsocketIO) as parameter
     */
    onconnection(callback) {
        this.wss.on('connection', (ws) => {
            ws.binaryType = 'arraybuffer';

            let wsio = new WebSocketIO(ws, null, null, this.logLevel);
            wsio.onclose((closed) => {
                delete this.clients[closed.id];
            });
            this.clients[wsio.id] = wsio;
            if (callback instanceof Function) {
                callback(wsio);
            }
        });
    }

    /**
     * Emit message to all clients
     * 
     * @method broadcast
     * @param {String} name name of the message (i.e. RPC)
     * @param {Object} data data to be sent with the message 
     */
    broadcast(name, data) {
        let key;
        // send as binary buffer
        if (Buffer.isBuffer(data)) {
            for(key in this.clients) {
                this.clients[key].emit(name, data);
            }
        }
        // send data as JSON string
        else {
            let dataString = JSON.stringify(data);
            for(key in this.clients) {
                this.clients[key].emitString(name, dataString);
            }
        }
    }
};

module.exports = WebSocketIO;
module.exports.Server = WebSocketIOServer;
