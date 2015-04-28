import sys
import numpy as np
from websocketio import *

wsio = None
address = "ws://localhost:8000"
if len(sys.argv) > 1:
	address = str(sys.argv[1])

def main():
	global wsio
	
	wsio = WebSocketIO(address)
	wsio.open(on_open) # starts in new thread, and waits indefinitely to listen

def on_open():
	global wsio

	print "open websocket";
	setupListeners()

	obj = {'x': 10, 'y': 20, 'w': 200, 'h': 150};
	bin = np.array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], dtype=np.uint8);
	wsio.emit('requestStringMessage', obj); # sends JSON object as string
	wsio.emit('requestBinaryMessage', bin); # send uint8 array as binary buffer

def setupListeners():
	global wsio

	wsio.on('stringMessage', stringMessage);
	wsio.on('binaryMessage', binaryMessage);

def stringMessage(data):
	print data

def binaryMessage(data):
	print data


main()
