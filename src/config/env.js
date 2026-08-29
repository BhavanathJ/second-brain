require('dotenv').config();

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
    refreshExpiresInDays: (() => {
      if (!process.env.JWT_REFRESH_EXPIRES_IN_DAYS) {
        console.warn('[config] JWT_REFRESH_EXPIRES_IN_DAYS not set — defaulting to 30 days.');
      }
      return Number(process.env.JWT_REFRESH_EXPIRES_IN_DAYS || 30);
    })(),
  },

  corsOrigin: (process.env.CORS_ORIGIN || 'http://localhost:5500,http://127.0.0.1:5500,http://localhost:3000,http://127.0.0.1:3000,http://localhost:5501,http://127.0.0.1:5501')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
};

module.exports = config;