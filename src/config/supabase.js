const { createClient } = require('@supabase/supabase-js');
const config = require('./env');

// Service role key bypasses RLS — this server is the only thing that
// talks to Supabase, and profile_id scoping is enforced in our own
// query code (services/), not in Postgres RLS policies.
const supabase = createClient(config.supabase.url, config.supabase.serviceRoleKey, {
  auth: { persistSession: false }, // server-side client, no browser session to persist
});

module.exports = supabase;
