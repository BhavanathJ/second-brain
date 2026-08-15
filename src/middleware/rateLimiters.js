const rateLimit = require('express-rate-limit');
const config = require('../config/env');

// In dev, rate limits would block the repeated wrong-password/retry
// testing that's a normal part of building this app in Postman —
// skip enforcement outside production rather than requiring a manual
// toggle that's easy to forget to flip back.
const isDev = config.nodeEnv !== 'production';

function makeLimiter({ windowMs, max, message }) {
    return rateLimit({
        windowMs,
        max,
        standardHeaders: true,
        legacyHeaders: false,
        skip: () => isDev,
        // Matches this project's existing error shape ({ error: "..." })
        // used by every controller, so apiFetch's error parsing and the
        // frontend's toast system display this the same as any other error.
        handler: (req, res) => {
            res.status(429).json({ error: message });
        },
    });
}

// Login is the primary brute-force target — tight enough to make
// automated guessing impractical, generous enough that a real person
// mistyping their password a few times in a row won't get locked out.
const loginLimiter = makeLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10,
    message: 'Too many login attempts. Please try again in 15 minutes.',
});

// Signups are rare in normal use — this mainly guards against
// automated account-creation spam, not real usage patterns.
const signupLimiter = makeLimiter({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5,
    message: 'Too many accounts created from this location. Please try again later.',
});

// Refresh fires automatically every ~15 min per active session, and
// can happen from multiple tabs/profiles at once — generous ceiling
// so normal multi-tab usage never gets blocked, still caps abuse of
// a stolen/leaked refresh token being replayed rapidly.
const refreshLimiter = makeLimiter({
    windowMs: 15 * 60 * 1000,
    max: 60,
    message: 'Too many refresh attempts. Please try again shortly.',
});

// Already requires being logged in, but still guards against
// automated password-guessing via a stolen access token.
const changePasswordLimiter = makeLimiter({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: 'Too many password change attempts. Please try again in 15 minutes.',
});

// General safety net across the whole API — generous enough not to
// interfere with normal usage (Dashboard alone fires several parallel
// requests per load), but caps runaway abuse or a client-side bug that
// hammers the API in a loop.
const globalApiLimiter = makeLimiter({
    windowMs: 15 * 60 * 1000,
    max: 300,
    message: 'Too many requests. Please slow down and try again shortly.',
});

module.exports = {
    loginLimiter,
    signupLimiter,
    refreshLimiter,
    changePasswordLimiter,
    globalApiLimiter,
};