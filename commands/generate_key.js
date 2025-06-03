// commands/generate_key.js

const { SlashCommandBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");

// Utility to produce four random hex segments
function randomSegment() {
  return Math.floor(Math.random() * 0xffff)
    .toString(16)
    .padStart(4, "0")
    .toUpperCase();
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("generate_key")
    .setDescription("Generate a new local (GEN-prefixed) license key for a system.")
    .addStringOption((opt) =>
      opt
        .setName("system")
        .setDescription("Which system to generate a key for (e.g. Lightsabers)")
        .setRequired(true)
    ),
  async execute(interaction, context) {
    const system = interaction.options.getString("system");
    const { config } = context;

    // Check that the “system” exists in config.SYSTEMS
    const sysEntry = config.SYSTEMS.find((s) => s.name === system);
    if (!sysEntry) {
      return interaction.reply({
        content: `❌ Unknown system “${system}.”`,
        ephemeral: true,
      });
    }

    // Build a “GEN-…” key
    const segments = [randomSegment(), randomSegment(), randomSegment(), randomSegment()];
    const key = `GEN-${system}-${segments.join("-")}`;

    // Load pending_licenses.json (or create it if missing)
    const pendingPath = path.join(__dirname, "..", "pending_licenses.json");
    let pending = {};
    if (fs.existsSync(pendingPath)) {
      pending = JSON.parse(fs.readFileSync(pendingPath, "utf8"));
    }

    // Insert our new GEN-key into pending_licenses.json
    // (we store just enough info so whitelist.js can find it)
    pending[key] = {
      email: "GENERATED_LOCALLY", // it doesn’t matter for GEN-keys
      system: system,
      timestamp: Date.now(),
    };
    fs.writeFileSync(pendingPath, JSON.stringify(pending, null, 2));

    // Reply with the new key
    return interaction.reply({
      content: `🔑 Generated license key for **${system}**: \`${key}\``,
      ephemeral: true,
    });
  },
};
