// commands/rolesync.js
// =======================================================================
// Slash command (/rolesync) to resynchronize a user’s “Buyer” roles based
// on their purchase history. Logs the changes into the “logs” channel.
// =======================================================================

const { SlashCommandBuilder } = require("discord.js");
const { log } = require("../utils/logger"); // Import the logging helper

module.exports = {
  data: new SlashCommandBuilder()
    .setName("rolesync")
    .setDescription("Re-sync your Buyer roles based on your purchase history."),

  async execute(interaction, context) {
    const {
      db: { getPurchasesByUser },
      client,
      config
    } = context;

    await interaction.deferReply({ ephemeral: true });
    const discordId = interaction.user.id;

    // 1) Fetch all purchase rows for this user
    const userPurchases = getPurchasesByUser.all(discordId);

    // 2) Build a Set of system names the user owns
    const ownedSystems = new Set();
    for (const purchase of userPurchases) {
      ownedSystems.add(purchase.system);
    }

    // 3) Fetch the GuildMember so we can add/remove roles
    let member;
    try {
      const guild = client.guilds.cache.get(process.env.DISCORD_GUILD_ID);
      if (!guild) {
        throw new Error("Guild not found in client cache.");
      }
      member = await guild.members.fetch(discordId);
    } catch (err) {
      console.error("❌ Could not fetch guild member for rolesync:", err);
      return interaction.editReply(
        "❌ There was an error fetching your member profile. Please try again."
      );
    }

    // 4) Loop through each system and add/remove roles accordingly
    const rolesAdded = [];
    const rolesRemoved = [];

    for (const sysEntry of config.SYSTEMS) {
      const { name: systemName, roleId } = sysEntry;
      const hasRole = member.roles.cache.has(roleId);
      const shouldHaveRole = ownedSystems.has(systemName);

      if (shouldHaveRole && !hasRole) {
        // User owns this system but is missing the role → add it
        try {
          await member.roles.add(roleId);
          rolesAdded.push(systemName);
        } catch (err) {
          console.warn(
            `⚠️ Failed to add role for system ${systemName} to user ${discordId}:`,
            err
          );
        }
      } else if (!shouldHaveRole && hasRole) {
        // User does NOT own this system but still has the role → remove it
        try {
          await member.roles.remove(roleId);
          rolesRemoved.push(systemName);
        } catch (err) {
          console.warn(
            `⚠️ Failed to remove role for system ${systemName} from user ${discordId}:`,
            err
          );
        }
      }
      // If shouldHaveRole && hasRole, or !shouldHaveRole && !hasRole, do nothing.
    }

    // 5) Construct a reply summarizing changes
    let replyContent = "";
    if (rolesAdded.length === 0 && rolesRemoved.length === 0) {
      replyContent = "✅ Your roles are already up-to-date—no changes needed.";
    } else {
      if (rolesAdded.length > 0) {
        replyContent += `✅ Added roles for: ${rolesAdded
          .map((s) => `**${s}**`)
          .join(", ")}\n`;
      }
      if (rolesRemoved.length > 0) {
        replyContent += `⚠️ Removed roles for: ${rolesRemoved
          .map((s) => `**${s}**`)
          .join(", ")}\n`;
      }
    }

    // 6) Log this rolesync to the “logs” channel if enabled
    if (rolesAdded.length > 0 || rolesRemoved.length > 0) {
      await log(
        context,
        `🔄 **ROLESYNC**: <@${discordId}> had roles **added**: [${rolesAdded.join(
          ", "
        )}] and **removed**: [${rolesRemoved.join(", ")}].`
      );
    } else {
      await log(context, `🔄 **ROLESYNC**: <@${discordId}> had no role changes.`);
    }

    // 7) Send the ephemeral reply to the user
    return interaction.editReply(replyContent);
  }
};
