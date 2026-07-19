// =============================================
// ConvoyMP Multiplayer Engine (Firebase RTDB)
// =============================================

var MP = (function() {

    var rtdb = null;
    var serverId = 'eu1';
    var localPlayer = null;
    var connected = false;
    var listeners = {};
    var playerRefs = {};
    var chatRef = null;
    var playersRef = null;
    var convoyRef = null;
    var positionInterval = null;

    var SERVERS = {
        'eu1': { name: 'Europe 1', location: 'Frankfurt, DE', region: 'EU', maxPlayers: 200 },
        'eu2': { name: 'Europe 2', location: 'Amsterdam, NL', region: 'EU', maxPlayers: 200 },
        'uk1': { name: 'UK 1', location: 'London, UK', region: 'EU', maxPlayers: 100 },
        'us1': { name: 'US East 1', location: 'New York, US', region: 'US', maxPlayers: 200 },
        'us2': { name: 'US West 1', location: 'Los Angeles, US', region: 'US', maxPlayers: 200 },
    };

    // =============================================
    // INIT
    // =============================================
    function init() {
        try {
            rtdb = firebase.database();
        } catch(e) {
            console.error('Firebase RTDB not available. Add firebase-database SDK.', e);
            return false;
        }
        return true;
    }

    // =============================================
    // CONNECT TO SERVER
    // =============================================
    function connect(server, playerData) {
        if (!rtdb) { console.error('RTDB not initialized'); return; }
        if (!playerData || !playerData.uid) { console.error('Player data required'); return; }

        serverId = server || 'eu1';
        localPlayer = {
            uid: playerData.uid,
            username: playerData.username || 'Unknown',
            convoyId: playerData.convoyId || 'CMP-XXXXX',
            x: 0, y: 0, z: 0,
            rx: 0, ry: 0, rz: 0,
            speed: 0, heading: 0,
            truck: 'default',
            trailer: '',
            lastUpdate: firebase.database.ServerValue.TIMESTAMP
        };

        playersRef = rtdb.ref('servers/' + serverId + '/players/' + localPlayer.uid);
        chatRef = rtdb.ref('servers/' + serverId + '/chat');
        connected = true;

        playersRef.set(localPlayer);
        playersRef.onDisconnect().remove();

        setupPlayerListeners();
        setupChatListener();

        emit('connected', { serverId: serverId, player: localPlayer });
    }

    // =============================================
    // DISCONNECT
    // =============================================
    function disconnect() {
        if (playersRef) {
            playersRef.remove();
            playersRef.off();
        }
        if (chatRef) chatRef.off();
        if (convoyRef) convoyRef.off();

        Object.keys(playerRefs).forEach(function(uid) {
            playerRefs[uid].off();
        });
        playerRefs = {};

        if (positionInterval) {
            clearInterval(positionInterval);
            positionInterval = null;
        }

        connected = false;
        localPlayer = null;
        emit('disconnected', {});
    }

    // =============================================
    // POSITION UPDATE
    // =============================================
    function updatePosition(data) {
        if (!connected || !playersRef || !localPlayer) return;

        localPlayer.x = data.x || 0;
        localPlayer.y = data.y || 0;
        localPlayer.z = data.z || 0;
        localPlayer.rx = data.rx || 0;
        localPlayer.ry = data.ry || 0;
        localPlayer.rz = data.rz || 0;
        localPlayer.speed = data.speed || 0;
        localPlayer.heading = data.heading || 0;
        localPlayer.truck = data.truck || 'default';
        localPlayer.trailer = data.trailer || '';
        localPlayer.lastUpdate = firebase.database.ServerValue.TIMESTAMP;

        playersRef.update({
            x: localPlayer.x,
            y: localPlayer.y,
            z: localPlayer.z,
            rx: localPlayer.rx,
            ry: localPlayer.ry,
            rz: localPlayer.rz,
            speed: localPlayer.speed,
            heading: localPlayer.heading,
            truck: localPlayer.truck,
            trailer: localPlayer.trailer,
            lastUpdate: localPlayer.lastUpdate
        });
    }

    // =============================================
    // PLAYER LISTENERS
    // =============================================
    function setupPlayerListeners() {
        var serverPlayersRef = rtdb.ref('servers/' + serverId + '/players');

        serverPlayersRef.on('child_added', function(snap) {
            var p = snap.val();
            var uid = snap.key;
            if (uid === localPlayer.uid) return;

            playerRefs[uid] = rtdb.ref('servers/' + serverId + '/players/' + uid);
            emit('player_joined', p);
        });

        serverPlayersRef.on('child_changed', function(snap) {
            var p = snap.val();
            var uid = snap.key;
            if (uid === localPlayer.uid) return;
            emit('player_update', p);
        });

        serverPlayersRef.on('child_removed', function(snap) {
            var uid = snap.key;
            if (uid === localPlayer.uid) return;
            delete playerRefs[uid];
            emit('player_left', { uid: uid });
        });
    }

    // =============================================
    // CHAT
    // =============================================
    function setupChatListener() {
        chatRef.orderByChild('timestamp').limitToLast(100).on('child_added', function(snap) {
            var msg = snap.val();
            msg._id = snap.key;
            emit('chat_message', msg);
        });
    }

    function sendChat(text, channel) {
        if (!connected || !chatRef || !localPlayer) return;
        if (!text || text.length > 500) return;

        var modResult = (typeof moderateText === 'function') ? moderateText(text) : { allowed: true };
        if (!modResult.allowed) return;

        var msg = {
            authorId: localPlayer.uid,
            authorName: localPlayer.username,
            convoyId: localPlayer.convoyId,
            text: text,
            channel: channel || 'global',
            timestamp: firebase.database.ServerValue.TIMESTAMP
        };

        chatRef.push(msg);
    }

    // =============================================
    // CONVOY SYSTEM
    // =============================================
    function createConvoy(name) {
        if (!connected || !localPlayer) return;

        var convoyId = 'convoy_' + localPlayer.uid;
        var convoyData = {
            id: convoyId,
            name: name || (localPlayer.username + "'s Convoy"),
            leaderId: localPlayer.uid,
            leaderName: localPlayer.username,
            maxMembers: 8,
            createdAt: firebase.database.ServerValue.TIMESTAMP
        };

        rtdb.ref('servers/' + serverId + '/convoys/' + convoyId).set(convoyData);
        rtdb.ref('servers/' + serverId + '/convoys/' + convoyId + '/members/' + localPlayer.uid).set(true);
        rtdb.ref('servers/' + serverId + '/convoys/' + convoyId + '/memberNames/' + localPlayer.uid).set(localPlayer.username);

        localPlayer.currentConvoy = convoyId;
        playersRef.update({ currentConvoy: convoyId });

        emit('convoy_created', convoyData);
    }

    function joinConvoy(convoyId) {
        if (!connected || !localPlayer || !convoyId) return;

        var convoyMemberRef = rtdb.ref('servers/' + serverId + '/convoys/' + convoyId + '/members/' + localPlayer.uid);
        convoyMemberRef.set(true);
        rtdb.ref('servers/' + serverId + '/convoys/' + convoyId + '/memberNames/' + localPlayer.uid).set(localPlayer.username);

        localPlayer.currentConvoy = convoyId;
        playersRef.update({ currentConvoy: convoyId });

        rtdb.ref('servers/' + serverId + '/convoys/' + convoyId).once('value', function(snap) {
            if (snap.exists()) emit('convoy_joined', snap.val());
        });
    }

    function leaveConvoy() {
        if (!connected || !localPlayer) return;

        var convoyId = localPlayer.currentConvoy;
        if (!convoyId) return;

        rtdb.ref('servers/' + serverId + '/convoys/' + convoyId + '/members/' + localPlayer.uid).remove();
        rtdb.ref('servers/' + serverId + '/convoys/' + convoyId + '/memberNames/' + localPlayer.uid).remove();

        localPlayer.currentConvoy = null;
        playersRef.update({ currentConvoy: null });

        rtdb.ref('servers/' + serverId + '/convoys/' + convoyId).once('value', function(snap) {
            var convoy = snap.val();
            if (convoy) {
                if (Object.keys(convoy.members || {}).length === 0) {
                    rtdb.ref('servers/' + serverId + '/convoys/' + convoyId).remove();
                } else if (convoy.leaderId === localPlayer.uid) {
                    var remaining = Object.keys(convoy.members);
                    if (remaining.length > 0) {
                        rtdb.ref('servers/' + serverId + '/convoys/' + convoyId + '/leaderId').set(remaining[0]);
                    }
                }
            }
        });

        emit('convoy_left', {});
    }

    function listenConvoy(convoyId) {
        if (convoyRef) convoyRef.off();
        if (!convoyId) return;

        convoyRef = rtdb.ref('servers/' + serverId + '/convoys/' + convoyId);
        convoyRef.on('value', function(snap) {
            if (snap.exists()) emit('convoy_update', snap.val());
        });
    }

    // =============================================
    // GET SERVERS
    // =============================================
    function getServers(callback) {
        var result = [];
        var count = 0;

        Object.keys(SERVERS).forEach(function(sid) {
            rtdb.ref('servers/' + sid + '/players').once('value', function(snap) {
                var playerCount = snap.numChildren();
                result.push({
                    id: sid,
                    name: SERVERS[sid].name,
                    location: SERVERS[sid].location,
                    region: SERVERS[sid].region,
                    maxPlayers: SERVERS[sid].maxPlayers,
                    playerCount: playerCount,
                    status: playerCount > 0 ? 'online' : 'online'
                });
                count++;
                if (count === Object.keys(SERVERS).length) {
                    if (callback) callback(result);
                    emit('server_list', result);
                }
            });
        });
    }

    // =============================================
    // GET NEARBY PLAYERS
    // =============================================
    function getNearbyPlayers(radius) {
        if (!connected || !localPlayer) return [];
        var r = radius || 5000;
        var nearby = [];
        var serverPlayersRef = rtdb.ref('servers/' + serverId + '/players');

        return new Promise(function(resolve) {
            serverPlayersRef.once('value', function(snap) {
                snap.forEach(function(child) {
                    var p = child.val();
                    if (child.key === localPlayer.uid) return;
                    var dx = localPlayer.x - p.x;
                    var dz = localPlayer.z - p.z;
                    var dist = Math.sqrt(dx * dx + dz * dz);
                    if (dist <= r) {
                        p._distance = Math.round(dist);
                        nearby.push(p);
                    }
                });
                resolve(nearby);
            });
        });
    }

    // =============================================
    // EVENT SYSTEM
    // =============================================
    function on(event, callback) {
        if (!listeners[event]) listeners[event] = [];
        listeners[event].push(callback);
    }

    function off(event, callback) {
        if (!listeners[event]) return;
        listeners[event] = listeners[event].filter(function(cb) { return cb !== callback; });
    }

    function emit(event, data) {
        if (!listeners[event]) return;
        listeners[event].forEach(function(cb) {
            try { cb(data); } catch(e) { console.error('Event error:', event, e); }
        });
    }

    // =============================================
    // STALE PLAYER CLEANUP (check every 30s)
    // =============================================
    function startCleanup() {
        setInterval(function() {
            if (!connected) return;
            var now = Date.now();
            var serverPlayersRef = rtdb.ref('servers/' + serverId + '/players');
            serverPlayersRef.once('value', function(snap) {
                snap.forEach(function(child) {
                    var p = child.val();
                    if (p.lastUpdate && (now - p.lastUpdate) > 120000) {
                        child.ref.remove();
                    }
                });
            });
        }, 30000);
    }

    // =============================================
    // PUBLIC API
    // =============================================
    return {
        init: init,
        connect: connect,
        disconnect: disconnect,
        updatePosition: updatePosition,
        sendChat: sendChat,
        createConvoy: createConvoy,
        joinConvoy: joinConvoy,
        leaveConvoy: leaveConvoy,
        listenConvoy: listenConvoy,
        getServers: getServers,
        getNearbyPlayers: getNearbyPlayers,
        on: on,
        off: off,
        startCleanup: startCleanup,
        isConnected: function() { return connected; },
        getLocalPlayer: function() { return localPlayer; },
        getServerId: function() { return serverId; },
        SERVERS: SERVERS
    };

})();
