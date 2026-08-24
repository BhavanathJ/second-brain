const express = require('express');

const cors = require('cors');
const cron = require('node-cron');
const config = require('./config/env');
const authRoutes = require('./routes/authRoutes');
const profileRoutes = require('./routes/profileRoutes');
const taskRoutes = require('./routes/taskRoutes');
const noteRoutes = require('./routes/noteRoutes');
const reminderRoutes = require('./routes/reminderRoutes');
const binRoutes = require('./routes/binRoutes');
const settingsRoutes = require('./routes/settingsRoutes');
const habitRoutes = require('./routes/habitRoutes');
const calendarEventRoutes = require('./routes/calendarEventRoutes');
const calendarRoutes = require('./routes/calendarRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const { fireReminders } = require('./services/reminderService');
const { purgeExpiredEntries } = require('./controllers/binController');

const app = express();

// Required for express-rate-limit to see the REAL client IP once this
// is deployed behind Render's reverse proxy — without this, every user
// would be silently lumped into one shared rate-limit bucket (the
// proxy's IP), rate-limiting each other instead of themselves.
app.set('trust proxy', 1);

const allowedOrigins = Array.isArray(config.corsOrigin)
    ? config.corsOrigin
    : [config.corsOrigin];

app.use(express.json());

app.use('/api', cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (same-origin requests, file://, etc.)
        // and requests from allowed origins
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true
}));

const { globalApiLimiter } = require('./middleware/rateLimiters');
app.use('/api', globalApiLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/profiles', profileRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/notes', noteRoutes);
app.use('/api/reminders', reminderRoutes);
app.use('/api/bin', binRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/habits', habitRoutes);
app.use('/api/calendar-events', calendarEventRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/dashboard', dashboardRoutes);

app.get('/health', (req, res) => res.json({ status: 'ok' }));

cron.schedule('* * * * *', async () => {
  try {
    await fireReminders();
  } catch (err) {
    console.error('[cron] fireReminders failed:', err);
  }
});

cron.schedule('0 0 * * *', async () => {
  try {
    await purgeExpiredEntries();
  } catch (err) {
    console.error('[cron] purgeExpiredEntries failed:', err);
  }
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
});

app.listen(config.port, () => {
  console.log(`Second Brain API running on port ${config.port} (${config.nodeEnv})`);
});