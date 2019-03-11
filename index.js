var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);

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
    for(i = 1; i <= usercap; i++){
        key = 'User'+i;
        if(users[key]['connected'] && users[key]['socketID'] === ID){
            // found active user with matching socketID
            return key;
        }
    // should never happen
    return '';
    }
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


    console.log(key+' has connected');
    // tell the client of their identity
    socket.emit('identity', JSON.stringify(users[key]));
    // emit list upon connection
    io.emit('Update User List', JSON.stringify(users));
    // announce connection
    io.emit('chat message', key + ' has connected.');
    // on disconnect
    socket.on('disconnect', function(){
        var key = find_key_from_id(socket.id);
        // free up user
        users[key]['connected'] =  false;
        users[key]['name'] = key;
        users[key]['socketID'] = '';
        
        io.emit('chat message', key + ' has disconnected.');
        console.log(key+' has disconnected');
    })
    socket.on('chat message', function(msg){
        io.emit('chat message', msg);
        console.log('message: ' + msg);
    })
    socket.on('command', function(msg){
        console.log('received: ' + msg);
        parts = [];
        // command
        parts[0] = msg.substr(0,msg.indexOf(' '));
        // value for command
        parts[1] = msg.substr(msg.indexOf(' ') + 1);
        if(parts[0] === "/nick"){
            // change nickname command detected
            // find user
            if (parts[1]){
                // check for availability
                if(function(a = parts[1]){
                    for(var item in users){
                        if(users[item]['name'] === a) return false;
                    }
                    return true;
                }){
                    // if available
                    var key = find_key_from_id(socket.id);
                    users[key]['name'] = parts[1];
                    //success msg
                    socket.emit('system message', 'You have successfully changed your nickname to: ' + users[key]['name']);
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
        } else if(parts[0] === "/nickcolor"){
            // change nickname's color command detected
            // check if parts[1] is valid input
            if(/^[0-9A-F]{6}$/i.test(parts[1])){
                // valid input
                var key = find_key_from_id(socket.id);
                users[key]['color'] = '#'+parts[1];
                // success msg
                socket.emit('system message', 'You have successfully changed your nickname colour to: #'+users[key]['color']);
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

http.listen(8000, function(){
    console.log('listening on *:8000');
});