const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const config = require('./config/env');
const authRoutes = require('./routes/authRoutes');
const taskRoutes = require('./routes/taskRoutes');
const noteRoutes = require('./routes/noteRoutes');
const reminderRoutes = require('./routes/reminderRoutes');
const binRoutes = require('./routes/binRoutes');
const settingsRoutes = require('./routes/settingsRoutes');
const habitRoutes = require('./routes/habitRoutes');
const { fireReminders } = require('./services/reminderService');
const { purgeExpiredEntries } = require('./controllers/binController');

const app = express();

app.use(cors({ origin: config.corsOrigin }));
app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.use('/api/auth', authRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/notes', noteRoutes);
app.use('/api/reminders', reminderRoutes);
app.use('/api/bin', binRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/habits', habitRoutes);

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