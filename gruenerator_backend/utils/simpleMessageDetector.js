const fs = require('fs');
const path = require('path');

let configCache = null;

function loadConfig() {
  if (configCache) return configCache;
  const configPath = path.join(__dirname, '../prompts/simpleMessages.json');
  configCache = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  return configCache;
}

function detectSimpleMessage(message) {
  const config = loadConfig();
  const normalized = message.toLowerCase().trim();

  for (const [category, categoryConfig] of Object.entries(config.categories)) {
    if (normalized.length > categoryConfig.maxLength) continue;

    for (const patternStr of categoryConfig.patterns) {
      const pattern = new RegExp(patternStr, 'i');
      if (pattern.test(normalized)) {
        return { isSimple: true, category, confidence: 1.0 };
      }
    }
  }

  return { isSimple: false };
}

function generateSimpleResponse(category, locale = 'de-DE') {
  const config = loadConfig();
  const categoryConfig = config.categories[category];
  if (!categoryConfig) return null;

  const responses = categoryConfig.responses[locale] || categoryConfig.responses[config.defaultLocale];
  return responses[Math.floor(Math.random() * responses.length)];
}

module.exports = { detectSimpleMessage, generateSimpleResponse, loadConfig };
