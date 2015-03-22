var events = require('events'),
    sys = require('sys'),
    packages = require('../../libs/packages'),
    o_ = require('../../libs/utils'),
    User = require('./user');

var Hub = module.exports = function Hub(options) {
    this.uid = 0;
    this.events = new events.EventEmitter();
    this.auth = options.authentication;
    this.sessions = {};

    this.maxAge = options.maxAge || 4 * 60 * 60 * 1000;
    this.reapInterval = options.reapInterval || 60 * 1000;

    if(this.reapInterval !== -1) {
        setInterval(function(self) {
            self.reapCheck(self.maxAge);
        }, this.reapInterval, this);
    }

    this.events.addListener('update', o_.bind(function(event) {
        if(event.type == 'status' && event.status == 'offline') {
            var sids = Object.keys(this.sessions), sid, sess;
            for(sid in this.sessions) {
                sess = this.sessions[sid];
                if (sess.data('username') == event.from) {
                    if (sess.listeners.length) {
                        sess.send({type: 'goodbye'});
                    }
                    delete this.sessions[sid];
                    break;
                }
            }
        }
    }, this));
};

Hub.prototype.reapCheck = function(ms) {
    var threshold = +new Date - ms;
    var sids = Object.keys(this.sessions);
    for(var i = 0, len = sids.length; i < len; ++i) {
        var sid = sids[i];
        if(this.sessions[sid].lastAccess < threshold) {
            this.reap(sid);
        }
    }
};

Hub.prototype.reap = function(sid) {
    var sess = this.sessions[sid];
    console.log('reaping '+sess.data('username'));
    var event = {type: 'status', from: sess.data('username'), status: 'offline', message: ''};
    this.events.emit('update', event);
    delete this.sessions[sid];
    sess.close();
};

Hub.prototype.get = function(event, fn, socket) {
    this.auth.authenticate(this, event, o_.bind(function(event, user) {
        if (user) {
            if (socket) {
                user.socketio = socket;
            }
            if (this.sessions[user.data('username')]) {
                fn(event, user);
                return;
            }
            this.set(user.data('username'), user);
            var friends = user.friends;
            var friends_copy = friends.slice();
            o_.values(this.sessions).filter(function(friend) {
                return ~friends.indexOf(friend.data('username'));
            }).forEach(function(friend) {
                var username = friend.data('username');
                friends_copy[friends_copy.indexOf(username)] = [username, friend.status()];
            }, this);
            user._friends(friends_copy);
            user.events.addListener('status', o_.bind(function(value, message) {
                var event = {type: 'status', from: user.data('username'), status: value, message: message};
                this.events.emit('update', event);
            }, this));
            this.events.addListener('update', o_.bind(user.receivedUpdate, user));
            fn(event, user);
        } else {
            fn(event);
        }
    }, this));
};

Hub.prototype.set = function(sid, sess, fn) {
    this.sessions[sid] = sess;
    fn && fn();
};

Hub.prototype.find = function(key, value, fn) {
    for(var sid in this.sessions) {
        var session = this.sessions[sid];
        var user_value = session.data(key);
        if (user_value == value) {
            fn(session);
            return;
        }
    }
    fn(false);
};

Hub.prototype.dispatch = function(event) {
    this.find('username', event.from, function(from) {
        if (from) {
            from.dispatch(event);
        } else {
            event.reply({sent: false, e: 'not authenticated'});
        }
    });
};
