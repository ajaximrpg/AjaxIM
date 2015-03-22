#!/usr/bin/env node
var express = require('express'),
    app = express(),
    http = require('http').Server(app),
//    io = require('socket.io')(http), // uncomment to enable Socket.IO
    bodyParser = require('body-parser'),
    sys = require('sys'),
    o_ = require('./libs/utils');

o_.merge(global, require('./settings'));
try { o_.merge(global, require('./settings.local')); } catch(e) {}

var reapInterval = (typeof io === 'undefined')? 60 * 1000: -1;

//app.set('env', 'development');
app.use(require('method-override')());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: true}));
var mw = require('./middleware/im')({
    maxAge: 60 * 1000,
    reapInterval: reapInterval,
    authentication: require('./libs/authentication/' + AUTH_LIBRARY)
});
app.use(mw.session);
var store = mw.store;

app.set('root', __dirname);

if ('development' == app.get('env')) {
    app.set('views', __dirname + '/dev/views');
    app.set('view engine', 'jade');
    
    app.use(require("morgan")('combined'));
    require('./dev/app')('/dev', app);
    app.use(express.static(
                require('path').join(__dirname, '../client')));
    app.use(require('express-error-handler')({dumpExceptions: true, showStack: true}));
}

// Socket.IO handlers
if (typeof io !== 'undefined') {
    io.on('connection', function(socket){
        var username = null;
        socket.on('server', function(event) {
            event.reply = function(status) {
                if (status) {
                    this._status = status;
                }
                delete this.reply;
                socket.emit('client', this);
            };
            var unauthenticated = function() {
                event.reply({sent: false, e: 'unauthenticated'});
            };
            store.get(event, function(event, user) {
                if ((event.type == 'hello') && user) {
                    username = user.data('username');
                    store.set(username, user);
                    event.reply({sent: true});
                } else if ((event.type != 'hello')) {
                    store.find('username', event.from, function(from) {
                        if (from) {
                            from.dispatch(event);
                        } else {
                            unauthenticated();
                        }
                    });
                } else {
                    unauthenticated();
                }
            }, socket);
        });
        socket.on('disconnect', function() {
            if (username) {
                store.reap(username);
            }
        });
    });
}

http.listen(APP_PORT, APP_HOST, function(){
    console.log('Ajax IM server started...');
});

// Listener endpoint; handled in middleware
app.get('/app/listen', function(){});

// HTTP handlers
app.use('/app/noop', function(req, res) {
    req.event._status = {sent: true};
    res.jsonp(req.event);
});

app.use('/app/message', function(req, res) {
    res.message();
});

app.use('/app/message/typing', function(req, res) {
    res.typing();
});

app.use('/app/status', function(req, res) {
    res.status();
});

app.use('/app/signoff', function(req, res) {
    res.signOff();
});
