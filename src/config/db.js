const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbDir = path.resolve(__dirname, '../../db');
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = process.env.SQLITE_DB_PATH
    ? path.resolve(process.env.SQLITE_DB_PATH)
    : path.join(dbDir, 'second_brain.sqlite');

const db = new Database(dbPath);

// Enable WAL mode & foreign keys for high performance and integrity
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function initSchema() {
    db.exec(`
        -- USERS
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            name TEXT,
            username TEXT UNIQUE,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'USER',
            status TEXT NOT NULL DEFAULT 'active',
            must_reset_password INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        -- PROFILES
        CREATE TABLE IF NOT EXISTS profiles (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        -- REFRESH TOKENS
        CREATE TABLE IF NOT EXISTS refresh_tokens (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
            token_hash TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            revoked_at TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        -- SETTINGS
        CREATE TABLE IF NOT EXISTS settings (
            profile_id TEXT PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
            timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
            theme TEXT NOT NULL DEFAULT 'light',
            week_starts_on INTEGER NOT NULL DEFAULT 0,
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        -- TASKS
        CREATE TABLE IF NOT EXISTS tasks (
            id TEXT PRIMARY KEY,
            profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
            title TEXT NOT NULL,
            description TEXT,
            status TEXT NOT NULL DEFAULT 'pending',
            urgent INTEGER NOT NULL DEFAULT 0,
            important INTEGER NOT NULL DEFAULT 0,
            due_at TEXT,
            deleted_at TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        -- NOTES
        CREATE TABLE IF NOT EXISTS notes (
            id TEXT PRIMARY KEY,
            profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
            content TEXT NOT NULL,
            tags TEXT NOT NULL DEFAULT '[]',
            converted_task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
            deleted_at TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        -- HABITS
        CREATE TABLE IF NOT EXISTS habits (
            id TEXT PRIMARY KEY,
            profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
            title TEXT NOT NULL,
            target_per_week INTEGER NOT NULL DEFAULT 7,
            deleted_at TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        -- HABIT LOGS
        CREATE TABLE IF NOT EXISTS habit_logs (
            id TEXT PRIMARY KEY,
            habit_id TEXT NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
            profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
            log_date TEXT NOT NULL,
            completed INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE (habit_id, log_date)
        );

        -- CALENDAR EVENTS
        CREATE TABLE IF NOT EXISTS calendar_events (
            id TEXT PRIMARY KEY,
            profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
            title TEXT NOT NULL,
            starts_at TEXT NOT NULL,
            ends_at TEXT,
            location TEXT,
            deleted_at TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        -- REMINDERS
        CREATE TABLE IF NOT EXISTS reminders (
            id TEXT PRIMARY KEY,
            profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
            title TEXT NOT NULL,
            remind_at TEXT NOT NULL,
            entity_type TEXT,
            entity_id TEXT,
            is_done INTEGER NOT NULL DEFAULT 0,
            deleted_at TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        -- BIN ENTRIES
        CREATE TABLE IF NOT EXISTS bin_entries (
            id TEXT PRIMARY KEY,
            profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
            entity_type TEXT NOT NULL,
            entity_id TEXT NOT NULL,
            deleted_at TEXT NOT NULL DEFAULT (datetime('now')),
            auto_purge_at TEXT NOT NULL
        );

        -- SYSTEM SETTINGS (Access control & rate limiting)
        CREATE TABLE IF NOT EXISTS system_settings (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            self_signup_enabled INTEGER NOT NULL DEFAULT 1,
            rate_limit_enabled INTEGER NOT NULL DEFAULT 1,
            rate_limit_window_minutes INTEGER NOT NULL DEFAULT 15,
            rate_limit_max_attempts INTEGER NOT NULL DEFAULT 20,
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        -- LOGIN ATTEMPTS (For dynamic lockout & admin reset)
        CREATE TABLE IF NOT EXISTS login_attempts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            identifier TEXT NOT NULL,
            ip_address TEXT,
            failed_count INTEGER NOT NULL DEFAULT 1,
            last_attempt_at TEXT NOT NULL DEFAULT (datetime('now')),
            locked_until TEXT
        );

        -- Ensure default system_settings row exists
        INSERT OR IGNORE INTO system_settings (id, self_signup_enabled, rate_limit_enabled, rate_limit_window_minutes, rate_limit_max_attempts)
        VALUES (1, 1, 1, 15, 20);
    `);
}

initSchema();

module.exports = db;
