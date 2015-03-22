var url = require('url'),
    Hub = require('./im/hub'),
    packages = require('../libs/packages'),
    o_ = require('../libs/utils');

module.exports = function setupHub(options) {
    options = options || {};

    var store = new Hub(options);

    return {store: store, session: function session(req, res, next) {
        req.sessionStore = store;

        // create the event object
        req.event = o_.extend({}, req.query, req.body, req.params);
        o_.deletekey(req.event, 'callback');
        o_.deletekey(req.event, '_');

        req.event.reply = function(status) {
            if (status) {
                this._status = status;
            }
            delete this.reply;
            res.jsonp(this);
        };

        var unauthenticated = function() {
            req.event.reply({sent: false, e: 'unauthenticated'});
        };

        // set event handlers to unauthenticated by default
        res.message = res.typing = res.status = res.signOff = unauthenticated;

        if(url.parse(req.url).pathname.substring(0, 5) === '/app/') {
            store.get(req.event, function(event, user) {
                if(!user) {
                    next();
                    return;
                }

                user.touch();
                if(url.parse(req.url).pathname === '/app/listen') {
                    req.connection.setTimeout(5 * 60 * 1000);
                    user.listener(res);
                    store.set(user.data('username'), user);

                    if(msg = user.message_queue.shift()) {
                        user._send.apply(user, msg);
                    }
                } else {
                    req.event.from = user.data('username');
                }

                res.message = function() {
                    user.message(req.event);
                };
                res.typing = function() {
                    if(~packages.TYPING_STATES.indexOf('typing' + req.event.state)) {
                        store.find('username', req.event.to, function(to) {
                            if(to) {
                                req.event.status = 'typing' + req.event.state;
                                user.message(req.event);
                            } else {
                                // Typing updates do not receive confirmations,
                                // as they are not important enough.
                                req.event.reply({sent: true});
                            }
                        });
                    } else {
                        req.event.reply({sent: false, e: 'invalid state'});
                    }
                };
                res.status = function() {
                    user.status(req.event);
                };
                res.signOff = function() {
                    user.signOff(req.event);
                };

                if(url.parse(req.url).pathname !== '/app/listen') {
                    next();
                }
            });
        } else {
            next();
        }
    }};
};
