-- ============================================================
-- SECOND BRAIN - SUPABASE (POSTGRESQL) FULL SCHEMA
-- ============================================================

-- ----------------------------
-- AUTH / IDENTITY / ACCESS CONTROL
-- ----------------------------

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL DEFAULT '',
  username TEXT UNIQUE,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'USER' CHECK (role IN ('ADMIN', 'USER')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  must_reset_password BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_users_email ON users (LOWER(email));
CREATE INDEX idx_users_username ON users (LOWER(username));

-- Netflix-style profiles. This is the hard isolation boundary -
-- every content table below points at profile_id, never user_id.
CREATE TABLE profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_profiles_user ON profiles (user_id);

-- One row per logged-in device/session. Never store the raw token.
CREATE TABLE refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_refresh_user_active ON refresh_tokens (user_id) WHERE revoked_at IS NULL;

-- ----------------------------
-- SYSTEM / ADMIN CONFIGURATION
-- ----------------------------

CREATE TABLE system_settings (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  self_signup_enabled BOOLEAN NOT NULL DEFAULT true,
  rate_limit_enabled BOOLEAN NOT NULL DEFAULT true,
  rate_limit_window_minutes INT NOT NULL DEFAULT 15,
  rate_limit_max_attempts INT NOT NULL DEFAULT 20,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed single system configuration row
INSERT INTO system_settings (id, self_signup_enabled, rate_limit_enabled, rate_limit_window_minutes, rate_limit_max_attempts)
VALUES (1, true, true, 15, 20)
ON CONFLICT (id) DO NOTHING;

-- Login Attempts & Brute-Force Rate Limiting Table
CREATE TABLE login_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier TEXT NOT NULL,
  ip_address TEXT,
  failed_count INT NOT NULL DEFAULT 1,
  last_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_until TIMESTAMPTZ
);

CREATE INDEX idx_login_attempts_identifier ON login_attempts (LOWER(identifier));
CREATE INDEX idx_login_attempts_ip ON login_attempts (ip_address);

-- ----------------------------
-- USER SETTINGS (one row per profile)
-- ----------------------------

CREATE TABLE settings (
  profile_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  theme TEXT NOT NULL DEFAULT 'light',
  week_starts_on SMALLINT NOT NULL DEFAULT 0, -- 0=Sunday, 1=Monday (default: Sunday)
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----------------------------
-- TASKS (owns Eisenhower Matrix too - urgent/important are just columns)
-- ----------------------------

CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | done
  urgent BOOLEAN NOT NULL DEFAULT false,
  important BOOLEAN NOT NULL DEFAULT false,
  due_at TIMESTAMPTZ,           -- presence of this = task auto-appears on Calendar
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tasks_profile_active ON tasks (profile_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_tasks_due ON tasks (profile_id, due_at) WHERE deleted_at IS NULL AND due_at IS NOT NULL;

-- ----------------------------
-- NOTES & CAPTURES
-- ----------------------------

CREATE TABLE notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  tags TEXT[] NOT NULL DEFAULT '{}', -- free text tags, no managed tag table
  converted_task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notes_profile_active ON notes (profile_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_notes_tags ON notes USING GIN (tags);

-- ----------------------------
-- HABITS - weekly-quota model
-- ----------------------------

CREATE TABLE habits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  target_per_week SMALLINT NOT NULL DEFAULT 7, -- 7 = daily, else e.g. 3 = "3x/week any days"
  deleted_at TIMESTAMPTZ,        -- soft-delete habit only; habit_logs are NEVER deleted with it
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE habit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  habit_id UUID NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  log_date DATE NOT NULL,        -- the calendar day this completion belongs to
  completed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (habit_id, log_date)    -- one completion row per habit per day
);

CREATE INDEX idx_habitlogs_profile_date ON habit_logs (profile_id, log_date);

-- ----------------------------
-- CALENDAR-ONLY EVENTS
-- ----------------------------

CREATE TABLE calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ,
  location TEXT,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_calendar_profile_active ON calendar_events (profile_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_calendar_starts ON calendar_events (profile_id, starts_at) WHERE deleted_at IS NULL;

-- ----------------------------
-- REMINDERS (standalone AND attachable)
-- ----------------------------

CREATE TABLE reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  remind_at TIMESTAMPTZ NOT NULL,
  entity_type TEXT,   -- NULL | 'task' | 'habit' | 'calendar_event' | 'note'
  entity_id UUID,      -- not a real FK (entity_type decides target table)
  is_done BOOLEAN NOT NULL DEFAULT false,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_reminders_profile_active ON reminders (profile_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_reminders_due ON reminders (profile_id, remind_at) WHERE deleted_at IS NULL AND is_done = false;

-- ----------------------------
-- BIN (soft-delete recovery across all domains)
-- ----------------------------

CREATE TABLE bin_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,   -- 'task' | 'note' | 'habit' | 'calendar_event' | 'reminder'
  entity_id UUID NOT NULL,
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  auto_purge_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 days')
);

CREATE INDEX idx_bin_profile ON bin_entries (profile_id, deleted_at DESC);
