var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var cookie = require('cookie');

app.get('/', function(req, res){
    res.sendFile(__dirname +'/index.html')
})

// user dict/obj
var users = {};
var usercapincrement = 3;
var usercap = usercapincrement;
var populate_user_list = function(start, end){
    for(i = start; i <= end; i++){
        var key = 'User'+i;
        users[key] = {};
        users[key]['connected'] = false;
        users[key]['name'] = key;
        users[key]['color'] = '#f4a142';
        users[key]['socketID'] = '';
}}

populate_user_list(1, usercap);

// utility function to find key from socket id
var find_key_from_id = function(ID){
    var key = '';
    var i;
    for(i = 1; i <= usercap; i++){
        key = 'User'+i;
        if(users[key]['connected'] && (users[key]['socketID'] === ID)){
            // found active user with matching socketID
            return key;
        }
    }
    // should never happen
    return '';
}

var get_timestamp = function(){
    var now = new Date();
    var time = [now.getHours(), now.getMinutes(), now.getSeconds()];
    return time
}

// utility function to check if requested name is taken
var check_if_name_avail = function(request){
    var key = '';
    var i;
    for(i = 1; i <= usercap; i++){
        key = 'User'+i;
        if(users[key]['name'] === request){
            // name taken
            return false;
        }
    }
    // when name is not taken
    return true;
}
// utility function to compose chat message from given key
var compose_chat_msg = function(key, message){
    time = get_timestamp();
    return '[' + time[0] + ':' + time[1] + '] ' + '<font color="'+users[key]['color']+'">'+ users[key]['name'] + '</font>: ' + message;
}
var compose_connection_msg = function(key,message){
    time = get_timestamp();
    return '[' + time[0] + ':' + time[1] + '] ' + '<font color="'+users[key]['color']+'">'+ users[key]['name'] + '</font> ' + message;
}
var compose_name_change_msg = function(key, name){
    time = get_timestamp();
    return '[' + time[0] + ':' + time[1] + '] ' + '<font color="'+users[key]['color']+'">'+ users[key]['name'] + '</font> has changed their name to <font color="' + users[key]['color'] + '">' + name + '</font>';
}
var compose_color_change_msg = function(key, color){
    time = get_timestamp();
    return '[' + time[0] + ':' + time[1] + '] ' + '<font color="'+users[key]['color']+'">'+ users[key]['name'] + '</font> has changed their color to <font color="#' + color + '">' + users[key]['name'] + '</font>';
}

var chat_log = [];
var chat_log_cap = 200;
// utility function that updates the saved chat log
var update_chat_log = function(message){
    // if chat log is already at cap 
    if (chat_log.length >= chat_log_cap) {
        chat_log.shift();
    }
    // append to chat log
    chat_log.push(message);
}
var compose_chat_log = function(){
    var i;
    var message = '';

    for(i = 0; i < chat_log.length; i++){
        message += '<li class="list-group-item" style="word-wrap: break-word;">'+chat_log[i];
    }
    return message;
}


io.on('connection', function(socket){
    // init
    // Find unused user
    var key = '';
    for(i = 1; i <= usercap; i++){
        key = 'User'+i;
        // found unused user
        if(!users[key]['connected']){
            users[key]['connected'] = true;
            users[key]['name'] = key;
            users[key]['socketID'] = socket.id;
            break;
        }
    }
    // expand as needed
    if((key === ('User'+usercap))&&(users[key]['connected'])&&(users[key]['socketID'] != socket.id)){
        key = 'User' + (usercap + 1);
        populate_user_list(usercap + 1 , usercap + usercapincrement);
        usercap += usercapincrement;
        users[key]['connected'] = true;
        users[key]['name'] = key;
        users[key]['socketID'] = socket.id;
    }

    // send saved chat log to client
    socket.emit('chat log', compose_chat_log());

    // cookie
    if(socket.handshake.headers.cookie){
        var socket_cookie = cookie.parse(socket.handshake.headers.cookie);
        console.log(cookie.parse(socket.handshake.headers.cookie));
        if(socket_cookie){
            if(socket_cookie['chat-name']){
                if(check_if_name_avail(socket_cookie['chat-name'])){
                    users[key]['name'] = socket_cookie['chat-name'];
                    socket.emit('system message', 'Welcome back, ' + users[key]['name'] + '.');
                } else socket.emit('system message', 'Your old nickname is already in use, a new nickname had been assigned to you.');
                users[key]['color'] = socket_cookie['chat-color'];
            }
        }
    }
    console.log(key+' has connected');
    // tell the client of their identity
    socket.emit('identity', JSON.stringify(users[key]));
    // emit list upon connection
    io.emit('Update User List', JSON.stringify(users));
    // announce connection
    io.emit('chat message', compose_connection_msg(key, 'has connected.'));
    // add to chatlog
    update_chat_log(compose_connection_msg(key, 'has connected.'));
    // on disconnect
    socket.on('disconnect', function(){
        var key = find_key_from_id(socket.id);
        // free up user
        users[key]['connected'] =  false;
        users[key]['name'] = key;
        users[key]['socketID'] = '';
        
        io.emit('chat message', compose_connection_msg(key, 'has disconnected.'));
        update_chat_log(compose_connection_msg(key, 'has disconnected.'));
        console.log(key+' has disconnected');
    })
    socket.on('chat message', function(msg){
        if(msg){ // only if message is not empty
            var message = compose_chat_msg(find_key_from_id(socket.id), msg);
            io.emit('chat message', message);
            update_chat_log(message);
            console.log('message: ' + message);
        }
    })
    socket.on('command', function(msg){
        console.log('received: ' + msg);
        parts = [];
        // command
        parts[0] = msg.substr(0,msg.indexOf(' '));
        // value for command
        parts[1] = msg.substr(msg.indexOf(' ') + 1);
        // check if change nick
        if(parts[0] === "/nick"){
            // change nickname command detected

            // find user
            if (parts[1].replace(/\s/g, '').length){
                // check for availability
                if(check_if_name_avail(parts[1])){
                    // if available
                    var key = find_key_from_id(socket.id);
                    // sucess, announce name change
                    io.emit('chat message', compose_name_change_msg(key, parts[1]));
                    // add to chatlog
                    update_chat_log(compose_name_change_msg(key, parts[1]));
                    // change name
                    users[key]['name'] = parts[1];
                    // emit identity
                    socket.emit('identity', JSON.stringify(users[key]));
                    // emit userlist? - TODO
                    io.emit('Update User List', JSON.stringify(users));
                }else{
                    // unavaibale
                    socket.emit('system message', 'The nickname is already taken, please choose another one.');
                }
                
            } else{
                // empty value 
                socket.emit('system message', 'Invalid input. Please follow the following format for changing your nickname: /nick \[new nickname\]');
            }
        // check if change nick color
        } else if(parts[0] === "/nickcolor"){
            // change nickname's color command detected
            // check if parts[1] is valid input
            if(/^[0-9A-F]{6}$/i.test(parts[1])){
                // valid input
                var key = find_key_from_id(socket.id);
                // sucess, announce name change
                io.emit('chat message', compose_color_change_msg(key, parts[1]));
                // add to chatlog
                update_chat_log(compose_color_change_msg(key, parts[1]));
                users[key]['color'] = '#'+parts[1];
                // emit identity
                socket.emit('identity', JSON.stringify(users[key]));
                // emit userlist? - TODO
                io.emit('Update User List', JSON.stringify(users));
            } else{
                // invalid input
                socket.emit('system message', 'Invalid input. Please follow the following format for changing nickname color: /nickcolor RRGGBB');
            }
        } else{
            // error / invalid command
            socket.emit('system message', 'Invalid command. The following command(s) are available:\n/nick \[new nickname\]\n/nickcolor RRGGBB');
        }
    })
})
const port=process.env.PORT || 3000
http.listen(port, function(){
    console.log('listening on *:8000');
});