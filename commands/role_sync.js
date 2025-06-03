// commands/rolesync.js
// =======================================================================
// Slash command (/rolesync) to re-sync a user’s “Buyer” roles based on
// their purchase history in the database. This helps if a user has lost
// their role or re-joined the server.
//
// Steps performed here:
// 1) Read the invoking user’s Discord ID.
// 2) Query the “purchases” table for all systems this user has ever bought.
// 3) Build a set of system names the user currently owns (no cooldown check).
// 4) Fetch the GuildMember object for the user.
// 5) For each system defined in config.SYSTEMS:
//    a) If the user owns that system but doesn’t have the corresponding role, add it.
//    b) If the user does NOT own that system but still has the “Buyer” role, remove it.
// 6) Report back to the user which roles were added or removed (or say “No changes”).
// =======================================================================

const { SlashCommandBuilder } = require("discord.js");

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

    // 1) Defer reply since this may take a moment
    await interaction.deferReply({ ephemeral: true });

    // 2) Gather the invoking user’s Discord ID
    const discordId = interaction.user.id;

    // 3) Query the database for every purchase row for this user
    //    (returns an array of rows, each with fields: id, discord_id, system, license_key, verified_at, cooldown_ends_at)
    const userPurchases = getPurchasesByUser.all(discordId);

    // 4) Build a Set of system names the user has purchased at least once
    const ownedSystems = new Set();
    for (const purchase of userPurchases) {
      ownedSystems.add(purchase.system);
    }

    // 5) Fetch the GuildMember object so we can add/remove roles
    let member;
    try {
      // Replace with your actual guild ID or use process.env.DISCORD_GUILD_ID
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

    // 6) Loop through every system defined in config.SYSTEMS
    //    and decide whether to add or remove the Buyer role
    const rolesAdded = [];
    const rolesRemoved = [];

    for (const sysEntry of config.SYSTEMS) {
      const { name: systemName, roleId } = sysEntry;
      const hasRole = member.roles.cache.has(roleId);
      const shouldHaveRole = ownedSystems.has(systemName);

      if (shouldHaveRole && !hasRole) {
        // a) User owns this system but is missing the role → add it
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
        // b) User does NOT own this system but still has the role → remove it
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
      // If shouldHaveRole && hasRole → do nothing (already correct)
      // If !shouldHaveRole && !hasRole → do nothing (already correct)
    }

    // 7) Construct a reply summarizing what changed
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

    // 8) Send the final ephemeral reply to the user
    return interaction.editReply(replyContent);
  },
};
