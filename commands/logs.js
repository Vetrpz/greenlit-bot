// commands/logs.js
// =======================================================================
// Admin-only command to retrieve recent whitelist-related log entries.
// Usage: /logs [limit]
//
// - limit (optional): the number of log entries to show (default 10).
// =======================================================================

const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("logs")
    .setDescription("Show recent whitelist-related actions (Admin only)")
    .addIntegerOption((opt) =>
      opt
        .setName("limit")
        .setDescription("Number of log entries to show (default 10)")
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction, context) {
    const { db: { getRecentLogs } } = context;
    const limit = interaction.options.getInteger("limit") || 10; // use provided limit or default to 10

    // 1) Query the logs table for the most recent `limit` entries
    const rows = getRecentLogs.all(limit);
    if (!rows.length) {
      return interaction.reply({
        content: "No logs to display.",
        ephemeral: true
      });
    }

    // 2) Format each row into a readable line
    const lines = rows.map((r) => {
      return (
        `• [<t:${Math.floor(r.timestamp / 1000)}:f>] **${r.action_type}** – ` +
        `actor: \`${r.actor_id}\` – target: \`${r.target_id}\` – system: \`${r.system}\``
      );
    });

    // 3) Reply with the lines (ephemeral so only Admin sees)
    return interaction.reply({
      content: ["**Recent Actions:**", ...lines].join("\n"),
      ephemeral: true
    });
  }
};
