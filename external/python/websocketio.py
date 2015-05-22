import tornado.ioloop
import tornado.websocket
import thread
import json
import numpy as np
from threading import Timer

class WebSocketIO:
	def __init__(self, address):
		self.ws = None
		self.openCallback = None
		self.ioloop = None
		self.address = address
		self.messages = {}
		self.aliasCount = 1
		self.remoteListeners = {"#WSIO#addListener": "0000"};
		self.localListeners = {"0000": "#WSIO#addListener"};
		
	def open(self, callback):
		tornado.websocket.websocket_connect(self.address, callback=self.on_open, on_message_callback=self.on_message)
		self.openCallback = callback
		
		try:
			self.ioloop = tornado.ioloop.IOLoop.instance()
			self.ioloop.start()
		except KeyboardInterrupt:
			print "exit"
    
	def on_open(self, ws):
		print "WebSocketIO> connected to " + self.address
		self.ws = ws.result()
		thread.start_new_thread(self.openCallback, ())
    
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
					else:
						self.messages[fName](msg['d']);
				else:
					print "WebSocketIO> No handler for message"

			else:
				data = np.fromstring(message, dtype=np.uint8, count=len(message))
				func = data[:4].tostring()
				fName = self.localListeners[func]
				buf = data[4:]
				self.messages[fName](buf)

	def on_close(self):
		print "WebSocketIO> socket closed"
		self.ioloop.stop()


	def on(self, name, callback):
		alias = "%04x" % self.aliasCount
		self.localListeners[alias] = name
		self.messages[name] = callback
		self.aliasCount += 1
		self.emit('#WSIO#addListener', {'listener': name, 'alias': alias});
	
	def emit(self, name, data, attempts=16):
		if name == None or name == "":
			print "WebsocketIO> Error: no message name specified"
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
			if attempts >= 0:
				t = Timer(0.004, self.emit, [name, data, attempts-1])
				t.start()
			else:
				print "WebSocketIO> Warning: not sending message, recipient has no listener (" + name + ")"
	