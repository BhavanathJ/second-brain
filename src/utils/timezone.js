// Timezone utilities — shared across authController, settingsController, profileController
// Canonicalizes IANA timezone names to modern identifiers (e.g., "Asia/Calcutta" -> "Asia/Kolkata")
// Accepts both modern and legacy names for validation (Node.js ICU may only recognize legacy)

const VALID_TIMEZONES = new Set(Intl.supportedValuesOf('timeZone'));

// Legacy timezone aliases (modern -> legacy for Node.js ICU compatibility)
const MODERN_TO_LEGACY = {
  'Asia/Kolkata': 'Asia/Calcutta',
  'Europe/Kyiv': 'Europe/Kiev',
  'Asia/Ho_Chi_Minh': 'Asia/Saigon',
  'Asia/Kathmandu': 'Asia/Katmandu',
  'Asia/Yangon': 'Asia/Rangoon',
};

// Legacy timezone aliases (legacy -> modern for storage)
const LEGACY_TO_MODERN = {
  'Asia/Calcutta': 'Asia/Kolkata',
  'Europe/Kiev': 'Europe/Kyiv',
  'Asia/Saigon': 'Asia/Ho_Chi_Minh',
  'Asia/Katmandu': 'Asia/Kathmandu',
  'Asia/Rangoon': 'Asia/Yangon',
};

/**
 * Normalize to modern canonical IANA timezone identifier (for storage).
 * @param {string|null} tz - Timezone string (modern or legacy)
 * @returns {string} Modern canonical IANA timezone, or 'UTC' if not provided
 */
function normalizeTimezone(tz) {
  if (!tz) return 'UTC';
  return LEGACY_TO_MODERN[tz] || tz;
}

/**
 * Check if a timezone is valid (accepts both modern and legacy names).
 * @param {string} tz - Timezone string to validate
 * @returns {boolean} True if valid IANA timezone
 */
function isValidTimezone(tz) {
  if (!tz || typeof tz !== 'string') return false;
  const modern = normalizeTimezone(tz);
  // Check modern name, legacy equivalent, or direct match
  return VALID_TIMEZONES.has(modern) ||
         VALID_TIMEZONES.has(MODERN_TO_LEGACY[modern]) ||
         VALID_TIMEZONES.has(tz);
}

/**
 * Get the legacy equivalent of a modern timezone (for ICU compatibility).
 * @param {string} modernTz - Modern IANA timezone
 * @returns {string|null} Legacy equivalent or null if none
 */
function getLegacyEquivalent(modernTz) {
  return MODERN_TO_LEGACY[modernTz] || null;
}

module.exports = {
  VALID_TIMEZONES,
  MODERN_TO_LEGACY,
  LEGACY_TO_MODERN,
  normalizeTimezone,
  isValidTimezone,
  getLegacyEquivalent,
};