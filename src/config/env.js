require('dotenv').config();

function required(key) {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

const dbClient = process.env.DB_CLIENT || 'sqlite';

const config = {
  port: process.env.PORT || 4000,
  nodeEnv: process.env.NODE_ENV || 'development',
  dbClient,

  supabase: {
    url: dbClient === 'supabase' ? required('SUPABASE_URL') : (process.env.SUPABASE_URL || ''),
    serviceRoleKey: dbClient === 'supabase' ? required('SUPABASE_SERVICE_ROLE_KEY') : (process.env.SUPABASE_SERVICE_ROLE_KEY || ''),
  },

  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET || 'default_jwt_access_secret_development_key_123456789',
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    refreshExpiresInDays: Number(process.env.JWT_REFRESH_EXPIRES_IN_DAYS || 30),
  },

  corsOrigin: (process.env.CORS_ORIGIN || 'http://localhost:5500,http://localhost:3000').split(','),
};


module.exports = config;