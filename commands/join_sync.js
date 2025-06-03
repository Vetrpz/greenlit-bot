// commands/join_sync.js
// =======================================================================
// The /join_sync command accepts the buyer’s pending join request for a
// particular system’s Roblox group. It uses the Roblox Open Cloud Group API
// (with a group-specific API key) to accept a join request.
//
// Steps performed here:
// 1. Read the buyer’s Discord ID and the ‘system’ name they passed.
// 2. Look up the buyer’s Roblox ID from the ‘users’ table.
// 3. Identify which Roblox group ID and API key correspond to that system.
// 4. Call the Roblox Group API endpoint to accept the join request.
// 5. Log the action in the ‘logs’ table.
// 6. Reply with success or an error if no pending request was found.
// =======================================================================

const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("join_sync")
    .setDescription("Accept your pending join request for a system’s group")
    .addStringOption((opt) =>
      opt
        .setName("system")
        .setDescription("Exact system name (e.g. Lightsabers)")
        .setRequired(true)
    ),

  async execute(interaction, context) {
    // Destructure needed items from context
    const {
      db: { getUser, addLog },
      axios,
      // The six API keys from environment variables
      APIKEY_SPEEDERS,
      APIKEY_SHIP_SYSTEM,
      APIKEY_LIGHTSABERS,
      APIKEY_BLASTERS,
      APIKEY_UTILITIES,
      APIKEY_MORPH_GUI,
      config
    } = context;

    // 1) Fetch command arguments
    const discordId = interaction.user.id;                      // Buyer’s Discord user ID
    const systemName = interaction.options.getString("system").trim(); // System name string

    // 2) Look up the buyer’s Roblox ID in the ‘users’ table
    const userRow = getUser.get(discordId);
    if (!userRow || !userRow.roblox_id) {
      // If no row or no roblox_id stored, they haven’t run /whitelist yet
      return interaction.reply({
        content: "❌ You need to run `/whitelist` first to set your Roblox ID.",
        ephemeral: true
      });
    }
    const robloxId = userRow.roblox_id; // The buyer’s numeric Roblox UserID

    // 3) Determine which group ID and API key to use for this system
    let groupId = null;
    let apiKey = null;

    // We loop through config.SYSTEMS to match the systemName (case-insensitive)
    for (const s of config.SYSTEMS) {
      if (s.name.toLowerCase() === systemName.toLowerCase()) {
        groupId = s.groupId; // Roblox group ID for that system
        // Pick the correct API key based on the system name
        if (s.name === "Speeders") apiKey = APIKEY_SPEEDERS;
        if (s.name === "Ship System") apiKey = APIKEY_SHIP_SYSTEM;
        if (s.name === "Lightsabers") apiKey = APIKEY_LIGHTSABERS;
        if (s.name === "Blasters") apiKey = APIKEY_BLASTERS;
        if (s.name === "Utilities") apiKey = APIKEY_UTILITIES;
        if (s.name === "Morph GUI") apiKey = APIKEY_MORPH_GUI;
        break;
      }
    }

    // If groupId or apiKey is still null, the system name was invalid
    if (!groupId || !apiKey) {
      return interaction.reply({
        content: `❌ I don’t recognize a system named **${systemName}**.`,
        ephemeral: true
      });
    }

    // 4) Acknowledge the command, giving time for the API call
    await interaction.deferReply({ ephemeral: true });

    // 5) Call Roblox Group API to accept the pending join request
    //    Endpoint format: POST https://groups.roblox.com/v1/groups/{groupId}/join-requests/users/{userId}/accept
    try {
      await axios.post(
        `https://groups.roblox.com/v1/groups/${groupId}/join-requests/users/${robloxId}/accept`,
        {}, // No request body needed
        {
          headers: {
            "x-api-key": apiKey // Include the group’s API key
          }
        }
      );

      // 6) Log success in ‘logs’ table
      addLog.run("join_accepted", discordId, robloxId, systemName, Date.now());

      // 7) Reply to the user
      return interaction.editReply(`✅ Your join request for **${systemName}** has been accepted!`);
    } catch (err) {
      // If Roblox says no pending request or any error occurs
      console.warn("❌ join_sync error:", err.response ? err.response.data : err);
      return interaction.editReply(
        "❌ I could not find your pending join request. " +
          "Make sure you clicked “Join Group” in Roblox and try `/join_sync` again in about 30 seconds."
      );
    }
  }
};
