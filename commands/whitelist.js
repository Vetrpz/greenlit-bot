// commands/whitelist.js
// =======================================================================
// Slash command (/whitelist) to redeem a license key for a system. Supports
// both Payhip‐issued keys and GEN‐prefixed (locally generated) keys.
//
// After successful redemption, it logs into the “logs” channel if enabled.
// =======================================================================

const { SlashCommandBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const { log } = require("../utils/logger"); // Import the logging helper

module.exports = {
  data: new SlashCommandBuilder()
    .setName("whitelist")
    .setDescription("Redeem a license key to be whitelisted for a system.")
    .addStringOption((opt) =>
      opt
        .setName("roblox_id")
        .setDescription("Your Roblox UserID (e.g. 12345678)")
        .setRequired(true)
    )
    .addStringOption((opt) =>
      opt
        .setName("license_key")
        .setDescription("Your license key (Payhip or GEN- prefixed)")
        .setRequired(true)
    ),

  async execute(interaction, context) {
    // ------------------------------
    // 1) Extract arguments & context
    // ------------------------------
    const {
      config,
      db: {
        addUser,
        updateUserRoblox,
        getUser,
        addPurchase,
        getPurchaseByKey,
        getPurchasesByUser,
        updateCooldown,
        deletePurchase,
        addLog
      },
      PAYHIP_API_KEY,
      client
    } = context;

    const discordId = interaction.user.id;
    const robloxId = interaction.options.getString("roblox_id").trim();
    const licenseKey = interaction.options.getString("license_key").trim();

    await interaction.deferReply({ ephemeral: true });

    // ------------------------------
    // 2) Load pending_licenses.json
    // ------------------------------
    const pendingPath = path.join(__dirname, "..", "pending_licenses.json");
    let pending = {};
    if (fs.existsSync(pendingPath)) {
      pending = JSON.parse(fs.readFileSync(pendingPath, "utf8"));
    }

    // 3) Check that the provided key is pending (unredeemed)
    const record = pending[licenseKey];
    if (!record) {
      return interaction.editReply(
        "❌ That license key was not recognized or already redeemed."
      );
    }

    // ------------------------------
    // 4) Verify with Payhip unless it’s a GEN- key
    // ------------------------------
    let verifyData = { valid: true }; // assume valid for GEN- keys
    const isGeneratedKey = licenseKey.startsWith("GEN-");

    if (!isGeneratedKey) {
      try {
        const response = await axios.get(
          "https://payhip.com/api/v1/license/verify",
          {
            params: {
              product_key: record.system,
              license_key: licenseKey
            },
            headers: {
              Authorization: PAYHIP_API_KEY
            }
          }
        );
        verifyData = response.data; // { valid: true/false, ... }
      } catch (err) {
        console.error(
          "❌ Payhip responded with status",
          err.response?.status,
          "and data:",
          err.response?.data
        );
        return interaction.editReply(
          "❌ Could not verify license right now. Please try again later."
        );
      }
    }

    if (!verifyData.valid) {
      return interaction.editReply(
        "❌ This license key is invalid or has already been used."
      );
    }

    // ------------------------------
    // 5) Check our own DB to ensure the key wasn’t already redeemed
    // ------------------------------
    const existing = getPurchaseByKey.get(licenseKey);
    if (existing) {
      return interaction.editReply(
        "❌ That license key has already been redeemed."
      );
    }

    // ------------------------------
    // 6) 30‐day cooldown check for this system
    // ------------------------------
    const now = Date.now();
    const userPurchases = getPurchasesByUser.all(discordId);
    for (const p of userPurchases) {
      if (
        p.system === record.system &&
        now < p.cooldown_ends_at
      ) {
        const daysLeft = Math.ceil(
          (p.cooldown_ends_at - now) / (1000 * 60 * 60 * 24)
        );
        return interaction.editReply(
          `❌ You must wait ${daysLeft} more day(s) before redeeming another license for **${record.system}**.`
        );
      }
    }

    // ------------------------------
    // 7) Insert or update “users” table with Discord ↔ Roblox ID
    // ------------------------------
    addUser.run(discordId, now);
    updateUserRoblox.run(robloxId, discordId);

    // ------------------------------
    // 8) Add a row to “purchases” table
    // ------------------------------
    const cooldownEndsAt = now + config.COOLDOWN_MS;
    addPurchase.run(discordId, record.system, licenseKey, now, cooldownEndsAt);

    // ------------------------------
    // 9) Assign the system’s “Buyer” role in Discord
    // ------------------------------
    const sysEntry = config.SYSTEMS.find((s) => s.name === record.system);
    if (sysEntry) {
      try {
        const guild = client.guilds.cache.get(process.env.DISCORD_GUILD_ID);
        const member = await guild.members.fetch(discordId);
        await member.roles.add(sysEntry.roleId);
      } catch (err) {
        console.warn(
          `⚠️ Could not assign role for system ${record.system}:`,
          err
        );
      }
    }

    // ------------------------------
    // 10) Append Roblox ID to whitelist_<system>.json
    // ------------------------------
    const filePath = path.join(__dirname, "..", sysEntry.file);
    let whitelistArray = [];
    if (fs.existsSync(filePath)) {
      whitelistArray = JSON.parse(fs.readFileSync(filePath, "utf8"));
    }
    if (!whitelistArray.includes(robloxId)) {
      whitelistArray.push(robloxId);
      fs.writeFileSync(filePath, JSON.stringify(whitelistArray, null, 2));
    }

    // ------------------------------
    // 11) Remove the key from pending_licenses.json
    // ------------------------------
    delete pending[licenseKey];
    fs.writeFileSync(pendingPath, JSON.stringify(pending, null, 2));

    // ------------------------------
    // 12) Log the action in the “logs” DB table
    // ------------------------------
    addLog.run("whitelist_redeemed", discordId, robloxId, record.system, now);

    // ──────────────────────────────────────────────────
    // Log to the Discord “logs” channel (if enabled)
    // ──────────────────────────────────────────────────
    await log(
      context,
      `✅ **WHITELIST_REDEEMED**: <@${discordId}> (Roblox ID: ${robloxId}) redeemed \`${licenseKey}\` for **${record.system}**.`
    );

    // ------------------------------
    // 13) Finally, send confirmation to the buyer
    // ------------------------------
    const groupId = sysEntry.groupId;
    return interaction.editReply({
      content:
        `✅ You are now whitelisted for **${record.system}**!\n` +
        `➡️ Join the **${record.system}** Roblox group: ` +
        `https://www.roblox.com/groups/${groupId}\n` +
        `➡️ After you click “Join Group” in Roblox, run \`/join_sync ${record.system}\`.`
    });
  }
};
