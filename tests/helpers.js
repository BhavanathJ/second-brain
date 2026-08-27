// Shared test harness. MUST be required before any service/controller:
// it points require('../config/supabase') at the in-memory mock and sets
// env vars so src/config/env.js can load (jwt/refresh logic is exercised
// for real against the mock).

process.env.SUPABASE_URL = 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-please-change-me';
process.env.JWT_REFRESH_EXPIRES_IN_DAYS = '30';

const path = require('path');

const mock = require('./mockSupabase.js');
const supabasePath = require.resolve('../src/config/supabase.js');
require.cache[supabasePath] = {
  id: supabasePath,
  filename: supabasePath,
  loaded: true,
  exports: mock,
};

let passed = 0;
const failures = [];

function check(cond, label, detail) {
  if (cond) {
    passed++;
  } else {
    failures.push({ label, detail });
    console.error(`  ✗ ${label}${detail ? `  → ${detail}` : ''}`);
  }
}

function section(name) {
  console.log(`\n== ${name} ==`);
}

function summary() {
  console.log(
    `\n----- ${passed} assertions passed, ${failures.length} failed -----`
  );
  if (failures.length) process.exitCode = 1;
}

// Minimal express req/res stand-ins. Controllers read req.profileId /
// req.userId (set by requireAuth), req.body, req.query, req.params.
function makeReqRes({ profileId = 'p1', userId = 'u1', body = {}, query = {}, params = {} } = {}) {
  const res = {
    statusCode: 200,
    body: null,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
    send() { return this; },
  };
  return { req: { profileId, userId, body, query, params, headers: {} }, res };
}

module.exports = { check, section, summary, makeReqRes, mock };
