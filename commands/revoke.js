// commands/revoke.js
// =======================================================================
// Admin-only command to revoke a user’s whitelist entry.
// Usage: /revoke <target> [system]
//
// - <target> can be a Discord ID, a Roblox ID, or a license key.
// - If [system] is provided, only revoke that system; otherwise revoke ALL systems for that user.
// =======================================================================

const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const fs = require("fs");
const path = require("path");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("revoke")
    .setDescription("Revoke a user’s whitelist (all or specific system) (Admin only).")
    .addStringOption((opt) =>
      opt
        .setName("target")
        .setDescription("Discord ID, Roblox ID, or license key")
        .setRequired(true)
    )
    .addStringOption((opt) =>
      opt
        .setName("system")
        .setDescription("If provided, revoke only that specific system")
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction, context) {
    // Destructure what we need from context
    const {
      config,
      db: { getPurchasesByUser, getUser, getPurchaseByKey, deletePurchase, addLog }
    } = context;
    const { client } = context; // Discord client to remove roles

    // 1) Get arguments: target can be a Discord ID, Roblox ID, or license key; systemFilter is optional
    const target = interaction.options.getString("target").trim();
    const systemFilter = interaction.options.getString("system"); // may be null

    await interaction.deferReply({ ephemeral: true }); // acknowledge command

    // ===== HELPER: remove a single purchase record =====
    async function removePurchase(purchase) {
      const discordId = purchase.discord_id;
      const robloxId = purchase.roblox_user_id;
      const sysName = purchase.system; // e.g. "Lightsabers"

      // 1a) Remove Roblox ID from the local whitelist JSON
      const entry = config.SYSTEMS.find((s) => s.name === sysName);
      if (entry) {
        const filePath = path.join(__dirname, "..", entry.file);
        if (fs.existsSync(filePath)) {
          let arr = JSON.parse(fs.readFileSync(filePath, "utf8"));
          // Filter out the robloxId; create a new array without it
          arr = arr.filter((id) => id !== robloxId);
          fs.writeFileSync(filePath, JSON.stringify(arr, null, 2));
        }

        // 1b) Remove the Discord Buyer role for that system
        try {
          const guild = client.guilds.cache.get(process.env.DISCORD_GUILD_ID);
          const member = await guild.members.fetch(discordId);
          await member.roles.remove(entry.roleId);
        } catch (err) {
          console.warn(`⚠️ Could not remove role for ${discordId}:`, err);
        }
      }

      // 2) Delete the purchase row from the purchases table
      deletePurchase.run(purchase.license_key);

      // 3) Log the revoke action
      addLog.run("revoke", interaction.user.id, robloxId, sysName, Date.now());
    }

    // === 2) Check if target matches a license key ===
    const licensePurchase = getPurchaseByKey.get(target);
    if (licensePurchase) {
      // If systemFilter is provided, ensure it matches
      if (systemFilter && licensePurchase.system !== systemFilter) {
        return interaction.editReply(
          `❌ That license belongs to **${licensePurchase.system}**, not **${systemFilter}**.`
        );
      }
      // Remove exactly this purchase record
      await removePurchase(licensePurchase);
      return interaction.editReply(
        `✅ Revoked whitelist for **${licensePurchase.system}** (license: \`${licensePurchase.license_key}\`).`
      );
    }

    // === 3) Not a license key: try interpreting target as Discord ID ===
    let discordId = null;
    const userRow = getUser.get(target);
    if (userRow) {
      discordId = userRow.discord_id;
    } else {
      // === 4) Not a Discord ID: try as Roblox ID by scanning all purchases ===
      const allPurchases = getPurchasesByUser.all(); // returns entire purchases table
      const match = allPurchases.find((p) => p.roblox_user_id === target);
      if (match) {
        discordId = match.discord_id;
      }
    }

    if (!discordId) {
      // We couldn’t identify the user or license
      return interaction.editReply(
        "❌ No user or license found with that identifier."
      );
    }

    // 5) Fetch all purchases for that Discord ID
    let userPurchases = getPurchasesByUser.all(discordId);
    if (!userPurchases.length) {
      return interaction.editReply("❌ That user has no active whitelist entries.");
    }

    // 6) If systemFilter is provided, filter to that system only
    if (systemFilter) {
      userPurchases = userPurchases.filter((p) => p.system === systemFilter);
      if (!userPurchases.length) {
        return interaction.editReply(
          `❌ That user does not have a whitelist for **${systemFilter}**.`
        );
      }
    }

    // 7) Revoke each matching purchase
    for (const p of userPurchases) {
      await removePurchase(p);
    }

    if (systemFilter) {
      return interaction.editReply(
        `✅ Revoked **${systemFilter}** from user <@${discordId}>.`
      );
    } else {
      return interaction.editReply(
        `✅ Revoked **all** whitelist entries from user <@${discordId}>.`
      );
    }
  }
};
