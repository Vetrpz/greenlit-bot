// commands/update_whitelist.js
// =======================================================================
// The /update_whitelist command lets a buyer change their whitelisted
// Roblox ID for a specific system, but only after their 30-day cooldown
// for that system has passed. It will:
//
// 1) Verify the system name is valid.
// 2) Look up the buyer’s purchase for that system.
// 3) Check if 30-day cooldown has expired.
// 4) Remove the old Roblox ID from the whitelist_<system>.json.
// 5) Add the new Roblox ID to the whitelist_<system>.json.
// 6) Update the cooldown to 30 days from now in the purchases table.
// 7) Log the action.
// 8) Reply with success or an error message.
// =======================================================================

const { SlashCommandBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("update_whitelist")
    .setDescription("Change your Roblox ID for a system (after 30-day cooldown)")
    .addStringOption((opt) =>
      opt
        .setName("system")
        .setDescription("Exact system name (e.g. Lightsabers)")
        .setRequired(true)
    )
    .addStringOption((opt) =>
      opt
        .setName("new_id")
        .setDescription("Your new Roblox UserID (e.g. 87654321)")
        .setRequired(true)
    ),

  async execute(interaction, context) {
    const {
      config,
      db: { getPurchasesByUser, getUser, updateCooldown, addLog }
    } = context;

    // 1) Get arguments: buyer’s Discord ID runs the command, system name, and new Roblox ID
    const discordId = interaction.user.id;
    const systemName = interaction.options.getString("system").trim();
    const newRobloxId = interaction.options.getString("new_id").trim();

    // 2) Acknowledge the command
    await interaction.deferReply({ ephemeral: true });

    // 3) Verify system name is valid
    const sysEntry = config.SYSTEMS.find(
      (s) => s.name.toLowerCase() === systemName.toLowerCase()
    );
    if (!sysEntry) {
      return interaction.editReply(`❌ I don’t recognize a system named **${systemName}**.`);
    }

    // 4) Find the purchase row for this user & this system
    const purchases = getPurchasesByUser.all(discordId); // returns an array
    const p = purchases.find((x) => x.system === sysEntry.name);
    if (!p) {
      return interaction.editReply(`❌ You haven’t redeemed a license for **${sysEntry.name}**.`);
    }

    // 5) Check if 30-day cooldown has expired
    const now = Date.now();
    if (now < p.cooldown_ends_at) {
      const daysLeft = Math.ceil((p.cooldown_ends_at - now) / (1000 * 60 * 60 * 24));
      return interaction.editReply(
        `❌ You must wait ${daysLeft} more day(s) before updating your ID for **${sysEntry.name}**.`
      );
    }

    // 6) Load the whitelist file, remove old ID, add new ID
    const filePath = path.join(__dirname, "..", sysEntry.file);
    let whitelistArray = [];
    if (fs.existsSync(filePath)) {
      whitelistArray = JSON.parse(fs.readFileSync(filePath, "utf8"));
    }
    // Remove old ID if present
    whitelistArray = whitelistArray.filter((id) => id !== p.roblox_user_id);
    // Add new ID if not already present
    if (!whitelistArray.includes(newRobloxId)) {
      whitelistArray.push(newRobloxId);
    }
    // Write updated whitelist array back to the file
    fs.writeFileSync(filePath, JSON.stringify(whitelistArray, null, 2));

    // 7) Update the cooldown to 30 days from now (reset the cooldown)
    const newCooldown = now + config.COOLDOWN_MS;
    updateCooldown.run(newCooldown, p.id);

    // 8) Log this update in the ‘logs’ table
    addLog.run("whitelist_updated", discordId, newRobloxId, sysEntry.name, now);

    // 9) Reply with success
    return interaction.editReply(
      `✅ Your Roblox ID for **${sysEntry.name}** has been updated to \`${newRobloxId}\`.\n` +
        `You cannot change it again for another 30 days.`
    );
  }
};
