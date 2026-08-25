const db = require('../config/db');
const { v4: uuidv4 } = require('uuid');
const { hashPassword } = require('../utils/password');

function getAdminSettings() {
    const stmt = db.prepare('SELECT * FROM system_settings WHERE id = 1');
    const settings = stmt.get();
    return {
        self_signup_enabled: Boolean(settings.self_signup_enabled),
        rate_limit_enabled: Boolean(settings.rate_limit_enabled),
        rate_limit_window_minutes: settings.rate_limit_window_minutes,
        rate_limit_max_attempts: settings.rate_limit_max_attempts,
        updated_at: settings.updated_at
    };
}

function updateAdminSettings({ self_signup_enabled, rate_limit_enabled, rate_limit_window_minutes, rate_limit_max_attempts }) {
    const current = getAdminSettings();
    const selfSignup = self_signup_enabled !== undefined ? (self_signup_enabled ? 1 : 0) : (current.self_signup_enabled ? 1 : 0);
    const rateLimit = rate_limit_enabled !== undefined ? (rate_limit_enabled ? 1 : 0) : (current.rate_limit_enabled ? 1 : 0);
    const windowMin = rate_limit_window_minutes !== undefined ? Number(rate_limit_window_minutes) : current.rate_limit_window_minutes;
    const maxAttempts = rate_limit_max_attempts !== undefined ? Number(rate_limit_max_attempts) : current.rate_limit_max_attempts;

    const stmt = db.prepare(`
        UPDATE system_settings
        SET self_signup_enabled = ?, rate_limit_enabled = ?, rate_limit_window_minutes = ?, rate_limit_max_attempts = ?, updated_at = datetime('now')
        WHERE id = 1
    `);
    stmt.run(selfSignup, rateLimit, windowMin, maxAttempts);

    return getAdminSettings();
}

function checkRateLimit(identifier, ip) {
    const settings = getAdminSettings();
    if (!settings.rate_limit_enabled) return { isLocked: false };

    const cleanIdentifier = identifier ? identifier.trim().toLowerCase() : '';
    const windowMinutes = settings.rate_limit_window_minutes;
    const maxAttempts = settings.rate_limit_max_attempts;
    const windowMillis = windowMinutes * 60 * 1000;
    const now = Date.now();

    let record = null;
    if (cleanIdentifier) {
        record = db.prepare(`
            SELECT * FROM login_attempts
            WHERE LOWER(identifier) = ?
            ORDER BY last_attempt_at DESC
            LIMIT 1
        `).get(cleanIdentifier);
    }

    if (!record && ip) {
        record = db.prepare(`
            SELECT * FROM login_attempts
            WHERE ip_address = ?
            ORDER BY last_attempt_at DESC
            LIMIT 1
        `).get(ip);
    }

    if (!record) return { isLocked: false };

    // Standardize ISO parsing
    const rawTime = record.last_attempt_at.includes('T') ? record.last_attempt_at : (record.last_attempt_at.replace(' ', 'T') + 'Z');
    const lastAttemptTime = new Date(rawTime).getTime();

    // Check if explicitly locked until a future timestamp
    if (record.locked_until) {
        const rawLock = record.locked_until.includes('T') ? record.locked_until : (record.locked_until.replace(' ', 'T') + 'Z');
        const lockTime = new Date(rawLock).getTime();
        if (lockTime > now) {
            const minutesLeft = Math.max(1, Math.ceil((lockTime - now) / 60000));
            return {
                isLocked: true,
                message: `Account or IP is temporarily locked due to too many failed login attempts (${record.failed_count}/${maxAttempts}). Please try again in ${minutesLeft} minute(s).`
            };
        }
    }

    // Check if current attempts within the active sliding window reach/exceed maxAttempts
    if (now - lastAttemptTime <= windowMillis && record.failed_count >= maxAttempts) {
        const minutesLeft = Math.max(1, Math.ceil((windowMillis - (now - lastAttemptTime)) / 60000));
        return {
            isLocked: true,
            message: `Too many failed login attempts (${record.failed_count}/${maxAttempts}). Please try again in ${minutesLeft} minute(s).`
        };
    }

    return { isLocked: false };
}

function recordFailedLogin(identifier, ip) {
    const settings = getAdminSettings();
    if (!settings.rate_limit_enabled) return;

    const cleanIdentifier = identifier ? identifier.trim().toLowerCase() : '';
    const windowMinutes = settings.rate_limit_window_minutes;
    const maxAttempts = settings.rate_limit_max_attempts;
    const windowMillis = windowMinutes * 60 * 1000;
    const now = Date.now();
    const nowISO = new Date().toISOString();

    const stmt = db.prepare(`
        SELECT * FROM login_attempts
        WHERE LOWER(identifier) = ?
        ORDER BY last_attempt_at DESC
        LIMIT 1
    `);
    const record = cleanIdentifier ? stmt.get(cleanIdentifier) : null;

    if (record) {
        const rawTime = record.last_attempt_at.includes('T') ? record.last_attempt_at : (record.last_attempt_at.replace(' ', 'T') + 'Z');
        const lastAttempt = new Date(rawTime).getTime();
        let newCount = record.failed_count + 1;
        if (now - lastAttempt > windowMillis) {
            newCount = 1; // Window reset after inactivity
        }

        let lockedUntil = null;
        if (newCount >= maxAttempts) {
            lockedUntil = new Date(now + windowMillis).toISOString();
        }

        const updateStmt = db.prepare(`
            UPDATE login_attempts
            SET failed_count = ?, last_attempt_at = ?, locked_until = ?, ip_address = ?
            WHERE id = ?
        `);
        updateStmt.run(newCount, nowISO, lockedUntil, ip || '', record.id);

    } else {
        let lockedUntil = null;
        if (maxAttempts <= 1) {
            lockedUntil = new Date(now + windowMillis).toISOString();
        }

        const insertStmt = db.prepare(`
            INSERT INTO login_attempts (identifier, ip_address, failed_count, last_attempt_at, locked_until)
            VALUES (?, ?, 1, ?, ?)
        `);
        insertStmt.run(cleanIdentifier, ip || '', nowISO, lockedUntil);
    }
}


function resetLoginAttempts(identifier) {
    if (!identifier) return;
    const cleanIdentifier = identifier.trim().toLowerCase();
    const stmt = db.prepare(`
        DELETE FROM login_attempts
        WHERE LOWER(identifier) = ? OR LOWER(identifier) LIKE ?
    `);
    stmt.run(cleanIdentifier, `%${cleanIdentifier}%`);
}


function getLockedAccounts() {
    const settings = getAdminSettings();
    if (!settings.rate_limit_enabled) return [];

    const windowMinutes = settings.rate_limit_window_minutes;
    const maxAttempts = settings.rate_limit_max_attempts;
    const windowMillis = windowMinutes * 60 * 1000;
    const now = Date.now();

    const attempts = db.prepare(`
        SELECT id, identifier, ip_address, failed_count, last_attempt_at, locked_until
        FROM login_attempts
        ORDER BY last_attempt_at DESC
    `).all();

    const lockedList = [];

    for (const record of attempts) {
        const rawTime = record.last_attempt_at.includes('T') ? record.last_attempt_at : (record.last_attempt_at.replace(' ', 'T') + 'Z');
        const lastAttemptTime = new Date(rawTime).getTime();

        let isLocked = false;
        let minutesRemaining = 0;

        if (record.locked_until) {
            const rawLock = record.locked_until.includes('T') ? record.locked_until : (record.locked_until.replace(' ', 'T') + 'Z');
            const lockTime = new Date(rawLock).getTime();
            if (lockTime > now) {
                isLocked = true;
                minutesRemaining = Math.max(1, Math.ceil((lockTime - now) / 60000));
            }
        }

        if (!isLocked && (now - lastAttemptTime <= windowMillis) && record.failed_count >= maxAttempts) {
            isLocked = true;
            minutesRemaining = Math.max(1, Math.ceil((windowMillis - (now - lastAttemptTime)) / 60000));
        }

        if (isLocked) {
            lockedList.push({
                id: record.id,
                identifier: record.identifier,
                ip_address: record.ip_address,
                failed_count: record.failed_count,
                max_attempts: maxAttempts,
                last_attempt_at: record.last_attempt_at,
                locked_until: record.locked_until,
                minutes_remaining: minutesRemaining
            });
        }
    }

    return lockedList;
}

function getAllUsers() {
    const stmt = db.prepare(`
        SELECT id, name, username, email, role, status, must_reset_password, created_at
        FROM users
        ORDER BY created_at ASC
    `);
    const users = stmt.all();
    const lockedAccounts = getLockedAccounts();
    const lockedMap = new Map();
    for (const l of lockedAccounts) {
        if (l.identifier) lockedMap.set(l.identifier.toLowerCase(), l);
    }

    return users.map(u => {
        const userLocked = lockedMap.get(u.email.toLowerCase()) || (u.username ? lockedMap.get(u.username.toLowerCase()) : null);
        return {
            ...u,
            must_reset_password: Boolean(u.must_reset_password),
            is_locked: Boolean(userLocked),
            locked_remaining: userLocked?.minutes_remaining || 0
        };
    });
}


async function adminCreateUser({ name, username, email, password, role = 'USER', status = 'active', must_reset_password = false }) {
    const cleanEmail = email.trim().toLowerCase();
    const cleanUsername = username ? username.trim().toLowerCase() : cleanEmail.split('@')[0];
    const displayName = name ? name.trim() : cleanUsername;

    // Check duplicate
    const existing = db.prepare('SELECT id FROM users WHERE LOWER(email) = ? OR LOWER(username) = ?').get(cleanEmail, cleanUsername);
    if (existing) {
        throw new Error('User with this email or username already exists.');
    }

    const passwordHash = await hashPassword(password);
    const userId = uuidv4();

    const insertUser = db.prepare(`
        INSERT INTO users (id, name, username, email, password_hash, role, status, must_reset_password, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `);
    insertUser.run(userId, displayName, cleanUsername, cleanEmail, passwordHash, role, status, must_reset_password ? 1 : 0);

    // Create default profile and default settings
    const profileId = uuidv4();
    const insertProfile = db.prepare(`
        INSERT INTO profiles (id, user_id, name, created_at)
        VALUES (?, ?, 'Default', datetime('now'))
    `);
    insertProfile.run(profileId, userId);

    const insertSettings = db.prepare(`
        INSERT INTO settings (profile_id, timezone, theme, week_starts_on, updated_at)
        VALUES (?, 'Asia/Kolkata', 'light', 0, datetime('now'))
    `);
    insertSettings.run(profileId);

    return {
        id: userId,
        name: displayName,
        username: cleanUsername,
        email: cleanEmail,
        role,
        status,
        must_reset_password: Boolean(must_reset_password)
    };
}

function adminUpdateUser(userId, fields) {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!user) throw new Error('User not found.');

    const newRole = fields.role !== undefined ? fields.role : user.role;
    const newStatus = fields.status !== undefined ? fields.status : user.status;
    const newMustReset = fields.must_reset_password !== undefined ? (fields.must_reset_password ? 1 : 0) : user.must_reset_password;
    const newName = fields.name !== undefined ? fields.name.trim() : user.name;

    const stmt = db.prepare(`
        UPDATE users
        SET role = ?, status = ?, must_reset_password = ?, name = ?
        WHERE id = ?
    `);
    stmt.run(newRole, newStatus, newMustReset, newName, userId);

    return {
        id: user.id,
        name: newName,
        username: user.username,
        email: user.email,
        role: newRole,
        status: newStatus,
        must_reset_password: Boolean(newMustReset)
    };
}

async function adminResetPassword(userId, newPassword) {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!user) throw new Error('User not found.');

    const newHash = await hashPassword(newPassword);
    const stmt = db.prepare(`
        UPDATE users
        SET password_hash = ?, must_reset_password = 1
        WHERE id = ?
    `);
    stmt.run(newHash, userId);

    // Invalidate all tokens for this user
    db.prepare(`UPDATE refresh_tokens SET revoked_at = datetime('now') WHERE user_id = ?`).run(userId);
}

function adminDeleteUser(adminUserId, targetUserId) {
    if (adminUserId === targetUserId) {
        throw new Error('Cannot delete your own admin account.');
    }

    const stmt = db.prepare('DELETE FROM users WHERE id = ?');
    stmt.run(targetUserId);
}

module.exports = {
    getAdminSettings,
    updateAdminSettings,
    checkRateLimit,
    recordFailedLogin,
    resetLoginAttempts,
    getLockedAccounts,
    getAllUsers,
    adminCreateUser,
    adminUpdateUser,
    adminResetPassword,
    adminDeleteUser,
};

