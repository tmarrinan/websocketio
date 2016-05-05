import tornado.websocket
import tornado.ioloop
import tornado.httpserver
import tornado.web
import socket
import thread
import json
import numpy as np
from threading import Timer

class WebSocketIO:
	def __init__(self, address):
		self.ws = None
		self.address = None
		self.id = None
		self.openCallback = None
		self.closeCallback = None
		self.ioloop = None
		self.messages = {}
		self.outbound = {}
		self.aliasCount = 1
		self.remoteListeners = {"#WSIO#addListener": "0000"}
		self.localListeners = {"0000": "#WSIO#addListener"}
		if isinstance(address, str):
			self.address = address
		else:
			self.ws = address
			remoteAddress = self.ws.stream.socket.getpeername()
			self.id = remoteAddress[0] + ":" + str(remoteAddress[1])
	
	def open(self, callback):
		try:
			self.ioloop = tornado.ioloop.IOLoop.instance()
			tornado.websocket.websocket_connect(self.address, io_loop=self.ioloop, callback=self.on_open, on_message_callback=self.on_message)
			self.openCallback = callback
			self.ioloop.start()
		except KeyboardInterrupt:
			print "exit"

	def onclose(self, callback):
		self.closeCallback = callback;
    
	def on_open(self, ws):
		print "WebSocketIO> connected to " + self.address
		self.ws = ws.result()
		self.ws.on_message = self.on_message
		remoteAddress = self.ws.stream.socket.getpeername()
		self.id = remoteAddress[0] + ":" + str(remoteAddress[1])
		self.openCallback(self)
		#thread.start_new_thread(self.openCallback, (self,))
    
	def on_message(self, message):
		if message == None:
			self.on_close()
		else:
			if message.startswith('{') and message.endswith('}'):
				msg = json.loads(message)
				if msg['f'] in self.localListeners:
					fName = self.localListeners[msg['f']]
					if fName == "#WSIO#addListener":
						self.remoteListeners[msg['d']['listener']] = msg['d']['alias']
						if msg['d']['listener'] in self.outbound:
							for i in range(0, len(self.outbound[msg['d']['listener']])):
								if isinstance(self.outbound[msg['d']['listener']][i], str):
									self.emitString(msg['d']['listener'], self.outbound[msg['d']['listener']][i])
								else:
									self.emit(msg['d']['listener'], self.outbound[msg['d']['listener']][i])
							del self.outbound[msg['d']['listener']]
					else:
						self.messages[fName](self, msg['d']);
				else:
					print "WebSocketIO> No handler for message"

			else:
				data = np.fromstring(message, dtype=np.uint8, count=len(message))
				func = data[:4].tostring()
				fName = self.localListeners[func]
				buf = data[4:]
				self.messages[fName](self, buf)

	def on_close(self):
		print "WebSocketIO> socket closed"
		if self.closeCallback != None:
			self.closeCallback(self)
		self.ioloop.stop()


	def on(self, name, callback):
		alias = "%04x" % self.aliasCount
		self.localListeners[alias] = name
		self.messages[name] = callback
		self.aliasCount += 1
		self.emit('#WSIO#addListener', {'listener': name, 'alias': alias})


	def emit(self, name, data):
		if name == None or name == "":
			print "WebSocketIO> Error: no message name specified"
			return

		if name in self.remoteListeners:
			alias = self.remoteListeners[name]
			if isinstance(data, np.ndarray):
				funcName = np.fromstring(alias, dtype=np.uint8, count=4)
				message = np.concatenate([funcName, data])
				self.ws.write_message(message.tostring(), binary=True)
			else:
				message = {'f': alias, 'd': data}
				self.ws.write_message(json.dumps(message))
		else:
			if not name in self.outbound:
				self.outbound[name] = [];
			self.outbound[name].append(data);
			t = Timer(1.000, self.removeOutbound, [name])
			t.start()

	def removeOutbound(self, name):
		if name in self.outbound and len(self.outbound[name]) > 0:
			print "WebSocketIO> Warning: not sending message, recipient has no listener (" + name + ")"
			del self.outbound[name][0]
			if len(self.outbound[name]) == 0:
				del self.outbound[name]

	def emitString(self, name, dataString, attempts=16):
		if name == None or name == "":
			print "WebsocketIO> Error: no message name specified"
			return

		if name in self.remoteListeners:
			alias = self.remoteListeners[name]
			message = "{\"f\":\"" + alias + "\",\"d\":" + dataString + "}"
			self.ws.write_message(message)
		else:
			if not name in self.outbound:
				self.outbound[name] = [];
			self.outbound[name].append(dataString);
			t = Timer(1.000, self.removeOutbound, [name])
			t.start()

class WSIOHandler(tornado.websocket.WebSocketHandler):
	clients = {}
	connectCallback = None
	public = None

	def __init__(self, *args, **kwargs):
		super(WSIOHandler, self).__init__(*args, **kwargs)
		self.ws = None

	def get(self):
		if self.request.headers.get("Upgrade", "").lower() == "websocket":
			super(WSIOHandler, self).get()
		else:
			if self.public != None:
				self.render(self.public + "/index.html")

	def open(self):
		self.ws = WebSocketIO(self)
		self.clients[self.ws.id] = self.ws
		self.connectCallback(self.ws)

	def on_message(self, message):
		self.ws.on_message(message)

	def on_close(self):
		if self.ws.closeCallback != None:
			self.ws.closeCallback(self.ws)
		del self.clients[self.ws.id]


class WebSocketIOServer:

	def __init__(self, publicWebDirectory=None):
		if publicWebDirectory == None:
			self.application = tornado.web.Application([(r"/", WSIOHandler),])
		else:
			self.application = tornado.web.Application([(r"/", WSIOHandler), (r"/(.+)", tornado.web.StaticFileHandler, {'path': publicWebDirectory + "/"})])
		self.http_server = tornado.httpserver.HTTPServer(self.application)
		self.ioloop = None
		self.connectionCallback = None
		WSIOHandler.connectCallback = self.newconnection
		WSIOHandler.public = publicWebDirectory

	def listen(self, port):
		self.http_server.listen(port)
		try:
			self.ioloop = tornado.ioloop.IOLoop.instance()
			self.ioloop.start()
		except KeyboardInterrupt:
			print "exit"

	def newconnection(self, ws):
		if self.connectionCallback != None:
			self.connectionCallback(ws)

	def onconnection(self, callback):
		self.connectionCallback = callback

	def broadcast(self, name, data):
		if isinstance(data, np.ndarray):
			for key in WSIOHandler.clients:
				WSIOHandler.clients[key].emit(name, data)
		else:
			dataString = json.dumps(data)
			for key in WSIOHandler.clients:
				WSIOHandler.clients[key].emitString(name, dataString)
