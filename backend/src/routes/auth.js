const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const pool = require('../config/db');

// ─── HELPERS ────────────────────────────────────────────────────────────────

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit
}

function generateTokens(user) {
  const accessToken = jwt.sign(
    { id: user.id, username: user.username },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN }
  );
  const refreshToken = jwt.sign(
    { id: user.id },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN }
  );
  return { accessToken, refreshToken };
}

// ─── ROUTES ─────────────────────────────────────────────────────────────────

// POST /auth/send-otp
// Body: { identifier: "phone or email" }
router.post('/send-otp', async (req, res) => {
  const { identifier } = req.body;
  if (!identifier) return res.status(400).json({ error: 'identifier required' });

  try {
    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Delete any existing unused OTPs for this identifier
    await pool.query(
      'DELETE FROM otp_codes WHERE identifier = $1 AND used = FALSE',
      [identifier]
    );

    // Store new OTP
    await pool.query(
      'INSERT INTO otp_codes (identifier, code, expires_at) VALUES ($1, $2, $3)',
      [identifier, otp, expiresAt]
    );

    // In production: send via Twilio SMS or email
    // For now: return OTP in response (DEVELOPMENT ONLY - remove in production!)
    console.log(`🔑 OTP for ${identifier}: ${otp}`);

    res.json({
      message: 'OTP sent successfully',
      // Remove the line below in production!
      dev_otp: otp
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to send OTP' });
  }
});

// POST /auth/verify-otp
// Body: { identifier, otp, username (only on first signup) }
router.post('/verify-otp', async (req, res) => {
  const { identifier, otp, username } = req.body;
  console.log('verify-otp received:', { identifier, otp, username });
  if (!identifier || !otp) {
    return res.status(400).json({ error: 'identifier and otp required' });
  }

  try {
    // Check OTP
    const otpResult = await pool.query(
      `SELECT * FROM otp_codes 
       WHERE identifier = $1 AND code = $2 AND used = FALSE AND expires_at > NOW()
       ORDER BY created_at DESC LIMIT 1`,
      [identifier, otp]
    );

    if (otpResult.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired OTP' });
    }

    // Check if user exists
    const field = identifier.includes('@') ? 'email' : 'phone';
    let userResult = await pool.query(
      `SELECT * FROM users WHERE ${field} = $1`,
      [identifier]
    );

    // Mark OTP as used only when login or signup is complete
    if (userResult.rows.length > 0 || username) {
      await pool.query(
        'UPDATE otp_codes SET used = TRUE WHERE id = $1',
        [otpResult.rows[0].id]
      );
    }

    let user;
    let isNewUser = false;

    if (userResult.rows.length === 0) {
      // New user - username required
      if (!username) {
        return res.status(200).json({ 
          error: 'New user - username required',
          isNewUser: true 
        });
      }

      // Check username taken
      const usernameCheck = await pool.query(
        'SELECT id FROM users WHERE username = $1',
        [username]
      );
      if (usernameCheck.rows.length > 0) {
        return res.status(400).json({ error: 'Username already taken' });
      }

      // Create user
      const newUser = await pool.query(
        `INSERT INTO users (${field}, username) VALUES ($1, $2) RETURNING *`,
        [identifier, username]
      );
      user = newUser.rows[0];
      isNewUser = true;
    } else {
      user = userResult.rows[0];
    }

    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(user);

    // Store refresh token
    const refreshExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await pool.query(
      'INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)',
      [user.id, refreshToken, refreshExpiry]
    );

    // Update online status
    await pool.query(
      'UPDATE users SET is_online = TRUE, last_seen = NOW() WHERE id = $1',
      [user.id]
    );

    res.json({
      message: isNewUser ? 'Account created' : 'Login successful',
      isNewUser,
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        username: user.username,
        karma: user.karma,
        createdAt: user.created_at
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Auth failed' });
  }
});

// POST /auth/refresh
// Body: { refreshToken }
router.post('/refresh', async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(400).json({ error: 'Refresh token required' });

  try {
    // Verify token
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);

    // Check if token exists in DB
    const tokenResult = await pool.query(
      'SELECT * FROM refresh_tokens WHERE token = $1 AND expires_at > NOW()',
      [refreshToken]
    );
    if (tokenResult.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid refresh token' });
    }

    // Get user
    const userResult = await pool.query(
      'SELECT * FROM users WHERE id = $1',
      [decoded.id]
    );
    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];
    const { accessToken, refreshToken: newRefreshToken } = generateTokens(user);

    // Rotate refresh token
    await pool.query('DELETE FROM refresh_tokens WHERE token = $1', [refreshToken]);
    const newExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await pool.query(
      'INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)',
      [user.id, newRefreshToken, newExpiry]
    );

    res.json({ accessToken, refreshToken: newRefreshToken });
  } catch (err) {
    res.status(401).json({ error: 'Invalid refresh token' });
  }
});

// POST /auth/logout
router.post('/logout', async (req, res) => {
  const { refreshToken } = req.body;
  if (refreshToken) {
    await pool.query('DELETE FROM refresh_tokens WHERE token = $1', [refreshToken]);
  }
  res.json({ message: 'Logged out' });
});

module.exports = router;
