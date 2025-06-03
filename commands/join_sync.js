// commands/join_sync.js
// =======================================================================
// Slash command (/join_sync) to accept a user’s pending Roblox group join
// request for a given system. After accepting, it logs into the “logs” channel.
// =======================================================================

const { SlashCommandBuilder } = require("discord.js");
const { log } = require("../utils/logger"); // Import the logging helper

module.exports = {
  data: new SlashCommandBuilder()
    .setName("join_sync")
    .setDescription("Accept a user's pending Roblox group join request.")
    .addStringOption((opt) =>
      opt
        .setName("system")
        .setDescription("Which system’s group to accept (e.g. Lightsabers)")
        .setRequired(true)
    ),

  async execute(interaction, context) {
    const {
      config,
      db: { addLog },
      client
    } = context;

    const discordId = interaction.user.id;
    const system = interaction.options.getString("system");

    await interaction.deferReply({ ephemeral: true });

    // Find the system entry in config
    const sysEntry = config.SYSTEMS.find((s) => s.name === system);
    if (!sysEntry) {
      return interaction.editReply(
        `❌ Unknown system “${system}.”`
      );
    }

    const groupId = sysEntry.groupId;
    const apiKey = process.env[`APIKEY_${system.replace(/ /g, "_")}`];

    if (!apiKey) {
      return interaction.editReply(
        `❌ Missing API key for the **${system}** group.`
      );
    }

    // Accept the join request via Roblox API
    try {
      // Roblox API endpoint for accepting join requests:
      //   POST https://groups.roblox.com/v2/groups/{groupId}/join-requests/users/{userId}/accept
      const url = `https://groups.roblox.com/v2/groups/${groupId}/join-requests/users/${discordId}/accept`;
      await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey
        }
      });

      // Log in the database
      const now = Date.now();
      addLog.run("join_accepted", discordId, discordId /*robloxId=same*/, system, now);

      // ──────────────────────────────────────────────────
      // Log to Discord channel if enabled
      // ──────────────────────────────────────────────────
      await log(
        context,
        `✅ **JOIN_ACCEPTED**: <@${discordId}> (Roblox ID: ${discordId}) was accepted into **${system}** group.`
      );

      return interaction.editReply({
        content: `✅ Your join request for **${system}** has been accepted!`
      });
    } catch (err) {
      console.error("Error accepting join request:", err);
      return interaction.editReply(
        `❌ Failed to accept join request for **${system}**. Please try again.`
      );
    }
  }
};
