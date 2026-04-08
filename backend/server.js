const express       = require('express');
const mongoose      = require('mongoose');
const cors          = require('cors');
const bodyParser    = require('body-parser');
const http          = require('http');           // Needed for Socket.IO
const { Server }    = require('socket.io');      // Real-time WebSockets
const rateLimit     = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const helmet        = require('helmet');

const app    = express();
const server = http.createServer(app);           // Wrap express in http server

// ── SOCKET.IO SETUP ──────────────────────────────────────────────────────────
const io = new Server(server, {
  cors: { origin: '*' }
});

// Make io available in all route files
app.set('io', io);

// ── SECURITY MIDDLEWARE ──────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false })); // Security headers
app.use(mongoSanitize());                          // Prevent NoSQL injection
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('../frontend'));

// ── RATE LIMITING (prevent spam) ─────────────────────────────────────────────
// Max 100 requests per 15 minutes per IP
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { message: 'Too many requests, please try again later.' }
});
app.use('/api/', limiter);

// Stricter limit for login/register (5 attempts per 15 min)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { message: 'Too many login attempts, try again in 15 minutes.' }
});
app.use('/api/auth/', authLimiter);

// ── MONGODB CONNECTION ────────────────────────────────────────────────────────
mongoose.connect('mongodb://localhost:27017/peerhelp')
  .then(() => console.log('✅ MongoDB Connected!'))
  .catch(err => console.log('❌ MongoDB Error:', err));

// ── ROUTES ────────────────────────────────────────────────────────────────────
app.use('/api/auth',         require('./routes/auth'));
app.use('/api/requests',     require('./routes/requests'));
app.use('/api/answers',      require('./routes/answers'));
app.use('/api/notifications',require('./routes/notifications'));
app.use('/api/stats',        require('./routes/stats'));

// ── SOCKET.IO EVENTS ─────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log('🔌 User connected:', socket.id);

  // User joins their personal room (for private notifications)
  socket.on('join', (userId) => {
    socket.join(userId);
    console.log('👤 User joined room:', userId);
  });

  socket.on('disconnect', () => {
    console.log('❌ User disconnected:', socket.id);
  });
});

// ── START SERVER ──────────────────────────────────────────────────────────────
server.listen(3000, () => {
  console.log('🚀 Server running on http://localhost:3000');
});