// ===== FIREBASE INIT =====
var firebaseConfig = {
    apiKey: "AIzaSyDewJ2KH5P_olxHebfhmh26SDgtz-vWaDY",
    authDomain: "convoymp-39bad.firebaseapp.com",
    projectId: "convoymp-39bad",
    storageBucket: "convoymp-39bad.firebasestorage.app",
    messagingSenderId: "485398650096",
    appId: "1:485398650096:web:c2b06c375c2e6e63a57635",
    measurementId: "G-RRHKQGKYKM"
};

firebase.initializeApp(firebaseConfig);
var auth = firebase.auth();
var db = firebase.firestore();

auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);

var currentUser = null;
var currentUserProfile = null;
var chatUnsubscribe = null;
var firstUserChecked = false;
var mpConnected = false;
var mpChatChannel = 'global';
var mpConvoyId = null;
var mpMapZoom = 1;
var mpMapCenterX = 0;
var mpMapCenterZ = 0;
var mpMapDragging = false;
var mpMapLastX = 0;
var mpMapLastZ = 0;

// ===== AI MODERATION =====
var bannedWords = [
    'nigger', 'nigga', 'faggot', 'fag', 'retard', 'cunt', 'kike',
    'spic', 'chink', 'wetback', 'tranny', 'homo', 'dyke',
    'kill yourself', 'kys', 'go die', 'i hope you die',
    'hacker', 'cheater', 'no life', 'trash'
];

function moderateText(text) {
    var lower = text.toLowerCase();
    for (var i = 0; i < bannedWords.length; i++) {
        if (lower.indexOf(bannedWords[i]) !== -1) {
            return { allowed: false, reason: 'Inappropriate language detected' };
        }
    }
    return { allowed: true };
}

// ===== CONVOYMP ID GENERATOR =====
function generateConvoyMPId() {
    var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    var id = 'CMP-';
    for (var i = 0; i < 5; i++) {
        id += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return id;
}

// ===== DOM READY =====
document.addEventListener('DOMContentLoaded', function() {

    var brand = document.querySelector('.nav-brand');
    if (brand) {
        brand.style.cursor = 'pointer';
        brand.addEventListener('click', function() { showPage('home'); });
    }

    auth.onAuthStateChanged(function(user) {
        currentUser = user;
        updateNavForAuth(user);
        if (user) {
            loadUserProfile(user.uid);
            checkFirstUser(user.uid);
        } else {
            currentUserProfile = null;
            firstUserChecked = false;
        }
    });

    document.getElementById('btn-register').addEventListener('click', registerUser);
    document.getElementById('btn-login').addEventListener('click', loginUser);
    document.getElementById('btn-google-login').addEventListener('click', loginWithGoogle);
    document.getElementById('btn-nav-logout').addEventListener('click', logoutUser);
    document.getElementById('btn-save-profile').addEventListener('click', saveProfile);
    document.getElementById('btn-submit-report').addEventListener('click', submitReport);
    document.getElementById('btn-submit-appeal').addEventListener('click', submitAppeal);
    document.getElementById('btn-create-news').addEventListener('click', createNewsPost);
    document.getElementById('btn-send-chat').addEventListener('click', sendChatMessage);
    document.getElementById('chat-input').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') sendChatMessage();
    });
    document.getElementById('btn-emoji').addEventListener('click', toggleEmojiPicker);

    var gameChatInput = document.getElementById('game-chat-input');
    if (gameChatInput) {
        gameChatInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') gameSendChat();
        });
    }


    document.getElementById('btn-search-player').addEventListener('click', function() {
        searchPlayers();
    });
    document.getElementById('player-search').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') searchPlayers();
    });

    loadHomeStats();

    if (typeof MP !== 'undefined') {
        MP.init();
        MP.startCleanup();
        setupMultiplayerEvents();
    }

    window.addEventListener('resize', function() {
        if (mpConnected) gameDrawMap();
    });
});


// ==========================================
// FIRST USER AUTO-ADMIN
// ==========================================

function checkFirstUser(uid) {
    if (firstUserChecked) return;
    firstUserChecked = true;

    db.collection('users').doc(uid).get().then(function(doc) {
        if (doc.exists) {
            var role = doc.data().role;
            if (role !== 'admin' && role !== 'moderator') {
                db.collection('users').where('role', '==', 'admin').get().then(function(snapshot) {
                    if (snapshot.size === 0) {
                        db.collection('users').doc(uid).update({ role: 'admin' });
                        currentUserProfile = currentUserProfile || {};
                        currentUserProfile.role = 'admin';
                        var adminBtn = document.getElementById('nav-admin-btn');
                        if (adminBtn) adminBtn.style.display = 'inline-block';
                        var newsForm = document.getElementById('admin-news-form');
                        if (newsForm) newsForm.style.display = 'block';
                    }
                });
            }
        }
    });
}


// ==========================================
// AUTH FUNCTIONS
// ==========================================

function registerUser() {
    var firstName = document.getElementById('reg-firstname').value.trim();
    var lastName = document.getElementById('reg-lastname').value.trim();
    var username = document.getElementById('reg-username').value.trim();
    var email = document.getElementById('reg-email').value.trim();
    var password = document.getElementById('reg-password').value;
    var confirm = document.getElementById('reg-confirm').value;
    var terms = document.getElementById('reg-terms').checked;
    var errorEl = document.getElementById('register-error');
    var successEl = document.getElementById('register-success');

    hideAlert(errorEl); hideAlert(successEl);

    if (!firstName || !lastName || !username || !email || !password) {
        showAlert(errorEl, 'Please fill in all fields.'); return;
    }
    if (password.length < 6) { showAlert(errorEl, 'Password must be at least 6 characters.'); return; }
    if (password !== confirm) { showAlert(errorEl, 'Passwords do not match.'); return; }
    if (!terms) { showAlert(errorEl, 'You must agree to the Terms of Service.'); return; }

    var modCheck = moderateText(username);
    if (!modCheck.allowed) { showAlert(errorEl, modCheck.reason); return; }

    var convoyId = generateConvoyMPId();

    auth.createUserWithEmailAndPassword(email, password)
        .then(function(cred) {
            return db.collection('users').doc(cred.user.uid).set({
                username: username, email: email, firstName: firstName,
                lastName: lastName, bio: '', steamId: '', role: 'user',
                convoyId: convoyId,
                distance: 0, jobsDone: 0, reportsSent: 0, isBanned: false,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        })
        .then(function() {
            showAlert(successEl, 'Account created! Your ConvoyMP ID: ' + convoyId);
            setTimeout(function() { showPage('account'); }, 2000);
        })
        .catch(function(err) { showAlert(errorEl, err.message); });
}

function loginUser() {
    var email = document.getElementById('login-email').value.trim();
    var password = document.getElementById('login-password').value;
    var errorEl = document.getElementById('login-error');
    var successEl = document.getElementById('login-success');
    hideAlert(errorEl); hideAlert(successEl);

    if (!email || !password) { showAlert(errorEl, 'Please enter email and password.'); return; }

    auth.signInWithEmailAndPassword(email, password)
        .then(function() {
            showAlert(successEl, 'Logged in!');
            setTimeout(function() { showPage('account'); }, 1000);
        })
        .catch(function(err) { showAlert(errorEl, err.message); });
}

function loginWithGoogle() {
    var provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider)
        .then(function(result) {
            return db.collection('users').doc(result.user.uid).get();
        })
        .then(function(doc) {
            if (!doc.exists) {
                var u = auth.currentUser;
                var convoyId = generateConvoyMPId();
                return db.collection('users').doc(u.uid).set({
                    username: u.displayName || '', email: u.email || '',
                    firstName: '', lastName: '', bio: '', steamId: '',
                    role: 'user', convoyId: convoyId,
                    distance: 0, jobsDone: 0, reportsSent: 0,
                    isBanned: false, createdAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            }
        })
        .then(function() { showPage('account'); })
        .catch(function(err) {
            showAlert(document.getElementById('login-error'), err.message);
        });
}

function logoutUser() {
    if (mpConnected) MP.disconnect();
    auth.signOut().then(function() {
        showPage('home');
    });
}

// ==========================================
// USER PROFILE
// ==========================================

function loadUserProfile(uid) {
    db.collection('users').doc(uid).get().then(function(doc) {
        if (doc.exists) {
            currentUserProfile = doc.data();
            currentUserProfile.uid = uid;

            if (!currentUserProfile.convoyId) {
                var newId = generateConvoyMPId();
                currentUserProfile.convoyId = newId;
                db.collection('users').doc(uid).update({ convoyId: newId });
            }

            populateProfile(currentUserProfile);
            checkAdminRole(currentUserProfile);
            updateNavUsername(currentUserProfile);
        }
    });
}

function updateNavUsername(profile) {
    var navUsername = document.getElementById('nav-username');
    if (navUsername) {
        navUsername.textContent = profile.username;
        navUsername.style.display = 'inline-block';
    }
}

function populateProfile(p) {
    var map = {
        'profile-username': p.username, 'profile-email': p.email,
        'profile-bio': p.bio, 'profile-firstname': p.firstName,
        'profile-lastname': p.lastName, 'profile-distance': p.distance || 0,
        'profile-jobs': p.jobsDone || 0, 'profile-reports': p.reportsSent || 0,
        'profile-bans': p.isBanned ? 1 : 0
    };
    for (var id in map) {
        var el = document.getElementById(id);
        if (!el) continue;
        if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') el.value = map[id] || '';
        else el.textContent = map[id];
    }

    var convoyEl = document.getElementById('profile-convoy-id');
    if (convoyEl) convoyEl.textContent = p.convoyId || 'N/A';

    var steamEl = document.getElementById('profile-steam');
    if (steamEl) steamEl.textContent = p.steamId ? 'Linked: ' + p.steamId : 'Not linked';

    var profilePreview = document.getElementById('profile-preview');
    if (profilePreview) {
        profilePreview.textContent = (p.username || '?').charAt(0).toUpperCase();
    }
}

function saveProfile() {
    if (!currentUser) return;
    var data = {
        firstName: document.getElementById('profile-firstname').value.trim(),
        lastName: document.getElementById('profile-lastname').value.trim(),
        bio: document.getElementById('profile-bio').value.trim()
    };
    var err = document.getElementById('profile-error');
    var ok = document.getElementById('profile-success');
    hideAlert(err); hideAlert(ok);

    db.collection('users').doc(currentUser.uid).update(data)
        .then(function() {
            showAlert(ok, 'Profile saved!');
            currentUserProfile = Object.assign(currentUserProfile, data);
        })
        .catch(function(e) { showAlert(err, e.message); });
}

function checkAdminRole(profile) {
    var adminBtn = document.getElementById('nav-admin-btn');
    var newsForm = document.getElementById('admin-news-form');
    if (profile.role === 'admin' || profile.role === 'moderator') {
        if (adminBtn) adminBtn.style.display = 'inline-block';
        if (newsForm) newsForm.style.display = 'block';
    }
}


// ==========================================
// PLAYER SEARCH
// ==========================================

function searchPlayers() {
    var query = document.getElementById('player-search').value.trim();
    var c = document.getElementById('player-search-results');
    if (!c) return;
    if (!query) { c.innerHTML = '<p style="color:#606070;">Type a username or ConvoyMP ID to search.</p>'; return; }

    c.innerHTML = '<p style="color:#606070;">Searching...</p>';

    var upperQuery = query.toUpperCase();

    Promise.all([
        db.collection('users').where('username', '>=', query).where('username', '<=', query + '\uf8ff').limit(20).get(),
        db.collection('users').where('convoyId', '==', upperQuery).limit(10).get()
    ]).then(function(results) {
        var seen = {};
        var html = '';
        var total = 0;

        results.forEach(function(snap) {
            snap.forEach(function(doc) {
                if (seen[doc.id]) return;
                seen[doc.id] = true;
                var u = doc.data();
                if (u.isBanned) return;
                total++;
                html += '<div class="player-card" onclick="viewPlayerProfile(\'' + doc.id + '\')">';
                html += '<div class="player-card-avatar">' + (u.username || '?').charAt(0).toUpperCase() + '</div>';
                html += '<div class="player-card-info">';
                html += '<div class="player-card-name">' + esc(u.username) + '</div>';
                html += '<div class="player-card-id">' + esc(u.convoyId) + '</div>';
                if (u.bio) html += '<div class="player-card-bio">' + esc(u.bio) + '</div>';
                html += '</div>';
                html += '</div>';
            });
        });

        if (total === 0) {
            c.innerHTML = '<p style="color:#606070;">No players found.</p>';
        } else {
            c.innerHTML = '<p style="color:#a0a0b0; margin-bottom:12px;">' + total + ' player(s) found</p>' + html;
        }
    }).catch(function(e) {
        c.innerHTML = '<p style="color:#e74c3c;">Search failed: ' + e.message + '</p>';
    });
}

function viewPlayerProfile(uid) {
    var c = document.getElementById('player-profile-view');
    if (!c) return;

    db.collection('users').doc(uid).get().then(function(doc) {
        if (!doc.exists) { c.innerHTML = '<p style="color:#e74c3c;">Player not found.</p>'; return; }
        var u = doc.data();
        var html = '<div class="card" style="text-align:center;">';

        html += '<div class="profile-avatar-placeholder">' + (u.username || '?').charAt(0).toUpperCase() + '</div>';

        html += '<h2 style="color:#fff;">' + esc(u.username) + '</h2>';
        html += '<p class="convoy-id-display" style="margin:8px auto;">' + esc(u.convoyId) + '</p>';

        if (u.firstName || u.lastName) {
            html += '<p style="color:#a0a0b0;">' + esc(u.firstName) + ' ' + esc(u.lastName) + '</p>';
        }
        if (u.bio) {
            html += '<p style="color:#a0a0b0; margin-top:12px;">' + esc(u.bio) + '</p>';
        }

        html += '<div class="card-grid" style="margin-top:20px;">';
        html += '<div class="card card-stat"><h3>' + (u.distance || 0) + '</h3><p>km Driven</p></div>';
        html += '<div class="card card-stat"><h3>' + (u.jobsDone || 0) + '</h3><p>Jobs Done</p></div>';
        html += '</div>';

        html += '<button class="btn-secondary" style="margin-top:16px;" onclick="document.getElementById(\'player-profile-view\').innerHTML=\'\'">Close</button>';
        html += '</div>';
        c.innerHTML = html;
    });
}


// ==========================================
// HOME STATS
// ==========================================

function loadHomeStats() {
    var el = document.getElementById('home-stats');
    if (!el) return;
    db.collection('users').get().then(function(s) {
        el.querySelector('[data-stat="users"]').textContent = s.size;
    }).catch(function() {});
}


// ==========================================
// REPORT FUNCTIONS
// ==========================================

function submitReport() {
    if (!currentUser) { showPage('login'); return; }
    var offender = document.getElementById('report-offender').value.trim();
    var server = document.getElementById('report-server').value;
    var rule = document.getElementById('report-rule').value;
    var datetime = document.getElementById('report-datetime').value;
    var desc = document.getElementById('report-description').value.trim();
    var err = document.getElementById('report-error');
    var ok = document.getElementById('report-success');
    hideAlert(err); hideAlert(ok);

    if (!offender || !server || !rule || !desc) { showAlert(err, 'Please fill in all fields.'); return; }

    var modCheck = moderateText(desc);
    if (!modCheck.allowed) { showAlert(err, modCheck.reason); return; }

    db.collection('reports').add({
        reporterId: currentUser.uid,
        reporterName: currentUserProfile ? currentUserProfile.username : 'Unknown',
        offenderName: offender, server: server, ruleBroken: rule,
        dateTime: datetime, description: desc, status: 'pending',
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        reviewedBy: null, result: null
    })
    .then(function() {
        showAlert(ok, 'Report submitted!');
        document.getElementById('report-offender').value = '';
        document.getElementById('report-description').value = '';
        db.collection('users').doc(currentUser.uid).update({ reportsSent: firebase.firestore.FieldValue.increment(1) });
        addLog('REPORT', 'Report filed against ' + offender);
    })
    .catch(function(e) { showAlert(err, e.message); });
}

function loadMyReports() {
    if (!currentUser) return;
    var c = document.getElementById('my-reports-list');
    if (!c) return;
    db.collection('reports').where('reporterId', '==', currentUser.uid).orderBy('createdAt', 'desc').get()
        .then(function(snap) {
            if (snap.empty) { c.innerHTML = '<tr><td colspan="4" style="color:#a0a0b0;text-align:center;padding:20px;">No reports found.</td></tr>'; return; }
            var html = '';
            snap.forEach(function(doc) {
                var r = doc.data();
                var sc = r.status === 'pending' ? 'badge-yellow' : 'badge-green';
                html += '<tr><td>' + formatDate(r.createdAt) + '</td><td>' + esc(r.offenderName) + '</td><td>' + esc(r.ruleBroken) + '</td><td><span class="badge ' + sc + '">' + esc(r.status) + '</span></td></tr>';
            });
            c.innerHTML = html;
        });
}


// ==========================================
// APPEAL FUNCTIONS
// ==========================================

function submitAppeal() {
    if (!currentUser) { showPage('login'); return; }
    var reason = document.getElementById('appeal-reason').value.trim();
    var explanation = document.getElementById('appeal-explanation').value.trim();
    var err = document.getElementById('appeal-error');
    var ok = document.getElementById('appeal-success');
    hideAlert(err); hideAlert(ok);

    if (!reason || !explanation) { showAlert(err, 'Please fill in all fields.'); return; }

    db.collection('appeals').add({
        userId: currentUser.uid,
        userName: currentUserProfile ? currentUserProfile.username : 'Unknown',
        banReason: reason, explanation: explanation, status: 'pending',
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        reviewedBy: null, response: null
    })
    .then(function() {
        showAlert(ok, 'Appeal submitted!');
        document.getElementById('appeal-reason').value = '';
        document.getElementById('appeal-explanation').value = '';
        addLog('APPEAL', 'Appeal submitted by ' + (currentUserProfile ? currentUserProfile.username : 'Unknown'));
    })
    .catch(function(e) { showAlert(err, e.message); });
}

function loadMyAppeals() {
    if (!currentUser) return;
    var c = document.getElementById('my-appeals-list');
    if (!c) return;
    db.collection('appeals').where('userId', '==', currentUser.uid).orderBy('createdAt', 'desc').get()
        .then(function(snap) {
            if (snap.empty) { c.innerHTML = '<tr><td colspan="3" style="color:#a0a0b0;text-align:center;padding:20px;">No appeals found.</td></tr>'; return; }
            var html = '';
            snap.forEach(function(doc) {
                var a = doc.data();
                var sc = a.status === 'pending' ? 'badge-yellow' : a.status === 'approved' ? 'badge-green' : 'badge-red';
                html += '<tr><td>' + formatDate(a.createdAt) + '</td><td>' + esc(a.banReason) + '</td><td><span class="badge ' + sc + '">' + esc(a.status) + '</span></td></tr>';
            });
            c.innerHTML = html;
        });
}


// ==========================================
// NEWS FUNCTIONS
// ==========================================

function createNewsPost() {
    var err = document.getElementById('news-error');
    var ok = document.getElementById('news-success');
    hideAlert(err); hideAlert(ok);

    if (!currentUser) { showAlert(err, 'You must be logged in.'); return; }
    if (!currentUserProfile) { showAlert(err, 'Profile not loaded. Please refresh the page.'); return; }
    if (currentUserProfile.role !== 'admin' && currentUserProfile.role !== 'moderator') {
        showAlert(err, 'You do not have permission to create news posts.'); return;
    }
    var title = document.getElementById('news-title').value.trim();
    var content = document.getElementById('news-content').value.trim();

    if (!title || !content) { showAlert(err, 'Please fill in all fields.'); return; }

    var modCheck = moderateText(title + ' ' + content);
    if (!modCheck.allowed) { showAlert(err, modCheck.reason); return; }

    saveNewsPost(title, content);
}

function saveNewsPost(title, content) {
    var ok = document.getElementById('news-success');
    var err = document.getElementById('news-error');
    return db.collection('news').add({
        title: title, content: content,
        authorId: currentUser.uid,
        authorName: currentUserProfile.username || currentUserProfile.displayName || 'Unknown',
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    })
    .then(function() {
        showAlert(ok, 'News post published!');
        document.getElementById('news-title').value = '';
        document.getElementById('news-content').value = '';
        addLog('NEWS', 'News post created: ' + title);
        loadNews();
    })
    .catch(function(e) { showAlert(err, e.message); });
}

function loadNews() {
    var c = document.getElementById('news-list');
    if (!c) return;
    db.collection('news').orderBy('createdAt', 'desc').get()
        .then(function(snap) {
            if (snap.empty) { c.innerHTML = '<p style="color:#a0a0b0;">No news posts yet.</p>'; return; }
            var html = '';
            snap.forEach(function(doc) {
                var n = doc.data();
                var nid = doc.id;
                html += '<div class="news-card">';
                html += '<div class="news-card-body">';
                html += '<div class="news-card-date">' + formatDate(n.createdAt) + ' &middot; ' + esc(n.authorName) + '</div>';
                html += '<h3 class="news-card-title">' + esc(n.title) + '</h3>';
                html += '<p class="news-card-excerpt">' + esc(n.content) + '</p>';
                html += '<a class="link-red" onclick="loadNewsComments(\'' + nid + '\')">Comments</a>';
                html += '<div id="comments-' + nid + '"></div>';
                html += '</div></div>';
            });
            c.innerHTML = html;
        });
}

function loadNewsComments(nid) {
    var c = document.getElementById('comments-' + nid);
    if (!c) return;
    if (c.innerHTML.trim() !== '') { c.innerHTML = ''; return; }

    db.collection('news').doc(nid).collection('comments').orderBy('createdAt', 'asc').get()
        .then(function(snap) {
            var html = '<div class="news-comments">';
            if (snap.empty) {
                html += '<p style="color:#606070; font-size:0.85rem;">No comments yet.</p>';
            }
            snap.forEach(function(doc) {
                var cm = doc.data();
                html += '<div class="comment-item">';
                html += '<span class="comment-author">' + esc(cm.authorName) + '</span>';
                html += '<span class="comment-time">' + formatDate(cm.createdAt) + '</span>';
                html += '<p class="comment-text">' + esc(cm.text) + '</p>';
                html += '</div>';
            });
            if (currentUser) {
                html += '<div style="display:flex; gap:8px; margin-top:8px;">';
                html += '<input type="text" id="comment-input-' + nid + '" class="comment-input" placeholder="Write a comment...">';
                html += '<button class="btn-primary" style="padding:8px 16px; font-size:0.85rem;" onclick="postComment(\'' + nid + '\')">Post</button>';
                html += '</div>';
            }
            html += '</div>';
            c.innerHTML = html;
        });
}

function postComment(nid) {
    if (!currentUser) return;
    var input = document.getElementById('comment-input-' + nid);
    if (!input) return;
    var text = input.value.trim();
    if (!text) return;

    var modCheck = moderateText(text);
    if (!modCheck.allowed) { alert(modCheck.reason); return; }

    db.collection('news').doc(nid).collection('comments').add({
        text: text, authorId: currentUser.uid,
        authorName: currentUserProfile ? currentUserProfile.username : 'Unknown',
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    })
    .then(function() {
        input.value = '';
        loadNewsComments(nid);
        setTimeout(function() { loadNewsComments(nid); }, 500);
    });
}


// ==========================================
// COMMUNITY CHAT
// ==========================================

function startChatListener() {
    if (chatUnsubscribe) { chatUnsubscribe(); chatUnsubscribe = null; }
    chatUnsubscribe = db.collection('chat').orderBy('createdAt', 'asc').limit(100)
        .onSnapshot(function(snap) {
            var c = document.getElementById('chat-messages');
            if (!c) return;
            var html = '';
            snap.forEach(function(doc) {
                var m = doc.data();
                var time = formatDate(m.createdAt);
                html += '<div class="chat-msg">';
                html += '<span class="chat-author">' + esc(m.authorName) + '</span>';
                html += '<span class="chat-time">' + time + '</span>';
                html += '<div class="chat-text">' + esc(m.text) + '</div>';
                html += '</div>';
            });
            c.innerHTML = html;
            c.scrollTop = c.scrollHeight;
        });
}

function stopChatListener() {
    if (chatUnsubscribe) { chatUnsubscribe(); chatUnsubscribe = null; }
}

function sendChatMessage() {
    if (!currentUser) { showPage('login'); return; }
    var input = document.getElementById('chat-input');
    if (!input) return;
    var text = input.value.trim();
    if (!text) return;

    var modCheck = moderateText(text);
    if (!modCheck.allowed) { alert(modCheck.reason); return; }

    db.collection('chat').add({
        text: text, type: 'text', url: '',
        authorId: currentUser.uid,
        authorName: currentUserProfile ? currentUserProfile.username : 'Unknown',
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    })
    .then(function() { input.value = ''; });
}

function toggleEmojiPicker() {
    var picker = document.getElementById('emoji-picker');
    if (!picker) return;
    picker.style.display = picker.style.display === 'none' || picker.style.display === '' ? 'block' : 'none';
}

function insertEmoji(emoji) {
    var input = document.getElementById('chat-input');
    if (!input) return;
    input.value += emoji;
    input.focus();
}


// ==========================================
// ADMIN FUNCTIONS
// ==========================================

function loadAdminData() {
    loadAdminStats();
    loadAdminUsers();
    loadAdminReports();
    loadAdminLogs();
    loadAdminAppeals();
}

function loadAdminStats() {
    var el = document.getElementById('admin-stats');
    if (!el) return;
    Promise.all([
        db.collection('users').get(),
        db.collection('reports').where('status', '==', 'pending').get(),
        db.collection('users').where('role', 'in', ['admin', 'moderator']).get()
    ]).then(function(r) {
        el.innerHTML =
            '<div class="card card-stat"><h3>' + r[0].size + '</h3><p>Total Users</p></div>' +
            '<div class="card card-stat"><h3>' + r[1].size + '</h3><p>Open Reports</p></div>' +
            '<div class="card card-stat"><h3>' + r[2].size + '</h3><p>Team Members</p></div>';
    });
}

function loadAdminUsers() {
    var c = document.getElementById('admin-users-list');
    if (!c) return;
    db.collection('users').orderBy('createdAt', 'desc').get()
        .then(function(snap) {
            if (snap.empty) { c.innerHTML = '<tr><td colspan="5" style="color:#606070;text-align:center;padding:20px;">No users.</td></tr>'; return; }
            var html = '';
            snap.forEach(function(doc) {
                var u = doc.data(); var uid = doc.id;
                var sb = u.isBanned ? '<span class="badge badge-red">Banned</span>' : '<span class="badge badge-green">Active</span>';
                var act = u.isBanned
                    ? '<a class="link-red" onclick="unbanUser(\'' + uid + '\')">Unban</a>'
                    : '<a class="link-red" onclick="banUser(\'' + uid + '\')">Ban</a>';
                html += '<tr><td>' + esc(u.username) + ' <span style="color:#e94560;font-family:monospace;font-size:0.8rem;">' + esc(u.convoyId) + '</span></td><td>' + esc(u.email) + '</td><td>' + esc(u.role) + '</td><td>' + sb + '</td><td>' + act + '</td></tr>';
            });
            c.innerHTML = html;
        });
}

function banUser(uid) {
    db.collection('users').doc(uid).update({ isBanned: true })
        .then(function() { addLog('BAN', 'User banned: ' + uid); loadAdminUsers(); });
}

function unbanUser(uid) {
    db.collection('users').doc(uid).update({ isBanned: false })
        .then(function() { addLog('UNBAN', 'User unbanned: ' + uid); loadAdminUsers(); });
}

function loadAdminReports() {
    var c = document.getElementById('admin-reports-list');
    if (!c) return;
    db.collection('reports').orderBy('createdAt', 'desc').get()
        .then(function(snap) {
            if (snap.empty) { c.innerHTML = '<tr><td colspan="6" style="color:#606070;text-align:center;padding:20px;">No reports.</td></tr>'; return; }
            var html = '';
            snap.forEach(function(doc) {
                var r = doc.data(); var rid = doc.id;
                var sc = r.status === 'pending' ? 'badge-yellow' : 'badge-green';
                html += '<tr><td>' + formatDate(r.createdAt) + '</td><td>' + esc(r.reporterName) + '</td><td>' + esc(r.offenderName) + '</td><td>' + esc(r.ruleBroken) + '</td><td><span class="badge ' + sc + '">' + esc(r.status) + '</span></td><td><a class="link-red" onclick="resolveReport(\'' + rid + '\')">Resolve</a></td></tr>';
            });
            c.innerHTML = html;
        });
}

function resolveReport(rid) {
    db.collection('reports').doc(rid).update({ status: 'resolved', reviewedBy: currentUser ? currentUser.uid : 'system' })
        .then(function() { addLog('REPORT_RESOLVED', 'Report resolved: ' + rid); loadAdminReports(); loadAdminStats(); });
}

function loadAdminAppeals() {
    var c = document.getElementById('admin-appeals-list');
    if (!c) return;
    db.collection('appeals').orderBy('createdAt', 'desc').get()
        .then(function(snap) {
            if (snap.empty) { c.innerHTML = '<tr><td colspan="5" style="color:#606070;text-align:center;padding:20px;">No appeals.</td></tr>'; return; }
            var html = '';
            snap.forEach(function(doc) {
                var a = doc.data(); var aid = doc.id;
                var sc = a.status === 'pending' ? 'badge-yellow' : a.status === 'approved' ? 'badge-green' : 'badge-red';
                html += '<tr><td>' + formatDate(a.createdAt) + '</td><td>' + esc(a.userName) + '</td><td>' + esc(a.banReason) + '</td><td><span class="badge ' + sc + '">' + esc(a.status) + '</span></td><td>';
                html += '<a class="link-red" onclick="resolveAppeal(\'' + aid + '\',\'approved\')">Approve</a> | ';
                html += '<a class="link-red" onclick="resolveAppeal(\'' + aid + '\',\'denied\')">Deny</a></td></tr>';
            });
            c.innerHTML = html;
        });
}

function resolveAppeal(aid, status) {
    db.collection('appeals').doc(aid).update({ status: status, reviewedBy: currentUser ? currentUser.uid : 'system', response: status === 'approved' ? 'Ban lifted' : 'Denied' })
        .then(function() { addLog('APPEAL_' + status.toUpperCase(), 'Appeal ' + aid + ' ' + status); loadAdminAppeals(); loadAdminStats(); });
}

function loadAdminLogs() {
    var c = document.getElementById('admin-logs-list');
    if (!c) return;
    db.collection('logs').orderBy('createdAt', 'desc').limit(50).get()
        .then(function(snap) {
            if (snap.empty) { c.innerHTML = '<p style="color:#a0a0b0;text-align:center;padding:20px;">No logs yet.</p>'; return; }
            var html = '';
            snap.forEach(function(doc) {
                var l = doc.data();
                html += '<div class="log-entry"><span class="log-time">' + formatDate(l.createdAt) + '</span><span class="log-action">' + esc(l.action) + '</span> ' + esc(l.details) + '</div>';
            });
            c.innerHTML = html;
        });
}

function addLog(action, details) {
    db.collection('logs').add({
        action: action, details: details,
        adminId: currentUser ? currentUser.uid : 'system',
        adminName: currentUserProfile ? currentUserProfile.username : 'system',
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
}


// ==========================================
// SERVER STATUS
// ==========================================

function loadServers() {
    var c = document.getElementById('servers-list');
    if (!c) return;
    db.collection('servers').orderBy('name').get()
        .then(function(snap) {
            if (snap.empty) { c.innerHTML = '<tr><td colspan="4" style="color:#606070;text-align:center;padding:20px;">No servers configured.</td></tr>'; return; }
            var html = '';
            snap.forEach(function(doc) {
                var s = doc.data();
                var sc = s.status === 'online' ? 'online' : s.status === 'busy' ? 'busy' : 'offline';
                html += '<tr><td>' + esc(s.name) + '</td><td>' + s.currentPlayers + ' / ' + s.maxPlayers + '</td><td>' + esc(s.location) + '</td><td><span class="status ' + sc + '">' + esc(s.status) + '</span></td></tr>';
            });
            c.innerHTML = html;
        });
}

function loadPlayerCount() {
    var el = document.getElementById('player-count');
    if (!el) return;
    db.collection('servers').where('status', '==', 'online').get()
        .then(function(snap) {
            var total = 0;
            snap.forEach(function(doc) { total += doc.data().currentPlayers || 0; });
            el.textContent = total.toLocaleString();
        });
}


// ==========================================
// NAVIGATION
// ==========================================

var navHighlightMap = {
    'account': 'nav-account-btn',
    'notifications': 'nav-account-btn',
    'report': 'nav-account-btn',
    'my-reports': 'nav-account-btn',
    'appeals': 'nav-account-btn',
    'my-appeals': 'nav-account-btn',
    'admin': 'nav-admin-btn',
    'admin-users': 'nav-admin-btn',
    'admin-reports': 'nav-admin-btn',
    'admin-appeals': 'nav-admin-btn',
    'admin-logs': 'nav-admin-btn',
    'game': 'nav-game'
};

function showPage(page) {
    var pages = document.querySelectorAll('.page');
    var links = document.querySelectorAll('.nav-links a');
    for (var i = 0; i < pages.length; i++) pages[i].classList.remove('active');
    for (var i = 0; i < links.length; i++) links[i].classList.remove('active');

    var t = document.getElementById('page-' + page);
    if (t) t.classList.add('active');

    var navId = navHighlightMap[page] || ('nav-' + page);
    var n = document.getElementById(navId);
    if (n) n.classList.add('active');

    window.scrollTo(0, 0);
    var nl = document.getElementById('nav-links');
    if (nl) nl.classList.remove('open');

    if (page === 'news') loadNews();
    if (page === 'servers') loadServers();
    if (page === 'account' && currentUser) loadUserProfile(currentUser.uid);
    if (page === 'my-reports') loadMyReports();
    if (page === 'my-appeals') loadMyAppeals();
    if (page === 'admin') loadAdminData();
    if (page === 'admin-users') loadAdminUsers();
    if (page === 'admin-reports') loadAdminReports();
    if (page === 'admin-logs') loadAdminLogs();
    if (page === 'admin-appeals') loadAdminAppeals();
    if (page === 'community') startChatListener();
    else stopChatListener();
    if (page === 'game' && mpConnected) gameDrawMap();
}

function toggleNav() {
    var nav = document.getElementById('nav-links');
    if (nav) nav.classList.toggle('open');
}

function switchTab(tabName, event) {
    var btn = event ? event.target : null;
    if (!btn) return;
    var parent = btn.closest('.page') || document;
    var contents = parent.querySelectorAll('.tab-content');
    var tabs = parent.querySelectorAll('.tab');
    for (var i = 0; i < contents.length; i++) contents[i].classList.remove('active');
    for (var i = 0; i < tabs.length; i++) tabs[i].classList.remove('active');
    var target = document.getElementById('tab-' + tabName);
    if (target) target.classList.add('active');
    btn.classList.add('active');
}


// ==========================================
// HELPERS
// ==========================================

function showAlert(el, msg) { if (!el) return; el.textContent = msg; el.style.display = 'block'; }
function hideAlert(el) { if (!el) return; el.style.display = 'none'; }

function esc(str) {
    if (!str) return '';
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
}

function formatDate(ts) {
    if (!ts) return '';
    if (ts.seconds) return new Date(ts.seconds * 1000).toLocaleDateString();
    if (ts.toDate) return ts.toDate().toLocaleDateString();
    return '';
}


// ==========================================
// MULTIPLAYER / GAME PANEL
// ==========================================

function setupMultiplayerEvents() {
    MP.on('connected', function(data) {
        mpConnected = true;
        var dot = document.getElementById('game-status-dot');
        var text = document.getElementById('game-status-text');
        var btn = document.getElementById('btn-game-connect');
        if (dot) dot.classList.add('connected');
        if (text) text.textContent = 'Connected to ' + MP.SERVERS[data.serverId].name;
        if (btn) { btn.textContent = 'Disconnect'; btn.classList.add('connected'); btn.classList.remove('disconnected'); }
        addGameChatSystem('Connected to ' + MP.SERVERS[data.serverId].name);
        gameUpdatePlayerCount();
        initGameMap();
    });

    MP.on('disconnected', function() {
        mpConnected = false;
        var dot = document.getElementById('game-status-dot');
        var text = document.getElementById('game-status-text');
        var btn = document.getElementById('btn-game-connect');
        if (dot) dot.classList.remove('connected');
        if (text) text.textContent = 'Disconnected';
        if (btn) { btn.textContent = 'Connect'; btn.classList.remove('connected'); btn.classList.add('disconnected'); }
        document.getElementById('game-nearby-list').innerHTML = '<p style="color:#606070;">Connect to a server to see nearby players.</p>';
        document.getElementById('game-player-count').textContent = '0';
        document.getElementById('game-chat-messages').innerHTML = '<p style="color:#606070; text-align:center; padding:20px;">Connect to a server to start chatting.</p>';
    });

    MP.on('player_joined', function(p) {
        addGameChatSystem(p.username + ' joined the server');
        gameUpdateNearbyPlayers();
        gameUpdatePlayerCount();
    });

    MP.on('player_left', function(data) {
        addGameChatSystem('A player left the server');
        gameUpdateNearbyPlayers();
        gameUpdatePlayerCount();
    });

    MP.on('player_update', function(p) {
        gameUpdateNearbyPlayers();
        gameDrawMap();
    });

    MP.on('chat_message', function(msg) {
        addGameChatMessage(msg);
    });

    MP.on('convoy_created', function(data) {
        mpConvoyId = data.id;
        gameUpdateConvoyPanel(data);
        addGameChatSystem('Convoy created: ' + data.name);
    });

    MP.on('convoy_update', function(data) {
        gameUpdateConvoyPanel(data);
    });

    MP.on('convoy_left', function() {
        mpConvoyId = null;
        document.getElementById('game-convoy-content').innerHTML =
            '<p style="color:#606070;">You are not in a convoy.</p>' +
            '<div style="margin-top:12px;">' +
            '<input type="text" id="game-convoy-name" placeholder="Convoy name..." style="width:100%; padding:8px 12px; background:#1a1a2e; border:1px solid #0f3460; border-radius:4px; color:#e0e0e0; margin-bottom:8px;">' +
            '<button class="btn-primary game-btn" onclick="gameCreateConvoy()" style="width:100%;">Create Convoy</button></div>';
        addGameChatSystem('You left the convoy');
    });

    MP.on('convoy_joined', function(data) {
        mpConvoyId = data.id;
        gameUpdateConvoyPanel(data);
        addGameChatSystem('You joined convoy: ' + data.name);
    });
}

function updateNavForAuth(user) {
    var loginBtn = document.getElementById('btn-nav-login');
    var registerBtn = document.getElementById('btn-nav-register');
    var accountBtn = document.getElementById('nav-account-btn');
    var adminBtn = document.getElementById('nav-admin-btn');
    var logoutBtn = document.getElementById('btn-nav-logout');
    var heroBtn = document.getElementById('hero-main-btn');
    var navUsername = document.getElementById('nav-username');
    var gameBtn = document.getElementById('nav-game');

    if (user) {
        if (loginBtn) loginBtn.style.display = 'none';
        if (registerBtn) registerBtn.style.display = 'none';
        if (accountBtn) accountBtn.style.display = 'inline-block';
        if (logoutBtn) logoutBtn.style.display = 'inline-block';
        if (gameBtn) gameBtn.style.display = 'inline-block';
        if (heroBtn) {
            heroBtn.textContent = 'Go to Dashboard';
            heroBtn.setAttribute('onclick', "showPage('account')");
        }
        if (navUsername && currentUserProfile) {
            navUsername.textContent = currentUserProfile.username;
            navUsername.style.display = 'inline-block';
        }
    } else {
        if (loginBtn) loginBtn.style.display = 'inline-block';
        if (registerBtn) registerBtn.style.display = 'inline-block';
        if (accountBtn) accountBtn.style.display = 'none';
        if (adminBtn) adminBtn.style.display = 'none';
        if (logoutBtn) logoutBtn.style.display = 'none';
        if (gameBtn) gameBtn.style.display = 'none';
        if (navUsername) navUsername.style.display = 'none';
        if (heroBtn) {
            heroBtn.textContent = 'Register Now';
            heroBtn.setAttribute('onclick', "showPage('register')");
        }
    }
}

// ==========================================
// GAME PANEL FUNCTIONS
// ==========================================

function gameConnect() {
    if (!currentUser || !currentUserProfile) {
        showPage('login');
        return;
    }

    if (mpConnected) {
        MP.disconnect();
        return;
    }

    var serverId = document.getElementById('game-server-select').value;
    MP.connect(serverId, {
        uid: currentUser.uid,
        username: currentUserProfile.username,
        convoyId: currentUserProfile.convoyId
    });
}

function gameDisconnect() {
    MP.disconnect();
}

function gameSendChat() {
    if (!mpConnected) return;
    var input = document.getElementById('game-chat-input');
    if (!input) return;
    var text = input.value.trim();
    if (!text) return;

    MP.sendChat(text, mpChatChannel);
    input.value = '';
}

function gameSwitchChat(channel, btn) {
    mpChatChannel = channel;
    var tabs = document.querySelectorAll('.game-chat-tab');
    for (var i = 0; i < tabs.length; i++) tabs[i].classList.remove('active');
    if (btn) btn.classList.add('active');

    var chatEl = document.getElementById('game-chat-messages');
    if (chatEl) chatEl.innerHTML = '';
}

function gameCreateConvoy() {
    if (!mpConnected) return;
    var nameInput = document.getElementById('game-convoy-name');
    var name = nameInput ? nameInput.value.trim() : '';
    MP.createConvoy(name || null);
}

function gameLeaveConvoy() {
    MP.leaveConvoy();
}

function addGameChatMessage(msg) {
    var chatEl = document.getElementById('game-chat-messages');
    if (!chatEl) return;

    if (chatEl.querySelector('p')) chatEl.innerHTML = '';

    var time = '';
    if (msg.timestamp) {
        var d = new Date(msg.timestamp);
        time = d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
    }

    var isLocal = currentUser && msg.authorId === currentUser.uid;
    var html = '<div class="game-chat-msg">';
    html += '<span class="game-chat-msg-author">' + esc(msg.authorName || 'Unknown') + '</span>';
    html += '<span class="game-chat-msg-time">' + time + '</span>';
    html += '<div class="game-chat-msg-text">' + esc(msg.text) + '</div>';
    html += '</div>';

    chatEl.innerHTML += html;
    chatEl.scrollTop = chatEl.scrollHeight;
}

function addGameChatSystem(text) {
    var chatEl = document.getElementById('game-chat-messages');
    if (!chatEl) return;

    if (chatEl.querySelector('p') && chatEl.textContent.indexOf('Connect') !== -1) chatEl.innerHTML = '';

    var html = '<div class="game-chat-msg"><span class="game-chat-msg-system">[System] ' + esc(text) + '</span></div>';
    chatEl.innerHTML += html;
    chatEl.scrollTop = chatEl.scrollHeight;
}

function gameUpdateNearbyPlayers() {
    if (!mpConnected) return;
    var list = document.getElementById('game-nearby-list');
    if (!list) return;

    MP.getNearbyPlayers(5000).then(function(nearby) {
        if (nearby.length === 0) {
            list.innerHTML = '<p style="color:#606070;">No nearby players.</p>';
            return;
        }
        var html = '';
        nearby.sort(function(a, b) { return a._distance - b._distance; });
        nearby.forEach(function(p) {
            html += '<div class="game-player-list-item">';
            html += '<span class="game-player-dot"></span>';
            html += '<span class="game-player-list-name">' + esc(p.username) + '</span>';
            html += '<span class="game-player-list-id">' + esc(p.convoyId) + '</span>';
            html += '<span class="game-player-list-speed">' + Math.round(p.speed || 0) + ' km/h</span>';
            html += '</div>';
        });
        list.innerHTML = html;
    });
}

function gameUpdatePlayerCount() {
    var el = document.getElementById('game-player-count');
    if (!el) return;

    var serverId = MP.getServerId();
    var ref = firebase.database().ref('servers/' + serverId + '/players');
    ref.once('value', function(snap) {
        el.textContent = snap.numChildren();
    });

    if (mpConnected) {
        ref.on('value', function(snap) {
            el.textContent = snap.numChildren();
        });
    }
}

function gameUpdateConvoyPanel(data) {
    var el = document.getElementById('game-convoy-content');
    if (!el || !data) return;

    var html = '<div style="margin-bottom:12px;">';
    html += '<strong style="color:#e94560;">' + esc(data.name || 'Convoy') + '</strong>';
    html += '<span style="color:#606070; font-size:0.8rem; margin-left:8px;">ID: ' + esc(data.id) + '</span>';
    html += '</div>';

    html += '<div class="game-convoy-members">';
    var memberNames = data.memberNames || {};
    var members = data.members || {};
    var memberIds = Object.keys(members);

    memberIds.forEach(function(uid) {
        var isLeader = data.leaderId === uid;
        var name = memberNames[uid] || uid;
        html += '<div class="game-convoy-member">';
        html += '<span class="game-player-dot"></span>';
        html += '<span class="game-convoy-member-name">' + esc(name) + '</span>';
        if (isLeader) html += '<span class="game-convoy-member-leader">(Leader)</span>';
        html += '</div>';
    });
    html += '</div>';

    html += '<button class="btn-secondary game-btn" onclick="gameLeaveConvoy()" style="width:100%;">Leave Convoy</button>';

    el.innerHTML = html;
}

// ==========================================
// GAME MAP
// ==========================================

var ETS2_CITIES = [
    { name: 'Paris', x: -1000, z: -500 },
    { name: 'London', x: -1400, z: -300 },
    { name: 'Berlin', x: 200, z: -400 },
    { name: 'Rome', x: 500, z: 600 },
    { name: 'Madrid', x: -1200, z: 700 },
    { name: 'Amsterdam', x: -200, z: -350 },
    { name: 'Prague', x: 500, z: -200 },
    { name: 'Warsaw', x: 700, z: -350 },
    { name: 'Stockholm', x: 400, z: -900 },
    { name: 'Oslo', x: 100, z: -850 },
    { name: 'Copenhagen', x: 300, z: -500 },
    { name: 'Vienna', x: 500, z: -100 },
    { name: 'Zurich', x: 200, z: 100 },
    { name: 'Marseille', x: -200, z: 400 },
    { name: 'Barcelona', x: -800, z: 600 },
    { name: 'Milan', x: 300, z: 200 },
    { name: 'Lisbon', x: -1800, z: 700 },
    { name: 'Dublin', x: -1700, z: -400 },
    { name: 'Hamburg', x: 0, z: -500 },
    { name: 'Munich', x: 350, z: 0 },
    { name: 'Budapest', x: 700, z: 0 },
    { name: 'Athens', x: 900, z: 600 },
    { name: 'Istanbul', x: 1200, z: 400 },
    { name: 'Helsinki', x: 700, z: -800 },
];

var mapAnimFrame = null;

function initGameMap() {
    var canvas = document.getElementById('game-map-canvas');
    if (!canvas) return;

    canvas.addEventListener('mousedown', function(e) {
        mpMapDragging = true;
        mpMapLastX = e.clientX;
        mpMapLastZ = e.clientY;
    });

    canvas.addEventListener('mousemove', function(e) {
        if (!mpMapDragging) return;
        var dx = e.clientX - mpMapLastX;
        var dz = e.clientY - mpMapLastZ;
        mpMapCenterX -= dx / mpMapZoom;
        mpMapCenterZ -= dz / mpMapZoom;
        mpMapLastX = e.clientX;
        mpMapLastZ = e.clientY;
        gameDrawMap();
    });

    canvas.addEventListener('mouseup', function() { mpMapDragging = false; });
    canvas.addEventListener('mouseleave', function() { mpMapDragging = false; });

    canvas.addEventListener('wheel', function(e) {
        e.preventDefault();
        var delta = e.deltaY > 0 ? -0.1 : 0.1;
        mpMapZoom = Math.max(0.2, Math.min(3, mpMapZoom + delta));
        gameDrawMap();
    });

    gameDrawMap();
    gameMapAnimate();
}

function gameMapAnimate() {
    if (mpConnected) {
        gameDrawMap();
    }
    mapAnimFrame = requestAnimationFrame(gameMapAnimate);
}

function gameMapZoom(dir) {
    mpMapZoom = Math.max(0.2, Math.min(3, mpMapZoom + dir * 0.2));
    gameDrawMap();
}

function gameMapCenter() {
    var lp = MP.getLocalPlayer();
    if (lp) {
        mpMapCenterX = lp.x;
        mpMapCenterZ = lp.z;
    }
    gameDrawMap();
}

function gameDrawMap() {
    var canvas = document.getElementById('game-map-canvas');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var w = canvas.width = canvas.offsetWidth;
    var h = canvas.height = canvas.offsetHeight;

    ctx.fillStyle = '#0d1b2a';
    ctx.fillRect(0, 0, w, h);

    var cx = w / 2 + mpMapCenterX * mpMapZoom;
    var cz = h / 2 + mpMapCenterZ * mpMapZoom;

    ctx.strokeStyle = 'rgba(15, 52, 96, 0.4)';
    ctx.lineWidth = 1;
    var gridSize = 200 * mpMapZoom;
    var offsetX = cx % gridSize;
    var offsetZ = cz % gridSize;
    for (var gx = offsetX; gx < w; gx += gridSize) {
        ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, h); ctx.stroke();
    }
    for (var gz = offsetZ; gz < h; gz += gridSize) {
        ctx.beginPath(); ctx.moveTo(0, gz); ctx.lineTo(w, gz); ctx.stroke();
    }

    ETS2_CITIES.forEach(function(city) {
        var sx = cx + city.x * mpMapZoom;
        var sz = cz + city.z * mpMapZoom;

        if (sx < -50 || sx > w + 50 || sz < -50 || sz > h + 50) return;

        ctx.fillStyle = 'rgba(233, 69, 96, 0.6)';
        ctx.beginPath();
        ctx.arc(sx, sz, 4, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#a0a0b0';
        ctx.font = '10px Segoe UI';
        ctx.textAlign = 'center';
        ctx.fillText(city.name, sx, sz - 8);
    });

    if (!mpConnected) {
        ctx.fillStyle = '#606070';
        ctx.font = '16px Segoe UI';
        ctx.textAlign = 'center';
        ctx.fillText('Connect to a server to see players', w / 2, h / 2);
        return;
    }

    var serverId = MP.getServerId();
    var ref = firebase.database().ref('servers/' + serverId + '/players');
    ref.once('value', function(snap) {
        var lp = MP.getLocalPlayer();
        ctx.clearRect(0, 0, w, h);

        ctx.fillStyle = '#0d1b2a';
        ctx.fillRect(0, 0, w, h);

        ctx.strokeStyle = 'rgba(15, 52, 96, 0.4)';
        ctx.lineWidth = 1;
        for (var gx = offsetX; gx < w; gx += gridSize) {
            ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, h); ctx.stroke();
        }
        for (var gz = offsetZ; gz < h; gz += gridSize) {
            ctx.beginPath(); ctx.moveTo(0, gz); ctx.lineTo(w, gz); ctx.stroke();
        }

        ETS2_CITIES.forEach(function(city) {
            var sx = cx + city.x * mpMapZoom;
            var sz = cz + city.z * mpMapZoom;
            if (sx < -50 || sx > w + 50 || sz < -50 || sz > h + 50) return;
            ctx.fillStyle = 'rgba(233, 69, 96, 0.6)';
            ctx.beginPath(); ctx.arc(sx, sz, 4, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#a0a0b0';
            ctx.font = '10px Segoe UI';
            ctx.textAlign = 'center';
            ctx.fillText(city.name, sx, sz - 8);
        });

        snap.forEach(function(child) {
            var p = child.val();
            var sx = cx + p.x * mpMapZoom;
            var sz = cz + p.z * mpMapZoom;

            if (sx < -20 || sx > w + 20 || sz < -20 || sz > h + 20) return;

            var isLocal = lp && child.key === lp.uid;

            if (isLocal) {
                ctx.fillStyle = '#2ecc71';
                ctx.beginPath(); ctx.arc(sx, sz, 7, 0, Math.PI * 2); ctx.fill();
                ctx.strokeStyle = '#27ae60';
                ctx.lineWidth = 2;
                ctx.beginPath(); ctx.arc(sx, sz, 10, 0, Math.PI * 2); ctx.stroke();
            } else {
                ctx.fillStyle = '#3498db';
                ctx.beginPath(); ctx.arc(sx, sz, 5, 0, Math.PI * 2); ctx.fill();
            }

            ctx.fillStyle = isLocal ? '#2ecc71' : '#fff';
            ctx.font = (isLocal ? 'bold ' : '') + '11px Segoe UI';
            ctx.textAlign = 'center';
            ctx.fillText(p.username || 'Unknown', sx, sz - 12);
        });
    });
}
