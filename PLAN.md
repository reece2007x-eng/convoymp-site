# ConvoyMP Backend Plan - Firebase Integration

## Setup Steps

### Step 1: Create Firebase Project
1. Go to https://console.firebase.google.com
2. Click "Add project" → name it "ConvoyMP"
3. Disable Google Analytics (optional) → Create Project

### Step 2: Get Firebase Config
1. In Firebase Console → Project Settings (gear icon)
2. Scroll to "Your apps" → click Web icon `</>`
3. Name it "ConvoyMP Web" → Register App
4. Copy the `firebaseConfig` object (we paste this into our code)

### Step 3: Enable Authentication Methods
1. Firebase Console → Build → Authentication → Get Started
2. Enable these providers:
   - **Email/Password** → Turn on
   - **Google** → Turn on → Set support email
   - **Discord** → Need OAuth2 credentials from Discord Developer Portal
   - **Steam** → Need Steam Web API key (custom provider via Cloud Function)

### Step 4: Create Firestore Database
1. Firebase Console → Build → Firestore Database → Create Database
2. Choose "Start in test mode" → Select location → Enable

### Step 5: Firestore Collections Structure

```
users/
  {uid}/
    username: string
    email: string
    firstName: string
    lastName: string
    bio: string
    steamId: string | null
    role: "user" | "moderator" | "admin"
    createdAt: timestamp
    distance: number
    jobsDone: number
    isBanned: boolean

reports/
  {reportId}/
    reporterId: string
    reporterName: string
    offenderName: string
    server: string
    ruleBroken: string
    dateTime: string
    description: string
    status: "pending" | "reviewed" | "resolved"
    createdAt: timestamp
    reviewedBy: string | null
    result: string | null

appeals/
  {appealId}/
    userId: string
    userName: string
    banReason: string
    explanation: string
    status: "pending" | "approved" | "denied"
    createdAt: timestamp
    reviewedBy: string | null
    response: string | null

news/
  {postId}/
    title: string
    content: string
    imageUrl: string
    authorId: string
    authorName: string
    createdAt: timestamp

servers/
  {serverId}/
    name: string
    location: string
    maxPlayers: number
    currentPlayers: number
    status: "online" | "offline" | "busy"
    updatedAt: timestamp

logs/
  {logId}/
    action: string
    details: string
    adminId: string
    adminName: string
    createdAt: timestamp
```

### Step 6: Security Rules (Firestore)
- Users can read/write their own profile
- Anyone can read server status
- Anyone can read news
- Only logged-in users can create reports/appeals
- Only admins can manage users, logs, and server status

### Step 7: Code Changes Needed

#### A. Add Firebase SDK to index.html
```html
<script type="module">
  import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
  import { getAuth, ... } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
  import { getFirestore, ... } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
</script>
```

#### B. New/Modified Files
- `index.html` - Add Firebase SDK + wire up all forms
- `style.css` - No changes needed
- `script.js` - Complete rewrite with Firebase functions

#### C. Functions to Build in script.js

**Auth Functions:**
- `registerUser()` - Create account with email/password
- `loginUser()` - Sign in with email/password
- `loginWithGoogle()` - Google OAuth popup
- `loginWithDiscord()` - Discord OAuth popup
- `logoutUser()` - Sign out
- `onAuthStateChanged()` - Track login state, show/hide nav buttons

**User Functions:**
- `getUserProfile(uid)` - Get user data from Firestore
- `updateUserProfile(uid, data)` - Update profile
- `linkSteam(uid, steamId)` - Link Steam account

**Report Functions:**
- `submitReport(data)` - Create report in Firestore
- `getMyReports(uid)` - Get reports filed by user
- `getAllReports()` - Admin: get all reports
- `updateReportStatus(id, status, result)` - Admin: resolve report

**Appeal Functions:**
- `submitAppeal(data)` - Create appeal in Firestore
- `getMyAppeals(uid)` - Get user's appeals
- `getAllAppeals()` - Admin: get all appeals
- `updateAppealStatus(id, status, response)` - Admin: resolve appeal

**News Functions:**
- `getNews()` - Get all news posts
- `createPost(data)` - Admin: create news post

**Server Functions:**
- `getServers()` - Get all servers
- `updateServer(id, data)` - Admin: update server status

**Log Functions:**
- `addLog(action, details)` - Admin: add log entry
- `getLogs()` - Admin: get all logs

**Admin Functions:**
- `getStats()` - Dashboard stats
- `getAllUsers()` - User management
- `banUser(uid)` / `unbanUser(uid)` - Ban/unban users

### Step 8: Build Order
1. Create Firebase project + get config
2. Add Firebase SDK to index.html
3. Wire up Register form → create user in Firestore
4. Wire up Login form → sign in
5. Add Google sign-in button
6. Add logout functionality
7. Show/hide nav based on login state
8. Wire up Account Dashboard → read/update profile
9. Wire up Report form → create report
10. Wire up My Reports → list user's reports
11. Wire up Appeals → create/list appeals
12. Wire up Admin Dashboard → stats
13. Wire up Admin Users → list/ban users
14. Wire up Admin Reports → list/resolve reports
15. Wire up Admin Logs → list logs
16. Wire up News → create/read posts
17. Wire up Servers → read/update status
18. Add Discord OAuth (needs Discord Developer setup)
19. Add Steam linking (needs Steam API)
