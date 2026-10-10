const crypto = require('crypto');

function normalizeUsername(username) {
  if (!username || typeof username !== 'string') return null;
  const clean = username.trim().replace(/^@/, '').toLowerCase();
  if (!/^[a-z0-9_]{4,32}$/i.test(clean)) {
    return null;
  }
  return clean;
}

function parsePositiveInt(val, min = 1, max = 1000000) {
  const num = Number(val);
  if (!Number.isInteger(num)) return null;
  if (num < min || num > max) return null;
  return num;
}

function generateSecureToken(bytes = 24) {
  return crypto.randomBytes(bytes).toString('hex');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = {
  normalizeUsername,
  parsePositiveInt,
  generateSecureToken,
  hashToken,
  escapeHtml
};
