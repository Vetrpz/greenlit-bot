// utils/logger.js
// =======================================================================
// A small logging utility for the bot. It stores two pieces of state in
// settings.json: { logsEnabled: boolean, logsChannelId: string|null }.
// When you call logger.log(context, message), it will (if enabled) fetch
// the channel and send the message there.
//
// Usage in other commands:
//   const { log } = require("../utils/logger");
//   // After you perform an action, call:
//   await log(context, "Some description of what happened");
// =======================================================================

const fs = require("fs");
const path = require("path");

// Path to settings.json in the project root (next to index.js)
const SETTINGS_PATH = path.join(__dirname, "..", "settings.json");

/**
 * loadSettings()
 * Reads settings.json from disk. If it doesn't exist, returns defaults.
 * @returns {object} { logsEnabled: boolean, logsChannelId: string|null }
 */
function loadSettings() {
  if (!fs.existsSync(SETTINGS_PATH)) {
    // Return defaults if settings.json doesn't exist
    return {
      logsEnabled: false,
      logsChannelId: null
    };
  }
  try {
    const raw = fs.readFileSync(SETTINGS_PATH, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    console.error("Error reading settings.json:", err);
    // If parse fails, return defaults
    return {
      logsEnabled: false,
      logsChannelId: null
    };
  }
}

/**
 * saveSettings(settings)
 * Writes the given settings object to disk (overwrites settings.json).
 * @param {object} settings  { logsEnabled: boolean, logsChannelId: string|null }
 */
function saveSettings(settings) {
  try {
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
  } catch (err) {
    console.error("Error writing settings.json:", err);
  }
}

/**
 * log(context, message)
 * If logs are enabled and a channel is set, fetches that channel via the
 * Discord client (in context.client) and sends the given message there.
 *
 * @param {object} context   Must contain `client` (Discord client)
 * @param {string} message   The text to send to the logs channel
 */
async function log(context, message) {
  const { client } = context;
  const settings = loadSettings();

  // Only proceed if logging is enabled AND a channel ID is set
  if (!settings.logsEnabled || !settings.logsChannelId) {
    return;
  }

  try {
    // Fetch the channel object from Discord
    const channel = await client.channels.fetch(settings.logsChannelId);
    if (channel && channel.isTextBased()) {
      // Prepend a timestamp for clarity
      const timestamp = new Date().toISOString();
      await channel.send(`📝 [${timestamp}] ${message}`);
    }
  } catch (err) {
    console.error("Failed to send log message to channel:", err);
  }
}

module.exports = {
  loadSettings,
  saveSettings,
  log
};
