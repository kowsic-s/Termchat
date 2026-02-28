const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const auth = require('../middleware/auth');

// GET /chats  ← list all your chats
router.get('/', auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT 
        c.id, c.name, c.is_group, c.created_at,
        -- last message
        m.content as last_message,
        m.created_at as last_message_at,
        -- unread count (simplified)
        COUNT(DISTINCT cm2.user_id) as member_count
       FROM chats c
       JOIN chat_members cm ON cm.chat_id = c.id AND cm.user_id = $1
       LEFT JOIN messages m ON m.id = (
         SELECT id FROM messages 
         WHERE chat_id = c.id AND is_deleted = FALSE
         ORDER BY created_at DESC LIMIT 1
       )
       LEFT JOIN chat_members cm2 ON cm2.chat_id = c.id
       GROUP BY c.id, m.content, m.created_at
       ORDER BY COALESCE(m.created_at, c.created_at) DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /chats/dm  ← start a DM with someone
// Body: { userId }
router.post('/dm', auth, async (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId required' });
  if (userId === req.user.id) return res.status(400).json({ error: 'Cannot DM yourself' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Check if DM already exists between these two users
    const existing = await client.query(
      `SELECT c.id FROM chats c
       JOIN chat_members cm1 ON cm1.chat_id = c.id AND cm1.user_id = $1
       JOIN chat_members cm2 ON cm2.chat_id = c.id AND cm2.user_id = $2
       WHERE c.is_group = FALSE`,
      [req.user.id, userId]
    );

    if (existing.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.json({ chatId: existing.rows[0].id, existing: true });
    }

    // Create new DM chat
    const chat = await client.query(
      'INSERT INTO chats (is_group, created_by) VALUES (FALSE, $1) RETURNING *',
      [req.user.id]
    );
    const chatId = chat.rows[0].id;

    // Add both users
    await client.query(
      'INSERT INTO chat_members (chat_id, user_id) VALUES ($1, $2), ($1, $3)',
      [chatId, req.user.id, userId]
    );

    await client.query('COMMIT');
    res.status(201).json({ chatId, existing: false });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Failed to create DM' });
  } finally {
    client.release();
  }
});

// POST /chats/group  ← create a group chat
// Body: { name, memberIds: [] }
router.post('/group', auth, async (req, res) => {
  const { name, memberIds } = req.body;
  if (!name) return res.status(400).json({ error: 'Group name required' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const chat = await client.query(
      'INSERT INTO chats (name, is_group, created_by) VALUES ($1, TRUE, $2) RETURNING *',
      [name, req.user.id]
    );
    const chatId = chat.rows[0].id;

    // Add creator as admin
    await client.query(
      'INSERT INTO chat_members (chat_id, user_id, role) VALUES ($1, $2, $3)',
      [chatId, req.user.id, 'admin']
    );

    // Add other members
    if (memberIds && memberIds.length > 0) {
      const memberInserts = memberIds
        .filter(id => id !== req.user.id)
        .map(id => `('${chatId}', '${id}', 'member')`)
        .join(', ');
      if (memberInserts) {
        await client.query(
          `INSERT INTO chat_members (chat_id, user_id, role) VALUES ${memberInserts}`
        );
      }
    }

    // System message
    await client.query(
      `INSERT INTO messages (chat_id, sender_id, content, type)
       VALUES ($1, $2, $3, 'system')`,
      [chatId, req.user.id, `Group "${name}" created`]
    );

    await client.query('COMMIT');
    res.status(201).json({ chatId, name });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Failed to create group' });
  } finally {
    client.release();
  }
});

// GET /chats/:chatId/messages  ← get messages with pagination
router.get('/:chatId/messages', auth, async (req, res) => {
  const { chatId } = req.params;
  const { before, limit = 50 } = req.query;

  try {
    // Verify user is a member
    const memberCheck = await pool.query(
      'SELECT 1 FROM chat_members WHERE chat_id = $1 AND user_id = $2',
      [chatId, req.user.id]
    );
    if (memberCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Not a member of this chat' });
    }

    const result = await pool.query(
      `SELECT 
        m.id, m.content, m.type, m.created_at, m.reply_to, m.is_deleted,
        u.username as sender_username,
        u.id as sender_id,
        -- get reply message content
        rm.content as reply_content,
        ru.username as reply_username
       FROM messages m
       JOIN users u ON u.id = m.sender_id
       LEFT JOIN messages rm ON rm.id = m.reply_to
       LEFT JOIN users ru ON ru.id = rm.sender_id
       WHERE m.chat_id = $1
         AND ($2::uuid IS NULL OR m.created_at < (SELECT created_at FROM messages WHERE id = $2))
       ORDER BY m.created_at DESC
       LIMIT $3`,
      [chatId, before || null, parseInt(limit)]
    );

    res.json(result.rows.reverse()); // reverse so oldest is first
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /chats/:chatId/members  ← get group members
router.get('/:chatId/members', auth, async (req, res) => {
  const { chatId } = req.params;
  try {
    const memberCheck = await pool.query(
      'SELECT 1 FROM chat_members WHERE chat_id = $1 AND user_id = $2',
      [chatId, req.user.id]
    );
    if (memberCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Not a member' });
    }

    const result = await pool.query(
      `SELECT u.id, u.username, u.bio, u.karma, u.is_online, u.last_seen, cm.role
       FROM chat_members cm
       JOIN users u ON u.id = cm.user_id
       WHERE cm.chat_id = $1
       ORDER BY cm.role DESC, u.username ASC`,
      [chatId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
