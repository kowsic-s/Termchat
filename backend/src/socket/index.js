const jwt = require('jsonwebtoken');
const pool = require('../config/db');

// Track online users: { userId -> socketId }
const onlineUsers = new Map();

module.exports = (io) => {

  // ─── AUTH MIDDLEWARE ─────────────────────────────────────────────────────
  // Every socket connection must send a valid JWT
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error('Authentication required'));

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.id;
      socket.username = decoded.username;
      next();
    } catch (err) {
      next(new Error('Invalid token'));
    }
  });

  // ─── CONNECTION ──────────────────────────────────────────────────────────
  io.on('connection', async (socket) => {
    console.log(`⚡ ${socket.username} connected [${socket.id}]`);

    // Store in online map
    onlineUsers.set(socket.userId, socket.id);

    // Update DB
    await pool.query(
      'UPDATE users SET is_online = TRUE, last_seen = NOW() WHERE id = $1',
      [socket.userId]
    );

    // Join all the user's chat rooms
    try {
      const chats = await pool.query(
        'SELECT chat_id FROM chat_members WHERE user_id = $1',
        [socket.userId]
      );
      chats.rows.forEach(row => socket.join(row.chat_id));
    } catch (err) {
      console.error('Failed to join rooms:', err.message);
    }

    // Broadcast online status to everyone who shares a chat with this user
    socket.broadcast.emit('user:online', {
      userId: socket.userId,
      username: socket.username
    });

    // ─── SEND MESSAGE ──────────────────────────────────────────────────────
    // Payload: { chatId, content, replyTo? }
    socket.on('message:send', async (data, callback) => {
      const { chatId, content, replyTo } = data;

      if (!chatId || !content || content.trim() === '') {
        return callback?.({ error: 'chatId and content required' });
      }

      try {
        // Verify sender is a member
        const memberCheck = await pool.query(
          'SELECT 1 FROM chat_members WHERE chat_id = $1 AND user_id = $2',
          [chatId, socket.userId]
        );
        if (memberCheck.rows.length === 0) {
          return callback?.({ error: 'Not a member of this chat' });
        }

        // Save message
        const result = await pool.query(
          `INSERT INTO messages (chat_id, sender_id, content, reply_to)
           VALUES ($1, $2, $3, $4)
           RETURNING id, content, type, created_at, reply_to`,
          [chatId, socket.userId, content.trim(), replyTo || null]
        );

        const message = {
          ...result.rows[0],
          sender_id: socket.userId,
          sender_username: socket.username,
          chatId
        };

        // Broadcast to everyone in the chat room (including sender)
        io.to(chatId).emit('message:new', message);

        callback?.({ success: true, message });
      } catch (err) {
        console.error('message:send error:', err.message);
        callback?.({ error: 'Failed to send message' });
      }
    });

    // ─── TYPING INDICATOR ─────────────────────────────────────────────────
    // Payload: { chatId, isTyping }
    socket.on('typing', (data) => {
      const { chatId, isTyping } = data;
      socket.to(chatId).emit('typing', {
        userId: socket.userId,
        username: socket.username,
        chatId,
        isTyping
      });
    });

    // ─── MESSAGE REACTION ─────────────────────────────────────────────────
    // Payload: { messageId, emoji, chatId }
    socket.on('reaction:toggle', async (data, callback) => {
      const { messageId, emoji, chatId } = data;

      try {
        // Check if reaction exists
        const existing = await pool.query(
          'SELECT id FROM reactions WHERE message_id = $1 AND user_id = $2',
          [messageId, socket.userId]
        );

        let action;
        if (existing.rows.length > 0) {
          // Remove reaction
          await pool.query(
            'DELETE FROM reactions WHERE message_id = $1 AND user_id = $2',
            [messageId, socket.userId]
          );
          action = 'removed';
        } else {
          // Add reaction
          await pool.query(
            'INSERT INTO reactions (message_id, user_id, emoji) VALUES ($1, $2, $3)',
            [messageId, socket.userId, emoji]
          );
          action = 'added';
        }

        const reactionData = {
          messageId, emoji, chatId,
          userId: socket.userId,
          username: socket.username,
          action
        };

        io.to(chatId).emit('reaction:update', reactionData);
        callback?.({ success: true, action });
      } catch (err) {
        callback?.({ error: 'Failed to update reaction' });
      }
    });

    // ─── JOIN NEW CHAT ROOM ────────────────────────────────────────────────
    // Called after creating a new DM or joining a group
    socket.on('chat:join', (chatId) => {
      socket.join(chatId);
      console.log(`${socket.username} joined room ${chatId}`);
    });

    // ─── DISCONNECT ───────────────────────────────────────────────────────
    socket.on('disconnect', async () => {
      console.log(`💤 ${socket.username} disconnected`);

      onlineUsers.delete(socket.userId);

      await pool.query(
        'UPDATE users SET is_online = FALSE, last_seen = NOW() WHERE id = $1',
        [socket.userId]
      );

      io.emit('user:offline', {
        userId: socket.userId,
        username: socket.username,
        lastSeen: new Date()
      });
    });
  });
};
