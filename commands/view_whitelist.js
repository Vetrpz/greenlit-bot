// commands/view_whitelist.js
// =======================================================================
// Admin-only command to view all whitelist entries for a specified user.
// Usage: /view_whitelist <discord_or_roblox>
//
// If the input matches a Discord ID, show all systems that person owns.
// If it matches a Roblox ID, find the corresponding Discord ID from purchases.
// =======================================================================

const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("view_whitelist")
    .setDescription("View a user’s whitelist entries (Admin only).")
    .addStringOption((opt) =>
      opt
        .setName("discord_or_roblox")
        .setDescription("Discord ID or Roblox ID")
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator), // Only Admins

  async execute(interaction, context) {
    const {
      config,
      db: { getPurchasesByUser, getUser }
    } = context;

    // 1) Read the input from the command
    const input = interaction.options.getString("discord_or_roblox").trim();

    // 2) Try to interpret input as a Discord ID
    let discordId = null;
    const userRow = getUser.get(input);
    if (userRow) {
      discordId = userRow.discord_id;
    } else {
      // 3) If not a Discord ID, try interpreting as a Roblox ID by scanning purchases
      const allPurchases = getPurchasesByUser.all(); // returns entire purchases table
      const match = allPurchases.find((p) => p.roblox_user_id === input);
      if (match) {
        discordId = match.discord_id;
      }
    }

    if (!discordId) {
      return interaction.reply({
        content: "❌ No user found with that ID.",
        ephemeral: true
      });
    }

    // 4) Fetch all purchases (whitelist entries) for this Discord ID
    const purchases = getPurchasesByUser.all(discordId);
    if (!purchases.length) {
      return interaction.reply({
        content: "❌ That user has no whitelist entries.",
        ephemeral: true
      });
    }

    // 5) Build lines showing each system, Roblox ID, redeemed date, cooldown end
    const lines = purchases.map((p) => {
      return (
        `• **${p.system}** – Roblox ID: \`${p.roblox_user_id}\` – ` +
        `Redeemed: <t:${Math.floor(p.verified_at / 1000)}:f> – ` +
        `Cooldown ends: <t:${Math.floor(p.cooldown_ends_at / 1000)}:D>`
      );
    });

    // 6) Reply with all lines (ephemeral so only Admin sees)
    return interaction.reply({
      content: ["**Whitelist Entries for That User:**", ...lines].join("\n"),
      ephemeral: true
    });
  }
};
