import os
import sys
import inspect
import numpy as np

current= os.path.dirname(os.path.abspath(inspect.getfile(inspect.currentframe())))
parent = os.path.dirname(current)
sys.path.append(parent + '/external/python/')

from websocketio import *

wss = None
port = 8000
if len(sys.argv) > 1:
	port = int(sys.argv[1])

def main():
	global wss
	
	publicDir = current + "/public/"
	tornadoWebSerever = [(r"/(.*)", tornado.web.StaticFileHandler, {'path': publicDir}),]
	#wss = WebSocketIOServer()
	wss = WebSocketIOServer(handles=tornadoWebSerever, indexPath=publicDir)
	wss.onconnection(on_connection)

	print "Now listening on port " + str(port)
	wss.listen(port)

def on_connection(wsio):
	global wss

	wsio.onclose(on_close)
	setupListeners(wsio)

	wss.broadcast('stringMessage', {'broadcast': 'test'})

def on_close(wsio):
	print "connection closed " + wsio.id

def setupListeners(wsio):
	wsio.on('requestStringMessage', requestStringMessage);
	wsio.on('requestBinaryMessage', requestBinaryMessage);

def requestStringMessage(wsio, data):
	print data
	
	message = {
		'type': "rectangle",
		'geometry': [
			data['x'],
			data['y'],
			data['w'],
			data['h']
		]
	}

	wsio.emit('stringMessage', message)

def requestBinaryMessage(wsio, data):
	print data

	triple = [];
	for i in range(0, len(data)):
		triple.append(min(3*data[i], 255))
	message = np.array(triple, dtype=np.uint8);

	wsio.emit('binaryMessage', message)

main()
