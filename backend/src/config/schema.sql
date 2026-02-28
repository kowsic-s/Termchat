-- TermChat Database Schema
-- Run this in Supabase > SQL Editor

-- ─── USERS ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username    VARCHAR(30) UNIQUE NOT NULL,
  phone       VARCHAR(20) UNIQUE,
  email       VARCHAR(100) UNIQUE,
  avatar_url  TEXT,
  bio         TEXT DEFAULT '',
  karma       INTEGER DEFAULT 0,
  is_online   BOOLEAN DEFAULT FALSE,
  last_seen   TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ─── OTP CODES ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS otp_codes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier  VARCHAR(100) NOT NULL,  -- phone or email
  code        VARCHAR(6) NOT NULL,
  expires_at  TIMESTAMP WITH TIME ZONE NOT NULL,
  used        BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ─── REFRESH TOKENS ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  token       TEXT UNIQUE NOT NULL,
  expires_at  TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ─── CHATS ────────────────────────────────────────────────────────────────
-- A "chat" can be a DM (2 members) or a group (many members)
CREATE TABLE IF NOT EXISTS chats (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(100),           -- null for DMs, required for groups
  is_group    BOOLEAN DEFAULT FALSE,
  created_by  UUID REFERENCES users(id),
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ─── CHAT MEMBERS ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chat_members (
  chat_id     UUID REFERENCES chats(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  role        VARCHAR(10) DEFAULT 'member', -- 'admin' or 'member'
  joined_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (chat_id, user_id)
);

-- ─── MESSAGES ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id     UUID REFERENCES chats(id) ON DELETE CASCADE,
  sender_id   UUID REFERENCES users(id),
  content     TEXT NOT NULL,
  type        VARCHAR(20) DEFAULT 'text', -- 'text', 'image', 'system'
  reply_to    UUID REFERENCES messages(id), -- for reply feature
  is_deleted  BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ─── MESSAGE REACTIONS ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reactions (
  message_id  UUID REFERENCES messages(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  emoji       VARCHAR(10) NOT NULL,   -- '+1', 'lol', 'rip', etc.
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (message_id, user_id)
);

-- ─── INDEXES (for performance) ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
CREATE INDEX IF NOT EXISTS idx_chat_members_user_id ON chat_members(user_id);
CREATE INDEX IF NOT EXISTS idx_otp_identifier ON otp_codes(identifier);
