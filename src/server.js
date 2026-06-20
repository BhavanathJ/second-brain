const express = require('express');
const cors = require('cors');
const config = require('./config/env');
const authRoutes = require('./routes/authRoutes');

const app = express();

app.use(cors({ origin: config.corsOrigin }));
app.use(express.json());

// Simple liveness check — useful for confirming the server's up,
// and Render's health checks will hit this too once deployed.
app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.use('/api/auth', authRoutes);

// Catch-all error handler — anything thrown in a controller that wasn't
// caught explicitly lands here instead of crashing the whole process.
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
});

app.listen(config.port, () => {
  console.log(`Second Brain API running on port ${config.port} (${config.nodeEnv})`);
});
