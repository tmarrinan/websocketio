//
//  websocketIO.h
//  cefclient
//
//  websocketio.h
//
//  Created by Thomas Marrinan on 4/30/2015.
//

#ifndef WebSocketIO_h
#define WebSocketIO_h

#include <iostream>
#include <sstream>
#include <string>
#include <map>
#include <boost/property_tree/ptree.hpp>
#include <boost/property_tree/json_parser.hpp>
#include <boost/asio.hpp>
#include <boost/bind.hpp>

#include "websocketpp/websocketpp/config/asio_client.hpp"
#include "websocketpp/websocketpp/client.hpp"
#include "websocketpp/websocketpp/common/thread.hpp"

class WebSocketIO {
public:
    typedef websocketpp::client<websocketpp::config::asio_client> client;
    typedef websocketpp::config::asio_client::message_type::ptr message_ptr;
    typedef websocketpp::lib::shared_ptr<boost::asio::ssl::context> context_ptr;
    typedef websocketpp::lib::lock_guard<websocketpp::lib::mutex> scoped_lock;
    typedef client::connection_ptr connection_ptr;

private:
    int aliasCount;
    std::map<std::string, std::string> remoteListeners;
    std::map<std::string, std::string> localListeners;
    std::string address; 

    client m_client;
    websocketpp::connection_hdl m_hdl;
    websocketpp::lib::mutex m_lock;
    void (*m_openCallback)(WebSocketIO*);
    std::map<std::string, void ( *)(WebSocketIO*, boost::property_tree::ptree)> messages;
    std::map<std::string, void ( *)(WebSocketIO*, unsigned char*, long)> messages_bin;
    bool m_open;
    bool m_done;

    boost::asio::io_service ios;
    std::vector<boost::asio::deadline_timer*> timers;

public:
    WebSocketIO(std::string a);

    void on_socket_init(websocketpp::connection_hdl hdl);
    void on_open(websocketpp::connection_hdl hdl);
    void on_close(websocketpp::connection_hdl hdl);
    void on_fail(websocketpp::connection_hdl hdl);
    void on_message(websocketpp::connection_hdl hdl, message_ptr msg);
    void send_message(std::string msg);
    void send_binary(std::string msg);
    void open(void (*callback)(WebSocketIO*));

    void on(std::string name, void (*callback)(WebSocketIO*, boost::property_tree::ptree));
    void on(std::string name, void (*callback)(WebSocketIO*, unsigned char*, long));
    void emit(std::string name, boost::property_tree::ptree data, int attempts=16);
    void emit_binary(std::string name, unsigned char* data, long length, int attempts=16);

};


#endif // WebSocketIO_h
