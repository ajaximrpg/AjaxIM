var o_ = require('../../utils');
var User = require('../../../middleware/im/user');

exports.authenticate = function(store, event, callback) {
    // remove authentication from event
    var sessionid = event.sessionid;
    delete event.sessionid;

    // find the user
    var user = event.from? store.sessions[event.from]: undefined;

    // create, validate or reject user
    if (user) {
        // found the user so check authentication
        if (sessionid && (sessionid === user.data('sessionid'))) {
            event.from = user.data('username');
            callback(event, user);
        } else {
            event._status = {sent: false, e: 'not authenticated'};
            callback(event);
        }
    } else if (event.type == 'hello') {
        store.find('sessionid', sessionid, function(user) {
            if (user) {
                // relogin as same user
                event.from = user.data('username');
                callback(event, user);
            } else {
                // if no username requested, assign user name
                if (!event.from) {
                    event.from = 'username' + (++store.uid);
                }
                // everybody is your friend!
                var friends = o_.values(store.sessions).map(function(friend) {
                    return friend.data('username');
                });
                // you're even friends with yourself!
                friends.push(event.from);
                // create new user
                user = new User(store, {
                    username: event.from,
                    sessionid: sessionid,
                    displayname: 'John Smith',
                    otherinfo: 'any other relevant key/values'
                }, friends);
                callback(event, user);
            }
        });
    } else {
        event._status = {sent: false, e: 'not authenticated'};
        callback(event);
    }
};
