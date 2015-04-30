COMPILER=g++
INC=-I./ -I./websocketpp -I/usr/local/include
LIB=-L/usr/local/lib -L/Applications/Xcode.app/Contents/Developer/Platforms/MacOSX.platform/Developer/SDKs/MacOSX10.9.sdk/usr/lib
LIBRARIES=-lboost_system-mt -lboost_random-mt -lboost_thread-mt -lssl -lcrypto

all: websocketio.o index.o index

websocketio.o: websocketio.cpp websocketio.h
	$(COMPILER) -c -o websocketio.o websocketio.cpp $(INC)
	
index.o: index.cpp websocketio.h
	$(COMPILER) -c -o index.o index.cpp $(INC)

index: index.o websocketio.o
	$(COMPILER) -o index index.o websocketio.o $(INC) $(LIB) $(LIBRARIES)
	
clean:
	rm -f cppTest *.o