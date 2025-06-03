// commands/history.js
// =======================================================================
// The /history command lists all license keys the buyer has redeemed,
// along with the system name and redemption date/time.
// =======================================================================

const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("history")
    .setDescription("Show all your redeemed license keys and dates."),

  async execute(interaction, context) {
    const { db: { getPurchasesByUser } } = context;
    const discordId = interaction.user.id;

    // 1) Fetch all purchase records for this Discord ID
    const purchases = getPurchasesByUser.all(discordId);
    if (!purchases.length) {
      return interaction.reply({
        content: "You have not redeemed any licenses yet.",
        ephemeral: true
      });
    }

    // 2) Build a line of text for each purchase
    const lines = purchases.map((p) => {
      return (
        `• **${p.system}** – Key: \`${p.license_key}\` – ` +
        `Redeemed: <t:${Math.floor(p.verified_at / 1000)}:f>`
      );
    });

    // 3) Reply with all lines, hidden from others (ephemeral)
    return interaction.reply({
      content: ["**Your Purchase History:**", ...lines].join("\n"),
      ephemeral: true
    });
  }
};
