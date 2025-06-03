// commands/revoke.js
// =======================================================================
// Slash command (/revoke) to remove (“revoke”) a user’s whitelist for a
// particular system. After revoking, it logs into the “logs” channel.
// =======================================================================

const { SlashCommandBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");
const { log } = require("../utils/logger"); // Import the logging helper

module.exports = {
  data: new SlashCommandBuilder()
    .setName("revoke")
    .setDescription("Revoke a user’s whitelist for a system.")
    .addUserOption((opt) =>
      opt
        .setName("user")
        .setDescription("The Discord user whose whitelist to revoke")
        .setRequired(true)
    )
    .addStringOption((opt) =>
      opt
        .setName("system")
        .setDescription("Which system to revoke from (e.g. Lightsabers)")
        .setRequired(true)
    ),

  async execute(interaction, context) {
    const {
      db: { getUser, getPurchaseByKey, deletePurchase, addLog },
      config,
    } = context;

    const targetUser = interaction.options.getUser("user");
    const system = interaction.options.getString("system");

    await interaction.deferReply({ ephemeral: true });

    // Find the system entry
    const sysEntry = config.SYSTEMS.find((s) => s.name === system);
    if (!sysEntry) {
      return interaction.editReply(
        `❌ Unknown system “${system}.”`
      );
    }

    // Get Discord ID of the target
    const discordId = targetUser.id;

    // Look up that user’s Roblox ID from the “users” table
    const userRow = getUser.get(discordId);
    if (!userRow || !userRow.roblox_id) {
      return interaction.editReply(
        `❌ <@${discordId}> has no Roblox ID on file. Cannot revoke.`
      );
    }
    const robloxId = userRow.roblox_id;

    // Remove the user’s Roblox ID from whitelist_<system>.json
    const filePath = path.join(__dirname, "..", sysEntry.file);
    if (fs.existsSync(filePath)) {
      let whitelistArray = JSON.parse(fs.readFileSync(filePath, "utf8"));
      whitelistArray = whitelistArray.filter((id) => id !== robloxId);
      fs.writeFileSync(filePath, JSON.stringify(whitelistArray, null, 2));
    }

    // Remove any purchase row for that user & system
    // (We store purchases by license key, so find by Discord ID+system)
    const purchases = getPurchaseByKey.all(discordId);
    for (const p of purchases) {
      if (p.system === system) {
        deletePurchase.run(p.license_key);
      }
    }

    // Log the revoke in the “logs” DB table
    const now = Date.now();
    addLog.run("revoke", discordId, robloxId, system, now);

    // ──────────────────────────────────────────────────
    // Log to Discord channel if enabled
    // ──────────────────────────────────────────────────
    await log(
      context,
      `❌ **REVOKE**: <@${discordId}> (Roblox ID: ${robloxId}) had **${system}** revoked.`
    );

    return interaction.editReply({
      content: `✅ Revoked **${system}** from <@${discordId}>.`
    });
  }
};
