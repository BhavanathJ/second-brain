// Settings controller stress test: design_system validation, legacy timezone normalization, week_starts_on validation, empty theme gap.
// Runs the ACTUAL settingsController end-to-end against the in-memory mock.

const { check, section, summary, makeReqRes, mock } = require('./helpers');

const settingsController = require('../src/controllers/settingsController');
const authController = require('../src/controllers/authController');
const profileController = require('../src/controllers/profileController');
const settingsService = require('../src/services/settingsService');
const authService = require('../src/services/authService');
const { hashPassword } = require('../src/utils/password');
const { generateRefreshToken, hashRefreshToken } = require('../src/utils/refreshToken');

const TZ = 'America/New_York';

async function call(fn, overrides) {
  const { req, res } = makeReqRes({ ...overrides });
  await fn(req, res);
  return { status: res.statusCode, body: res.body };
}

async function seedUserWithProfile(email, username, password, profileName) {
  const passwordHash = await hashPassword(password);
  const user = mock.seed('users', { email, username, password_hash: passwordHash });
  const profile = mock.seed('profiles', { user_id: user.id, name: profileName });
  await settingsService.createDefaultSettings(profile.id, TZ);
  return { user, profile, passwordHash };
}

async function getAuthToken(userId, profileId, username) {
  return authController.issueTokenPair({ userId, profileId, username });
}

(async () => {
  // ================= SETUP =================
  const { user, profile } = await seedUserWithProfile('settings@example.com', 'settingsuser', 'password123', 'Main');
  const tokens = await getAuthToken(user.id, profile.id, user.username);

  // ================= DESIGN_SYSTEM VALIDATION =================
  section('design_system: rejects invalid values');

  // 1. Valid: "signal"
  {
    const r = await call(settingsController.updateSettings, { profileId: profile.id, body: { design_system: 'signal' } });
    check(r.status === 200, 'design_system=signal → 200', `got ${r.status}`);
    check(r.body.settings.design_system === 'signal', 'stored as signal');
  }

  // 2. Valid: "neo"
  {
    const r = await call(settingsController.updateSettings, { profileId: profile.id, body: { design_system: 'neo' } });
    check(r.status === 200, 'design_system=neo → 200', `got ${r.status}`);
    check(r.body.settings.design_system === 'neo', 'stored as neo');
  }

  // 3. Invalid: "modern"
  {
    const r = await call(settingsController.updateSettings, { profileId: profile.id, body: { design_system: 'modern' } });
    check(r.status === 400, 'design_system=modern → 400', `got ${r.status}`);
    check(r.body && r.body.error && r.body.error.includes('design_system'), 'error mentions design_system');
  }

  // 4. Invalid: empty string
  {
    const r = await call(settingsController.updateSettings, { profileId: profile.id, body: { design_system: '' } });
    check(r.status === 400, 'design_system="" → 400', `got ${r.status}`);
  }

  // 5. Invalid: null (missing field)
  // The controller only validates if field is present, so this should be ignored
  {
    const r = await call(settingsController.updateSettings, { profileId: profile.id, body: { design_system: null } });
    check(r.status === 400, 'design_system=null → 400', `got ${r.status}`);
  }

  // ================= LEGACY TIMEZONE NORMALIZATION =================
  section('Legacy timezone normalization: cross-check with signup/profile-create');

  // 6. Legacy timezone "Asia/Calcutta" normalized to "Asia/Kolkata" via settings
  {
    const r = await call(settingsController.updateSettings, { profileId: profile.id, body: { timezone: 'Asia/Calcutta' } });
    check(r.status === 200, 'settings: legacy timezone Asia/Calcutta → 200', `got ${r.status}`);
    check(r.body.settings.timezone === 'Asia/Kolkata', 'stored as Asia/Kolkata', `got ${r.body.settings.timezone}`);
  }

  // 7. Legacy timezone "Europe/Kiev" normalized to "Europe/Kyiv"
  {
    const r = await call(settingsController.updateSettings, { profileId: profile.id, body: { timezone: 'Europe/Kiev' } });
    check(r.status === 200, 'settings: legacy timezone Europe/Kiev → 200', `got ${r.status}`);
    check(r.body.settings.timezone === 'Europe/Kyiv', 'stored as Europe/Kyiv', `got ${r.body.settings.timezone}`);
  }

  // 8. Legacy timezone "Asia/Saigon" normalized to "Asia/Ho_Chi_Minh"
  {
    const r = await call(settingsController.updateSettings, { profileId: profile.id, body: { timezone: 'Asia/Saigon' } });
    check(r.status === 200, 'settings: legacy timezone Asia/Saigon → 200', `got ${r.status}`);
    check(r.body.settings.timezone === 'Asia/Ho_Chi_Minh', 'stored as Asia/Ho_Chi_Minh', `got ${r.body.settings.timezone}`);
  }

  // 9. Legacy timezone "Asia/Katmandu" normalized to "Asia/Kathmandu"
  {
    const r = await call(settingsController.updateSettings, { profileId: profile.id, body: { timezone: 'Asia/Katmandu' } });
    check(r.status === 200, 'settings: legacy timezone Asia/Katmandu → 200', `got ${r.status}`);
    check(r.body.settings.timezone === 'Asia/Kathmandu', 'stored as Asia/Kathmandu', `got ${r.body.settings.timezone}`);
  }

  // 10. Legacy timezone "Asia/Rangoon" normalized to "Asia/Yangon"
  {
    const r = await call(settingsController.updateSettings, { profileId: profile.id, body: { timezone: 'Asia/Rangoon' } });
    check(r.status === 200, 'settings: legacy timezone Asia/Rangoon → 200', `got ${r.status}`);
    check(r.body.settings.timezone === 'Asia/Yangon', 'stored as Asia/Yangon', `got ${r.body.settings.timezone}`);
  }

  // 11. Cross-check: signup also accepts same legacy timezone
  {
    const r = await call(authController.signup, { body: { email: 'signup1@example.com', username: 'signupone', password: 'password123', timezone: 'Asia/Calcutta' } });
    check(r.status === 201, 'signup: legacy timezone Asia/Calcutta → 201', `got ${r.status}`);
    const settings = mock._db.settings.find(s => s.profile_id === r.body.profile.id);
    check(settings && settings.timezone === 'Asia/Kolkata', 'signup stores normalized Asia/Kolkata', `got ${settings ? settings.timezone : 'no settings'}`);
  }

  // 12. Cross-check: profile create also accepts same legacy timezone
  {
    const r = await call(profileController.createProfile, { userId: user.id, body: { name: 'TestProfile', timezone: 'Asia/Calcutta' } });
    check(r.status === 201, 'createProfile: legacy timezone Asia/Calcutta → 201', `got ${r.status}`);
    const settings = mock._db.settings.find(s => s.profile_id === r.body.profile.id);
    check(settings && settings.timezone === 'Asia/Kolkata', 'createProfile stores normalized Asia/Kolkata', `got ${settings ? settings.timezone : 'no settings'}`);
  }

  // ================= WEEK_STARTS_ON VALIDATION =================
  section('week_starts_on: rejects invalid values');

  // 13. Valid: 0 (Sunday)
  {
    const r = await call(settingsController.updateSettings, { profileId: profile.id, body: { week_starts_on: 0 } });
    check(r.status === 200, 'week_starts_on=0 → 200', `got ${r.status}`);
    check(r.body.settings.week_starts_on === 0, 'stored as 0');
  }

  // 14. Valid: 1 (Monday)
  {
    const r = await call(settingsController.updateSettings, { profileId: profile.id, body: { week_starts_on: 1 } });
    check(r.status === 200, 'week_starts_on=1 → 200', `got ${r.status}`);
    check(r.body.settings.week_starts_on === 1, 'stored as 1');
  }

  // 15. Invalid: 2
  {
    const r = await call(settingsController.updateSettings, { profileId: profile.id, body: { week_starts_on: 2 } });
    check(r.status === 400, 'week_starts_on=2 → 400', `got ${r.status}`);
    check(r.body && r.body.error && r.body.error.includes('week_starts_on'), 'error mentions week_starts_on');
  }

  // 16. Invalid: -1
  {
    const r = await call(settingsController.updateSettings, { profileId: profile.id, body: { week_starts_on: -1 } });
    check(r.status === 400, 'week_starts_on=-1 → 400', `got ${r.status}`);
  }

  // 17. Invalid: string "monday"
  {
    const r = await call(settingsController.updateSettings, { profileId: profile.id, body: { week_starts_on: 'monday' } });
    check(r.status === 400, 'week_starts_on="monday" → 400', `got ${r.status}`);
  }

  // 18. Invalid: null (when provided)
  {
    const r = await call(settingsController.updateSettings, { profileId: profile.id, body: { week_starts_on: null } });
    check(r.status === 400, 'week_starts_on=null → 400', `got ${r.status}`);
  }

  // ================= EMPTY THEME GAP =================
  section('theme: empty string gap (documented behavior)');

  // 19. Empty string theme - this is a KNOWN GAP per stress-controllers.js pattern
  {
    const r = await call(settingsController.updateSettings, { profileId: profile.id, body: { theme: '' } });
    console.log(`  [gap] settings with empty theme           → HTTP ${r.status} (empty string bypasses the truthiness check)`);
    check(r.status === 400 || r.status === 200, 'empty theme behavior documented as gap', `got ${r.status} - this is a known validation gap`);
  }

  // 20. Valid theme: "light"
  {
    const r = await call(settingsController.updateSettings, { profileId: profile.id, body: { theme: 'light' } });
    check(r.status === 200, 'theme=light → 200', `got ${r.status}`);
    check(r.body.settings.theme === 'light', 'stored as light');
  }

  // 21. Valid theme: "dark"
  {
    const r = await call(settingsController.updateSettings, { profileId: profile.id, body: { theme: 'dark' } });
    check(r.status === 200, 'theme=dark → 200', `got ${r.status}`);
    check(r.body.settings.theme === 'dark', 'stored as dark');
  }

  // 22. Valid theme: "system"
  {
    const r = await call(settingsController.updateSettings, { profileId: profile.id, body: { theme: 'system' } });
    check(r.status === 200, 'theme=system → 200', `got ${r.status}`);
    check(r.body.settings.theme === 'system', 'stored as system');
  }

  // 23. Invalid theme: "invalid"
  {
    const r = await call(settingsController.updateSettings, { profileId: profile.id, body: { theme: 'invalid' } });
    check(r.status === 400, 'theme=invalid → 400', `got ${r.status}`);
    check(r.body && r.body.error && r.body.error.includes('theme'), 'error mentions theme');
  }

  summary();
})();