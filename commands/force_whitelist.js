// commands/force_whitelist.js
// =======================================================================
// Admin-only command to manually add a Roblox ID to a system’s whitelist
// without requiring a license key. Useful if you need to override or fix
// things without going through the Payhip flow.
//
// Steps:
// 1. Read the target Roblox ID and system name from command.
// 2. Verify the system is valid.
// 3. Insert a “fake” license key under the admin’s Discord ID in purchases.
// 4. Append the Roblox ID to whitelist_<system>.json.
// 5. Assign the Discord Buyer role (to the admin; you could change to assign
//    to a real user if desired).
// 6. Log the action.
// 7. Reply with confirmation.
// =======================================================================

const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const fs = require("fs");
const path = require("path");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("force_whitelist")
    .setDescription("Manually add a Roblox ID to a system’s whitelist (Admin only).")
    .addStringOption((opt) =>
      opt
        .setName("roblox_id")
        .setDescription("Target Roblox UserID (e.g. 12345678)")
        .setRequired(true)
    )
    .addStringOption((opt) =>
      opt
        .setName("system")
        .setDescription("Exact system name (e.g. Lightsabers)")
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction, context) {
    const {
      config,
      db: { addPurchase, addLog }
    } = context;
    const { client } = context;

    // 1) Get arguments: admin’s Discord ID, target Roblox ID, and system name
    const discordId = interaction.user.id;             // The admin’s Discord ID (we’ll store purchases under the admin)
    const robloxId = interaction.options.getString("roblox_id").trim();
    const systemName = interaction.options.getString("system").trim();
    const now = Date.now(); // current timestamp

    // 2) Verify the system exists
    const sysEntry = config.SYSTEMS.find(
      (s) => s.name.toLowerCase() === systemName.toLowerCase()
    );
    if (!sysEntry) {
      return interaction.reply({
        content: `❌ Unknown system: **${systemName}**`,
        ephemeral: true
      });
    }

    // 3) Generate a “fake” license key so it fits into the DB schema
    //    Format: FORCE-SystemName-RobloxID-Timestamp
    const sanitized = systemName.replace(/\s+/g, "_"); // replace spaces with underscores
    const fakeKey = `FORCE-${sanitized}-${robloxId}-${now}`;
    const cooldownEndsAt = now + config.COOLDOWN_MS; // 30 days from now

    // 4) Insert this forced purchase into the purchases table
    addPurchase.run(discordId, sysEntry.name, fakeKey, now, cooldownEndsAt);

    // 5) Log the action in the logs table
    addLog.run("force_whitelist", discordId, robloxId, sysEntry.name, now);

    // 6) Append Roblox ID to the whitelist JSON file
    const filePath = path.join(__dirname, "..", sysEntry.file);
    let whitelistArray = [];
    if (fs.existsSync(filePath)) {
      whitelistArray = JSON.parse(fs.readFileSync(filePath, "utf8"));
    }
    if (!whitelistArray.includes(robloxId)) {
      whitelistArray.push(robloxId);
      fs.writeFileSync(filePath, JSON.stringify(whitelistArray, null, 2));
    }

    // 7) Assign the Buyer role for that system to the admin (or real user if you change logic)
    try {
      const guild = client.guilds.cache.get(process.env.DISCORD_GUILD_ID);
      const member = await guild.members.fetch(discordId);
      await member.roles.add(sysEntry.roleId);
    } catch (err) {
      console.warn("⚠️ Could not assign role in force_whitelist:", err);
    }

    // 8) Reply with confirmation (ephemeral so only the admin sees)
    return interaction.reply({
      content: `✅ **${robloxId}** has been manually whitelisted for **${sysEntry.name}**.`,
      ephemeral: true
    });
  }
};
