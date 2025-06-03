// commands/generate_key.js
// =======================================================================
// Slash command (/generate_key) to create a locally‐generated (GEN‐prefixed)
// license key for a specified system. The key is stored in pending_licenses.json.
//
// After generating, this command will also log into the “logs” channel if
// logging is enabled.
// =======================================================================

const { SlashCommandBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");
const { log } = require("../utils/logger"); // Import the logging helper

// Utility to create a random 4‐character hex segment
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

    // Check if the system exists in config.SYSTEMS
    const sysEntry = config.SYSTEMS.find((s) => s.name === system);
    if (!sysEntry) {
      return interaction.reply({
        content: `❌ Unknown system “${system}.”`,
        ephemeral: true
      });
    }

    // Build a “GEN‐<System>‐xxxx‐xxxx‐xxxx” style key
    const segments = [randomSegment(), randomSegment(), randomSegment(), randomSegment()];
    const key = `GEN-${system}-${segments.join("-")}`;

    // Write this new key into pending_licenses.json
    const pendingPath = path.join(__dirname, "..", "pending_licenses.json");
    let pending = {};
    if (fs.existsSync(pendingPath)) {
      pending = JSON.parse(fs.readFileSync(pendingPath, "utf8"));
    }
    pending[key] = {
      email: "GENERATED_LOCALLY", // placeholder, not used for GEN- keys
      system: system,
      timestamp: Date.now()
    };
    fs.writeFileSync(pendingPath, JSON.stringify(pending, null, 2));

    // Reply to the user with the generated key (ephemeral)
    await interaction.reply({
      content: `🔑 Generated license key for **${system}**: \`${key}\``,
      ephemeral: true
    });

    // ──────────────────────────────────────────────────
    // Log this action if logging is enabled
    // ──────────────────────────────────────────────────
    // Format: “<@UserID> generated GEN‐… for <System>”
    await log(
      context,
      `🔑 **GENERATE_KEY**: <@${interaction.user.id}> generated key \`${key}\` for **${system}**.`
    );
  }
};
