// commands/status.js
// =======================================================================
// The /status command shows the buyer’s current Roblox ID, which systems
// they own, and how many days remain until they can update that system again.
// =======================================================================

const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("status")
    .setDescription("View your current whitelist status and cooldown timers"),

  async execute(interaction, context) {
    const {
      db: { getUser, getPurchasesByUser }
    } = context;

    // 1) Get the buyer’s Discord ID
    const discordId = interaction.user.id;

    // 2) Look up the buyer’s user row in the ‘users’ table
    const userRow = getUser.get(discordId);
    if (!userRow) {
      // If no row, they have never run /whitelist
      return interaction.reply({
        content: "You have no whitelist records yet.",
        ephemeral: true
      });
    }

    // 3) Look up all purchases for this Discord ID
    const purchases = getPurchasesByUser.all(discordId); // returns an array
    if (!purchases.length) {
      return interaction.reply({
        content: "You haven’t redeemed any licenses yet.",
        ephemeral: true
      });
    }

    const now = Date.now();
    // 4) Build one line per system they own
    const lines = purchases.map((p) => {
      // Calculate how many days remain until cooldown for that system ends
      const cooldownMs = Math.max(0, p.cooldown_ends_at - now);
      const daysLeft = Math.ceil(cooldownMs / (1000 * 60 * 60 * 24));
      // Format: • SystemName – Redeemed: <date> – Next update in X day(s)
      return (
        `• **${p.system}** – Redeemed: <t:${Math.floor(p.verified_at / 1000)}:D> – ` +
        `Next update in ${daysLeft} day(s)`
      );
    });

    // 5) Reply with a summary, including their Roblox ID
    return interaction.reply({
      content: [
        `**Your Whitelist Status**`,
        `Roblox ID: \`${userRow.roblox_id}\``,
        `Systems Owned:`,
        ...lines
      ].join("\n"),
      ephemeral: true
    });
  }
};
