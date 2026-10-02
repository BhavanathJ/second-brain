const express = require('express');
const path = require('path');
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

app.set('trust proxy', 1);

const allowedOrigins = Array.isArray(config.corsOrigin)
  ? config.corsOrigin
  : [config.corsOrigin];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) {
      return callback(null, true);
    }
    if (config.nodeEnv === 'development') {
      if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
        return callback(null, true);
      }
    }
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(null, false);
  },
  credentials: true
}));

app.use(express.json());

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

// Static frontend + 404 fallback — must come AFTER every API route above,
// so Express only reaches these when nothing else matched.
app.use(express.static(path.join(__dirname, '..', 'frontend')));

app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, '..', 'frontend', '404.html'));
});

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