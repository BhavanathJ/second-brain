const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const config = require('./config/env');
const authRoutes = require('./routes/authRoutes');
const taskRoutes = require('./routes/taskRoutes');
const noteRoutes = require('./routes/noteRoutes');
const reminderRoutes = require('./routes/reminderRoutes');
const { fireReminders } = require('./services/reminderService');

const app = express();

app.use(cors({ origin: config.corsOrigin }));
app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.use('/api/auth', authRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/notes', noteRoutes);
app.use('/api/reminders', reminderRoutes);

// Fires every minute — checks for due reminders across all profiles.
// '* * * * *' = every minute. Errors are caught and logged so a single
// cron failure never crashes the whole Express process.
cron.schedule('* * * * *', async () => {
  try {
    await fireReminders();
  } catch (err) {
    console.error('[cron] fireReminders failed:', err);
  }
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
});

app.listen(config.port, () => {
  console.log(`Second Brain API running on port ${config.port} (${config.nodeEnv})`);
});