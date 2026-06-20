require('dotenv').config();

// Fail fast: if a required var is missing, crash on boot with a clear
// message — not three files deep when some random query mysteriously
// breaks because SUPABASE_URL was undefined.
function required(key) {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

const config = {
  port: process.env.PORT || 4000,
  nodeEnv: process.env.NODE_ENV || 'development',

  supabase: {
    url: required('SUPABASE_URL'),
    serviceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY'),
  },

  jwt: {
    accessSecret: required('JWT_ACCESS_SECRET'),
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    refreshExpiresInDays: Number(process.env.JWT_REFRESH_EXPIRES_IN_DAYS || 30),
  },

  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5500',
};

module.exports = config;
