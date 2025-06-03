// commands/whitelist.js
// =======================================================================
// This slash command (/whitelist) allows a buyer to redeem a license key
// to be whitelisted for a specific system (e.g., Speeders, Lightsabers, etc.).
//
// We support two kinds of license keys:
//
//   1) Payhip-issued keys: These exist in Payhip’s backend and must be
//      verified via Payhip’s License Verify API.
//
//   2) GEN-prefixed keys: Created locally via /generate_key. We skip
//      Payhip verification for these and treat them as valid immediately.
//
// Steps performed here:
//   1) Read buyer’s Discord ID and provided Roblox UserID.
//   2) Read provided licenseKey.
//   3) Check if that key exists in pending_licenses.json (unredeemed).
//   4) If the key does NOT start with “GEN-”, verify it with Payhip’s API.
//   5) Enforce a 30-day cooldown if the user has redeemed the same system recently.
//   6) Insert/update user in “users” table (store Discord ↔ Roblox ID).
//   7) Insert a purchase record in “purchases” table with cooldown timestamp.
//   8) Assign the corresponding “Buyer” role in Discord.
//   9) Append Roblox ID to the appropriate whitelist_<system>.json file.
//  10) Remove the license from pending_licenses.json so it cannot be reused.
//  11) Log this action in the “logs” table.
//  12) Reply with instructions for the buyer (which Roblox group + next steps).
// =======================================================================

const { SlashCommandBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");
const axios = require("axios");

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
    // 1) DESTRUCTURE CONTEXT & ARGS
    // ------------------------------
    const {
      config, // contains SYSTEMS array and COOLDOWN_MS
      db: {
        addUser,
        updateUserRoblox,
        getUser,
        addPurchase,
        getPurchaseByKey,
        getPurchasesByUser,
        updateCooldown,
        deletePurchase,
        addLog,
      },
      PAYHIP_API_KEY, // from .env
      client,         // Discord client
    } = context;

    const discordId = interaction.user.id;
    const robloxId = interaction.options.getString("roblox_id").trim();
    const licenseKey = interaction.options.getString("license_key").trim();

    // Defer reply so we can do async work (ephemeral = only user sees this)
    await interaction.deferReply({ ephemeral: true });

    // ------------------------------
    // 2) LOAD pending_licenses.json
    // ------------------------------
    const pendingPath = path.join(__dirname, "..", "pending_licenses.json");
    let pending = {};
    if (fs.existsSync(pendingPath)) {
      pending = JSON.parse(fs.readFileSync(pendingPath, "utf8"));
    }

    // 3) CHECK THAT LICENSE KEY IS PENDING (i.e. not already used)
    const record = pending[licenseKey];
    if (!record) {
      return interaction.editReply(
        "❌ That license key was not recognized or already redeemed."
      );
    }
    // record.system tells us which system (e.g. "Blasters")

    // ------------------------------
    // 4) VERIFY PAYHIP (UNLESS GEN- prefix)
    // ------------------------------
    let verifyData = { valid: true }; // default “valid” for GEN- keys
    const isGeneratedKey = licenseKey.startsWith("GEN-");

    if (!isGeneratedKey) {
      // Only call Payhip if key is not GEN-…
      try {
        const response = await axios.get(
          "https://payhip.com/api/v1/license/verify",
          {
            params: {
              product_key: record.system, // must exactly match config.SYSTEMS[*].name
              license_key: licenseKey,
            },
            headers: {
              Authorization: PAYHIP_API_KEY,
            },
          }
        );
        verifyData = response.data; // { valid: true/false, … }
      } catch (err) {
        if (err.response) {
          console.error(
            "❌ Payhip responded with status",
            err.response.status,
            "and data:",
            err.response.data
          );
        } else {
          console.error("❌ Error verifying license with Payhip:", err.message);
        }
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
    // 5) ENSURE NO DUPLICATE REDEMPTION IN OUR OWN DATABASE
    // ------------------------------
    const existing = getPurchaseByKey.get(licenseKey);
    if (existing) {
      return interaction.editReply(
        "❌ That license key has already been redeemed."
      );
    }

    // ------------------------------
    // 6) ENFORCE 30-DAY COOLDOWN FOR THE SAME SYSTEM
    // ------------------------------
    const now = Date.now();
    const userPurchases = getPurchasesByUser.all(discordId);
    for (const p of userPurchases) {
      if (p.system === record.system && now < p.cooldown_ends_at) {
        const daysLeft = Math.ceil(
          (p.cooldown_ends_at - now) / (1000 * 60 * 60 * 24)
        );
        return interaction.editReply(
          `❌ You must wait ${daysLeft} more day(s) before redeeming another license for **${record.system}**.`
        );
      }
    }

    // ------------------------------
    // 7) INSERT OR UPDATE “users” TABLE
    // ------------------------------
    addUser.run(discordId, now);
    updateUserRoblox.run(robloxId, discordId);

    // ------------------------------
    // 8) ADD PURCHASE ROW IN “purchases” TABLE
    // ------------------------------
    const cooldownEndsAt = now + config.COOLDOWN_MS;
    addPurchase.run(discordId, record.system, licenseKey, now, cooldownEndsAt);

    // ------------------------------
    // 9) ASSIGN “Buyer” ROLE IN DISCORD
    // ------------------------------
    const sysEntry = config.SYSTEMS.find((s) => s.name === record.system);
    if (sysEntry) {
      try {
        const guild = client.guilds.cache.get(process.env.DISCORD_GUILD_ID);
        const member = await guild.members.fetch(discordId);
        await member.roles.add(sysEntry.roleId);
      } catch (err) {
        console.warn(`⚠️ Could not assign role for system ${record.system}:`, err);
      }
    }

    // ------------------------------
    // 10) APPEND Roblox ID TO whitelist_<system>.json
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
    // 11) REMOVE LICENSE FROM pending_licenses.json
    // ------------------------------
    delete pending[licenseKey];
    fs.writeFileSync(pendingPath, JSON.stringify(pending, null, 2));

    // ------------------------------
    // 12) LOG THE ACTION IN “logs” TABLE
    // ------------------------------
    addLog.run("whitelist_redeemed", discordId, robloxId, record.system, now);

    // ------------------------------
    // 13) SEND FINAL CONFIRMATION TO USER
    // ------------------------------
    const groupId = sysEntry.groupId; // Roblox numeric group ID
    return interaction.editReply({
      content:
        `✅ You are now whitelisted for **${record.system}**!\n` +
        `➡️ Join the **${record.system}** Roblox group: ` +
        `https://www.roblox.com/groups/${groupId}\n` +
        `➡️ After you click “Join Group” in Roblox, run \`/join_sync ${record.system}\`.`
    });
  },
};
