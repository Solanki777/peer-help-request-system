const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');
const http = require('http');
const { Server } = require('socket.io');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');

// ── INLINE NOSQL SANITIZER ────────────────────────────────────────────────────
// Replaces express-mongo-sanitize which has a version conflict with Express 5.
// Strips any keys starting with '$' or containing '.' from req.body to prevent
// NoSQL injection attacks (e.g. { "$gt": "" } login bypass).
function sanitize(obj) {
  if (obj && typeof obj === 'object') {
    Object.keys(obj).forEach(key => {
      if (key.startsWith('$') || key.includes('.')) {
        delete obj[key];
      } else {
        sanitize(obj[key]);
      }
    });
  }
}
function mongoSanitize(req, res, next) {
  sanitize(req.body);
  sanitize(req.params);
  next();
}

const app = express();
const server = http.createServer(app);

const io = new Server(server, { cors: { origin: '*' } });
app.set('io', io);

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(bodyParser.json());
app.use(cookieParser());
app.use(mongoSanitize);         // runs AFTER body is parsed — strips $keys and .keys
app.use(express.static('../frontend'));

const limiter = rateLimit({
  windowMs: 1 * 60 * 1000,  // 1 minute window
  max: 500,                  // 500 requests per minute — generous for a college project
  message: { message: 'Too many requests, please try again later.' }
});
app.use('/api/', limiter);


// Only apply strict limiter to login & register — NOT leaderboard/profile


mongoose.connect('mongodb://localhost:27017/peerhelp')
  .then(() => console.log('✅ MongoDB Connected!'))
  .catch(err => console.log('❌ MongoDB Error:', err));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/requests', require('./routes/requests'));
app.use('/api/answers', require('./routes/answers'));
app.use('/api/comments', require('./routes/comments'));
app.use('/api/suggestions', require('./routes/suggestions'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/stats', require('./routes/stats'));

// Track online users: userId → socket.id
const onlineUsers = new Map();

function broadcastOnlineCount() {
  io.emit('onlineCount', { count: onlineUsers.size });
}

io.on('connection', (socket) => {

  socket.on('join', (userId) => {
    socket.userId = userId;

    if (!onlineUsers.has(userId)) {
      onlineUsers.set(userId, new Set());
    }

    onlineUsers.get(userId).add(socket.id);

    broadcastOnlineCount();
  });

  socket.on('disconnect', () => {
    const userId = socket.userId;

    if (userId && onlineUsers.has(userId)) {
      const userSockets = onlineUsers.get(userId);
      userSockets.delete(socket.id);

      // Remove user only if no active sockets left
      if (userSockets.size === 0) {
        onlineUsers.delete(userId);
      }

      broadcastOnlineCount();
    }
  });
});