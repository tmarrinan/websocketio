//
//  websocketio.cpp
//
//  Created by Thomas Marrinan on 4/30/2015.
//


#include "websocketio.h"

WebSocketIO::WebSocketIO(std::string a) : address(a), aliasCount(1), m_open(false), m_done(false) {

    m_client.clear_access_channels(websocketpp::log::alevel::all);
    m_client.set_access_channels(websocketpp::log::alevel::app);
    m_client.init_asio();

    // Bind the handlers we are using
    using websocketpp::lib::placeholders::_1;
    using websocketpp::lib::placeholders::_2;
    using websocketpp::lib::bind;

    // Register our handlers
    m_client.set_socket_init_handler(bind(&WebSocketIO::on_socket_init, this, ::_1));
    m_client.set_message_handler(bind(&WebSocketIO::on_message, this, ::_1, ::_2));
    m_client.set_open_handler(bind(&WebSocketIO::on_open, this, ::_1));
    m_client.set_close_handler(bind(&WebSocketIO::on_close, this, ::_1));

    // Setup dictionaries for the protocol
    remoteListeners["#WSIO#addListener"] = "0000";
    localListeners["0000"] = "#WSIO#addListener";
}

void WebSocketIO::on_socket_init(websocketpp::connection_hdl hdl) {
    // init socket
}

void WebSocketIO::on_open(websocketpp::connection_hdl hdl) {
    m_client.get_alog().write(websocketpp::log::alevel::app, "WebSocketIO> connected to " + address);

    scoped_lock guard(m_lock);
    m_open = true;

    fprintf(stderr, "WebSocketIO> connected to %s\n", address.c_str());

    m_openCallback(this);
}

void WebSocketIO::on_close(websocketpp::connection_hdl hdl) {
    m_client.get_alog().write(websocketpp::log::alevel::app, "Connection closed");

    scoped_lock guard(m_lock);
    m_done = true;

    fprintf(stderr, "WebSocketIO> socket closed\n");
}

void WebSocketIO::on_fail(websocketpp::connection_hdl hdl) {
    m_client.get_alog().write(websocketpp::log::alevel::app, "Connection failed");

    scoped_lock guard(m_lock);
    m_done = true;
}

void WebSocketIO::on_message(websocketpp::connection_hdl hdl, message_ptr msg) {
    if (msg->get_opcode() == websocketpp::frame::opcode::text) {
        boost::property_tree::ptree json;
        std::istringstream iss(msg->get_payload());
        boost::property_tree::read_json(iss, json);

        std::string func = json.get<std::string>("f");
        if ( localListeners.find(func) != localListeners.end()) {
            // found the key
            std::string fName = localListeners[func];
            if (fName == "#WSIO#addListener") {
                std::string listener = json.get<std::string>("d.listener");
                std::string alias    = json.get<std::string>("d.alias");
                remoteListeners[listener] = alias;
            } else {
                boost::property_tree::ptree data = json.get_child("d");
                if (messages.find(fName) != messages.end()){
                    messages[fName](this, data);
                }
            }
        } else {
            fprintf(stderr, "WebSocketIO> No handler for message\n");
        }
    }
    else {
        std::string bin = msg->get_payload();
        std::string func = bin.substr(0, 4);
        if ( localListeners.find(func) != localListeners.end()) {
            std::string fName = localListeners[func];
            std::string data = bin.substr(4, bin.length()-1);
            if (messages_bin.find(fName) != messages_bin.end()){
                messages_bin[fName](this, reinterpret_cast<unsigned char*>(const_cast<char*>(data.c_str())), data.length());
            }
        } else {
            fprintf(stderr, "WebSocketIO> No handler for message\n");
        }
    }
}

void WebSocketIO::send_message(std::string msg) {
    if (!m_open) {
        return;
    }

    websocketpp::lib::error_code ec;
    m_client.send(m_hdl, msg, websocketpp::frame::opcode::text, ec);

    if (ec) {
        m_client.get_alog().write(websocketpp::log::alevel::app, "Send Error: "+ec.message());
    }
}

void WebSocketIO::send_binary(std::string msg2) {
    if (!m_open) {
        return;
    }

    websocketpp::lib::error_code ec;
    m_client.send(m_hdl, msg2, websocketpp::frame::opcode::binary, ec);

    if (ec) {
        m_client.get_alog().write(websocketpp::log::alevel::app, "Send Error: "+ec.message());
    }
}

void WebSocketIO::open(void (*callback)(WebSocketIO*)) {
    m_openCallback = callback;

    websocketpp::lib::error_code ec;
    client::connection_ptr con = m_client.get_connection(address, ec);

    if (ec) {
        m_client.get_alog().write(websocketpp::log::alevel::app, ec.message());
    }

    m_hdl = con->get_handle();
    m_client.connect(con);

    websocketpp::lib::thread asio_thread(&client::run, &m_client);

    boost::asio::io_service::work work(ios);
    ios.run();
}

void WebSocketIO::on(std::string name, void (*callback)(WebSocketIO*, boost::property_tree::ptree)) {
    char aliasstr[5];
    sprintf(aliasstr, "%04x", aliasCount);
    std::string alias = aliasstr;
    localListeners[alias] = name;
    messages[name] = callback;
    aliasCount++;

    boost::property_tree::ptree root;
    root.put<std::string>("listener", name);
    root.put<std::string>("alias", alias);
    emit("#WSIO#addListener", root);
}

void WebSocketIO::on(std::string name, void (*callback)(WebSocketIO*, unsigned char*, long)) {
    char aliasstr[5];
    sprintf(aliasstr, "%04x", aliasCount);
    std::string alias = aliasstr;
    localListeners[alias] = name;
    messages_bin[name] = callback;
    aliasCount++;

    boost::property_tree::ptree root;
    root.put<std::string>("listener", name);
    root.put<std::string>("alias", alias);
    emit("#WSIO#addListener", root);
}

void WebSocketIO::emit(std::string name, boost::property_tree::ptree data, int attempts) {
    if (remoteListeners.find(name) != remoteListeners.end()) {
        std::string alias = remoteListeners[name];

        boost::property_tree::ptree root;
        root.put<std::string>("f", alias);
        root.put_child("d", data);

        std::ostringstream oss;
        boost::property_tree::write_json(oss, root, false);
        send_message(oss.str());
    } else {
        if (attempts>=0) {
            boost::asio::deadline_timer* timer = new boost::asio::deadline_timer(ios);
            timer->expires_from_now(boost::posix_time::milliseconds(4));
            timer->async_wait(boost::bind(&WebSocketIO::emit, this, name, data, attempts-1));
            timers.push_back(timer);
        } else {
            fprintf(stderr, "WebSocketIO> Warning: not sending message, recipient has no listener (%s)\n", name.c_str());
        }
    }
}

void WebSocketIO::emit_binary(std::string name, unsigned char* data, long length, int attempts) {
    if (remoteListeners.find(name) != remoteListeners.end()) {
        std::string out = remoteListeners[name];
        out.append(std::string(reinterpret_cast<const char*>(data), length));
        send_binary(out);
    } else {
        if (attempts>=0) {
            boost::asio::deadline_timer* timer = new boost::asio::deadline_timer(ios);
            timer->expires_from_now(boost::posix_time::milliseconds(4));
            timer->async_wait(boost::bind(&WebSocketIO::emit_binary, this, name, data, length, attempts-1));
            timers.push_back(timer);
        } else {
            fprintf(stderr, "WebSocketIO> Warning: not sending message, recipient has no listener (%s)\n", name.c_str());
        }
    }
}
