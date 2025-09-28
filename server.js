import express from 'express';
import cors from 'cors';
import sqlite3 from 'sqlite3';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import path from 'path';
import { fileURLToPath } from 'url';

// Derive __dirname in ESM context
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';
const DB_FILE = path.join(__dirname, 'arthub.db');
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname)); // serve static site

// DB init
const db = new sqlite3.Database(DB_FILE);
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    profile_picture TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS posts(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    body TEXT NOT NULL,
    image_url TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS contexts(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    text TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(post_id),
    FOREIGN KEY(post_id) REFERENCES posts(id),
    FOREIGN KEY(user_id) REFERENCES users(id)
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS follows(
    follower_id INTEGER NOT NULL,
    followee_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (follower_id, followee_id),
    FOREIGN KEY(follower_id) REFERENCES users(id),
    FOREIGN KEY(followee_id) REFERENCES users(id)
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS likes(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    post_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, post_id),
    FOREIGN KEY(user_id) REFERENCES users(id),
    FOREIGN KEY(post_id) REFERENCES posts(id)
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS comments(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    post_id INTEGER NOT NULL,
    text TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id),
    FOREIGN KEY(post_id) REFERENCES posts(id)
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS notifications(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    read_status BOOLEAN DEFAULT FALSE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  )`);
});

// Helpers
function auth(req, res, next) {
  const hdr = req.headers.authorization;
  if (!hdr) return res.status(401).json({ error: 'No token' });
  const token = hdr.split(' ')[1];
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

function getUserPublic(u) {
  return { id: u.id, username: u.username, profile_picture: u.profile_picture };
}

// Auth routes
app.post('/api/auth/register', (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password) return res.status(400).json({ error: 'Missing fields' });
  const hash = bcrypt.hashSync(password, 10);
  const stmt = `INSERT INTO users(username,email,password_hash) VALUES(?,?,?)`;
  db.run(stmt, [username, email, hash], function (err) {
    if (err) return res.status(400).json({ error: 'User exists or invalid' });
    const token = jwt.sign({ id: this.lastID, username }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: this.lastID, username } });
  });
});

app.post('/api/auth/login', (req, res) => {
  const { usernameOrEmail, password } = req.body;
  if (!usernameOrEmail || !password) return res.status(400).json({ error: 'Missing' });
  db.get(`SELECT * FROM users WHERE username = ? OR email = ?`, [usernameOrEmail, usernameOrEmail], (err, u) => {
    if (err || !u) return res.status(401).json({ error: 'Invalid login' });
    if (!bcrypt.compareSync(password, u.password_hash)) return res.status(401).json({ error: 'Invalid login' });
    const token = jwt.sign({ id: u.id, username: u.username }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: getUserPublic(u) });
  });
});

// Posts
app.get('/api/posts', (req, res) => {
  // Try to decode token if present for like status resolution
  let currentUserId = null;
  const hdr = req.headers.authorization;
  if (hdr) {
    try { const token = hdr.split(' ')[1]; currentUserId = jwt.verify(token, JWT_SECRET).id; } catch {}
  }

  const q = `
    SELECT p.*, u.username, u.profile_picture,
           (SELECT json_object('id', c.id, 'text', c.text, 'user_id', c.user_id, 'username',
             (SELECT username FROM users WHERE id = c.user_id))
             FROM contexts c WHERE c.post_id = p.id) AS context,
           (SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id) AS likes_count,
           (SELECT COUNT(*) FROM comments cm WHERE cm.post_id = p.id) AS comments_count
           ${currentUserId ? `, (SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id AND l.user_id = ${currentUserId}) AS user_liked` : ''}
    FROM posts p
    JOIN users u ON u.id = p.user_id
    ORDER BY p.id DESC
    LIMIT 100`;
  db.all(q, [], (err, rows) => {
    if (err) return res.status(500).json({ error: 'DB error' });
    rows.forEach(r => {
      r.context = r.context ? JSON.parse(r.context) : null;
      r.user_liked = !!r.user_liked;
    });
    res.json(rows);
  });
});

app.post('/api/posts', auth, (req, res) => {
  const { body, image_url } = req.body;
  if (!body) return res.status(400).json({ error: 'Body required' });
  db.run(`INSERT INTO posts(user_id, body, image_url) VALUES(?,?,?)`,
    [req.user.id, body, image_url || null],
    function (err) {
      if (err) return res.status(500).json({ error: 'DB error' });
      db.get(`SELECT p.*, u.username FROM posts p JOIN users u ON u.id=p.user_id WHERE p.id=?`, [this.lastID], (e, post) => {
        res.json({ ...post, context: null });
      });
    });
});

// Readers context (only non-author & one per post)
app.post('/api/posts/:id/context', auth, (req, res) => {
  const { text } = req.body;
  const postId = parseInt(req.params.id, 10);
  if (!text) return res.status(400).json({ error: 'Text required' });
  db.get(`SELECT * FROM posts WHERE id=?`, [postId], (err, post) => {
    if (err || !post) return res.status(404).json({ error: 'Post not found' });
    if (post.user_id === req.user.id) return res.status(403).json({ error: 'Author cannot add context' });
    db.get(`SELECT 1 FROM contexts WHERE post_id=?`, [postId], (er2, existing) => {
      if (existing) return res.status(409).json({ error: 'Context exists' });
      db.run(`INSERT INTO contexts(post_id,user_id,text) VALUES(?,?,?)`,
        [postId, req.user.id, text],
        function (er3) {
          if (er3) return res.status(500).json({ error: 'DB error' });
          db.get(`SELECT c.*, u.username FROM contexts c JOIN users u ON u.id=c.user_id WHERE c.id=?`,
            [this.lastID],
            (er4, ctx) => res.json(ctx));
        });
    });
  });
});

// Profile stats (auth)
app.get('/api/profile', auth, (req, res) => {
  const userId = req.user.id;
  db.get(`SELECT profile_picture FROM users WHERE id = ?`, [userId], (err, user) => {
    if (err) return res.status(500).json({ error: 'DB error' });
    const result = { 
      user: { id: userId, username: req.user.username, profile_picture: user?.profile_picture }, 
      counts: { posts: 0, followers: 0, following: 0 } 
    };
    db.get(`SELECT COUNT(*) as c FROM posts WHERE user_id=?`, [userId], (e1, r1) => {
      result.counts.posts = r1?.c || 0;
      db.get(`SELECT COUNT(*) as c FROM follows WHERE followee_id=?`, [userId], (e2, r2) => {
        result.counts.followers = r2?.c || 0;
        db.get(`SELECT COUNT(*) as c FROM follows WHERE follower_id=?`, [userId], (e3, r3) => {
          result.counts.following = r3?.c || 0;
          res.json(result);
        });
      });
    });
  });
});

// List users (suggestions) - optionally requires auth for follow status
app.get('/api/users', (req, res) => {
  // Try to decode token if present for follow status resolution
  let currentId = null;
  const hdr = req.headers.authorization;
  if (hdr) {
    try { const token = hdr.split(' ')[1]; currentId = jwt.verify(token, JWT_SECRET).id; } catch {}
  }
  const limit = Math.min(parseInt(req.query.limit || '10', 10), 50);
  const params = [];
  let sql = `SELECT u.id, u.username, u.profile_picture,
             (SELECT COUNT(*) FROM follows f WHERE f.followee_id = u.id) AS followers,
             (SELECT COUNT(*) FROM posts p WHERE p.user_id = u.id) AS posts`;
  if (currentId) {
    sql += `, EXISTS (SELECT 1 FROM follows fx WHERE fx.follower_id = ? AND fx.followee_id = u.id) AS is_following`;
    params.push(currentId);
  }
  sql += ` FROM users u`;
  if (currentId) { sql += ` WHERE u.id != ?`; params.push(currentId); }
  sql += ` ORDER BY followers DESC LIMIT ?`;
  params.push(limit);
  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: 'DB error' });
    res.json(rows.map(r => ({ 
      id: r.id, 
      username: r.username, 
      profile_picture: r.profile_picture,
      followers: r.followers, 
      posts: r.posts, 
      is_following: !!r.is_following 
    })));
  });
});

// Follow a user
app.post('/api/follow/:id', auth, (req, res) => {
  const targetId = parseInt(req.params.id, 10);
  if (targetId === req.user.id) return res.status(400).json({ error: 'Cannot follow self' });
  db.run(`INSERT OR IGNORE INTO follows(follower_id, followee_id) VALUES(?,?)`, [req.user.id, targetId], function(err){
    if (err) return res.status(500).json({ error: 'DB error' });
    res.json({ success:true, following:true });
  });
});

// Unfollow
app.delete('/api/follow/:id', auth, (req, res) => {
  const targetId = parseInt(req.params.id, 10);
  db.run(`DELETE FROM follows WHERE follower_id=? AND followee_id=?`, [req.user.id, targetId], function(err){
    if (err) return res.status(500).json({ error: 'DB error' });
    res.json({ success:true, following:false });
  });
});

// Like/Unlike a post
app.post('/api/posts/:id/like', auth, (req, res) => {
  const postId = parseInt(req.params.id, 10);
  db.get(`SELECT * FROM likes WHERE user_id = ? AND post_id = ?`, [req.user.id, postId], (err, existing) => {
    if (err) return res.status(500).json({ error: 'DB error' });
    if (existing) {
      // Unlike
      db.run(`DELETE FROM likes WHERE user_id = ? AND post_id = ?`, [req.user.id, postId], function(err) {
        if (err) return res.status(500).json({ error: 'DB error' });
        res.json({ liked: false, likes_count: null });
      });
    } else {
      // Like
      db.run(`INSERT INTO likes(user_id, post_id) VALUES(?,?)`, [req.user.id, postId], function(err) {
        if (err) return res.status(500).json({ error: 'DB error' });
        // Create notification for post owner
        db.get(`SELECT user_id FROM posts WHERE id = ?`, [postId], (e, post) => {
          if (post && post.user_id !== req.user.id) {
            db.run(`INSERT INTO notifications(user_id, type, title, message) VALUES(?,?,?,?)`, 
              [post.user_id, 'like', 'New Like', `${req.user.username} liked your post`]);
          }
        });
        res.json({ liked: true, likes_count: null });
      });
    }
  });
});

// Get comments for a post
app.get('/api/posts/:id/comments', (req, res) => {
  const postId = parseInt(req.params.id, 10);
  db.all(`SELECT c.*, u.username, u.profile_picture FROM comments c 
          JOIN users u ON u.id = c.user_id 
          WHERE c.post_id = ? ORDER BY c.created_at ASC`, [postId], (err, comments) => {
    if (err) return res.status(500).json({ error: 'DB error' });
    res.json(comments);
  });
});

// Add comment to a post
app.post('/api/posts/:id/comments', auth, (req, res) => {
  const postId = parseInt(req.params.id, 10);
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'Comment text required' });
  
  db.run(`INSERT INTO comments(user_id, post_id, text) VALUES(?,?,?)`, 
    [req.user.id, postId, text], function(err) {
    if (err) return res.status(500).json({ error: 'DB error' });
    
    // Create notification for post owner
    db.get(`SELECT user_id FROM posts WHERE id = ?`, [postId], (e, post) => {
      if (post && post.user_id !== req.user.id) {
        db.run(`INSERT INTO notifications(user_id, type, title, message) VALUES(?,?,?,?)`, 
          [post.user_id, 'comment', 'New Comment', `${req.user.username} commented on your post`]);
      }
    });
    
    // Return the new comment with user info
    db.get(`SELECT c.*, u.username, u.profile_picture FROM comments c 
            JOIN users u ON u.id = c.user_id WHERE c.id = ?`, [this.lastID], (e2, comment) => {
      res.json(comment);
    });
  });
});

// Get notifications for user
app.get('/api/notifications', auth, (req, res) => {
  db.all(`SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 20`, 
    [req.user.id], (err, notifications) => {
    if (err) return res.status(500).json({ error: 'DB error' });
    res.json(notifications);
  });
});

// Mark notification as read
app.put('/api/notifications/:id/read', auth, (req, res) => {
  const notificationId = parseInt(req.params.id, 10);
  db.run(`UPDATE notifications SET read_status = TRUE WHERE id = ? AND user_id = ?`, 
    [notificationId, req.user.id], function(err) {
    if (err) return res.status(500).json({ error: 'DB error' });
    res.json({ success: true });
  });
});

// Mark all notifications as read
app.put('/api/notifications/mark-all-read', auth, (req, res) => {
  db.run(`UPDATE notifications SET read_status = TRUE WHERE user_id = ?`, [req.user.id], function(err) {
    if (err) return res.status(500).json({ error: 'DB error' });
    res.json({ success: true });
  });
});

// Get unread notifications count
app.get('/api/notifications/unread-count', auth, (req, res) => {
  db.get(`SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND read_status = FALSE`, 
    [req.user.id], (err, result) => {
    if (err) return res.status(500).json({ error: 'DB error' });
    res.json({ count: result.count });
  });
});

// Update user profile picture
app.put('/api/profile/picture', auth, (req, res) => {
  const { profile_picture } = req.body;
  if (!profile_picture) return res.status(400).json({ error: 'Profile picture required' });
  
  db.run(`UPDATE users SET profile_picture = ? WHERE id = ?`, [profile_picture, req.user.id], function(err) {
    if (err) return res.status(500).json({ error: 'DB error' });
    res.json({ success: true, profile_picture });
  });
});

// Get user settings/profile
app.get('/api/settings', auth, (req, res) => {
  db.get(`SELECT id, username, email, profile_picture FROM users WHERE id = ?`, [req.user.id], (err, user) => {
    if (err) return res.status(500).json({ error: 'DB error' });
    res.json(user);
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('API running on ' + PORT));
