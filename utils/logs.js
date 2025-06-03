// commands/logs.js
// =======================================================================
// Slash command (/logs) to configure the bot’s logging channel and toggle logs on/off.
//
// Subcommands:
//   /logs set <channel>   – Saves that channel ID in settings.json.
//   /logs enable          – Enables logging.
//   /logs disable         – Disables logging.
//
// All state is stored in settings.json (next to index.js):
//   {
//     "logsEnabled": boolean,
//     "logsChannelId": string|null
//   }
// =======================================================================

const { SlashCommandBuilder } = require("discord.js");
const { loadSettings, saveSettings } = require("../utils/logger");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("logs")
    .setDescription("Configure the bot’s logging channel and turn logs on/off.")
    // Subcommand: set <channel>
    .addSubcommand((sub) =>
      sub
        .setName("set")
        .setDescription("Set the text channel where log messages will be sent.")
        .addChannelOption((opt) =>
          opt
            .setName("channel")
            .setDescription("Select a text channel for logs")
            .setRequired(true)
        )
    )
    // Subcommand: enable
    .addSubcommand((sub) =>
      sub
        .setName("enable")
        .setDescription("Enable sending logs to the configured channel.")
    )
    // Subcommand: disable
    .addSubcommand((sub) =>
      sub
        .setName("disable")
        .setDescription("Disable sending logs to the configured channel.")
    ),

  async execute(interaction, context) {
    // Load current settings from disk
    const settings = loadSettings();

    // Determine which subcommand was used
    const sub = interaction.options.getSubcommand();

    if (sub === "set") {
      // -------------------------------
      // /logs set <channel>
      // -------------------------------
      const channel = interaction.options.getChannel("channel");

      // Save that channel’s ID
      settings.logsChannelId = channel.id;
      saveSettings(settings);

      return interaction.reply({
        content: `✅ Logs channel set to ${channel}.`,
        ephemeral: true
      });
    }

    if (sub === "enable") {
      // -------------------------------
      // /logs enable
      // -------------------------------
      settings.logsEnabled = true;
      saveSettings(settings);

      return interaction.reply({
        content: `✅ Logging has been **enabled**.`,
        ephemeral: true
      });
    }

    if (sub === "disable") {
      // -------------------------------
      // /logs disable
      // -------------------------------
      settings.logsEnabled = false;
      saveSettings(settings);

      return interaction.reply({
        content: `✅ Logging has been **disabled**.`,
        ephemeral: true
      });
    }

    // This should never run, but just in case:
    return interaction.reply({
      content: "❌ Unknown subcommand for /logs.",
      ephemeral: true
    });
  }
};
