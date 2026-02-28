require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const chatRoutes = require('./routes/chats');
const socketHandler = require('./socket/index');

const app = express();
const server = http.createServer(app);

// ─── SOCKET.IO ──────────────────────────────────────────────────────────────
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || '*',
    methods: ['GET', 'POST']
  }
});

socketHandler(io);

// ─── MIDDLEWARE ─────────────────────────────────────────────────────────────
app.use(cors({ origin: process.env.CLIENT_URL || '*' }));
app.use(express.json());

// ─── ROUTES ─────────────────────────────────────────────────────────────────
app.use('/auth', authRoutes);
app.use('/users', userRoutes);
app.use('/chats', chatRoutes);

// Health check
app.get('/', (req, res) => {
  res.json({
    status: 'online',
    app: 'TermChat API',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found` });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

// ─── START ───────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`
  ████████╗███████╗██████╗ ███╗   ███╗ ██████╗██╗  ██╗ █████╗ ████████╗
     ██╔══╝██╔════╝██╔══██╗████╗ ████║██╔════╝██║  ██║██╔══██╗╚══██╔══╝
     ██║   █████╗  ██████╔╝██╔████╔██║██║     ███████║███████║   ██║   
     ██║   ██╔══╝  ██╔══██╗██║╚██╔╝██║██║     ██╔══██║██╔══██║   ██║   
     ██║   ███████╗██║  ██║██║ ╚═╝ ██║╚██████╗██║  ██║██║  ██║   ██║   
     ╚═╝   ╚══════╝╚═╝  ╚═╝╚═╝     ╚═╝ ╚═════╝╚═╝  ╚═╝╚═╝  ╚═╝   ╚═╝   
  
  🟢 Server running on port ${PORT}
  🌐 http://localhost:${PORT}
  `);
});
