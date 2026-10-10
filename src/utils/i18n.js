const fs = require('fs');
const path = require('path');
const logger = require('./logger');

const locales = {
  uz: {},
  ru: {}
};

try {
  const uzPath = path.resolve(__dirname, '../../locales/uz.json');
  const ruPath = path.resolve(__dirname, '../../locales/ru.json');
  if (fs.existsSync(uzPath)) {
    locales.uz = JSON.parse(fs.readFileSync(uzPath, 'utf8'));
  }
  if (fs.existsSync(ruPath)) {
    locales.ru = JSON.parse(fs.readFileSync(ruPath, 'utf8'));
  }
} catch (err) {
  logger.error('Failed to load locale files:', err.message);
}

function getNested(obj, pathParts) {
  let curr = obj;
  for (const part of pathParts) {
    if (!curr || typeof curr !== 'object') return undefined;
    curr = curr[part];
  }
  return curr;
}

function t(lang, key, params = {}) {
  const selectedLang = lang === 'ru' ? 'ru' : 'uz';
  const parts = key.split('.');
  
  let val = getNested(locales[selectedLang], parts);
  if (val === undefined && selectedLang !== 'uz') {
    val = getNested(locales.uz, parts);
  }
  
  if (val === undefined) {
    return key;
  }

  if (typeof val === 'string') {
    return val.replace(/\{(\w+)\}/g, (_, k) => (params[k] !== undefined ? params[k] : `{${k}}`));
  }

  return val;
}

module.exports = {
  t,
  locales
};
