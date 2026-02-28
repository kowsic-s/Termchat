const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const auth = require('../middleware/auth');

// GET /users/me  ← get your own profile
router.get('/me', auth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, username, phone, email, bio, karma, is_online, last_seen, created_at FROM users WHERE id = $1',
      [req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /users/me  ← update your profile
router.patch('/me', auth, async (req, res) => {
  const { username, bio } = req.body;
  try {
    // Check username uniqueness if changing
    if (username) {
      const check = await pool.query(
        'SELECT id FROM users WHERE username = $1 AND id != $2',
        [username, req.user.id]
      );
      if (check.rows.length > 0) {
        return res.status(400).json({ error: 'Username already taken' });
      }
    }

    const result = await pool.query(
      `UPDATE users SET
        username = COALESCE($1, username),
        bio = COALESCE($2, bio)
       WHERE id = $3
       RETURNING id, username, bio, karma, created_at`,
      [username, bio, req.user.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /users/search?q=alice  ← search users by username
router.get('/search', auth, async (req, res) => {
  const { q } = req.query;
  if (!q || q.length < 2) return res.status(400).json({ error: 'Query too short' });

  try {
    const result = await pool.query(
      `SELECT id, username, bio, karma, is_online, last_seen
       FROM users
       WHERE username ILIKE $1 AND id != $2
       LIMIT 20`,
      [`%${q}%`, req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /users/:id  ← view someone's profile (like 'finger @user')
router.get('/:id', auth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, username, bio, karma, is_online, last_seen, created_at FROM users WHERE id = $1',
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
