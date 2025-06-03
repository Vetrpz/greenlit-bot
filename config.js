// config.js
// =====================
// This file defines each “system” you sell:
// 1) name: exact system name used in slash commands
// 2) file: local JSON file that holds the whitelist of Roblox IDs
// 3) roleId: the Discord Role ID to assign when someone redeems this system
// 4) groupId: the Roblox Group ID buyers must join for this system
// =====================

module.exports = {
  // Array of system definitions; add new systems here if needed.
  SYSTEMS: [
    {
      // System 1: Speeders
      name: "Speeders",
      // The JSON file: one array of strings (Roblox UserIDs)
      file: "whitelist_speeders.json",
      // Discord Role ID (paste the numeric ID of a role called “Speeders Buyer” or similar)
      roleId: "1379224887071084620",
      // Roblox Group ID for Speeders group (from the group’s URL)
      groupId: "7498327"
    },
    {
      // System 2: Ship System
      name: "Ship System",
      file: "whitelist_ship_system.json",
      roleId: "1379224887071084619",
      groupId: "33752338"
    },
    {
      // System 3: Lightsabers
      name: "Lightsabers",
      file: "whitelist_lightsabers.json",
      roleId: "1379224887071084618",
      groupId: "32064664"
    },
    {
      // System 4: Blasters
      name: "Blasters",
      file: "whitelist_blasters.json",
      roleId: "1379224887071084617",
      groupId: "15804186"
    },
    {
      // System 5: Utilities
      name: "Utilities",
      file: "whitelist_utilities.json",
      roleId: "1379224887071084616",
      groupId: "16517603"
    },
    {
      // System 6: Morph GUI
      name: "Morph GUI",
      file: "whitelist_morph_gui.json",
      roleId: "1379224887071084615",
      groupId: "33816091"
    }
  ],

  // Define a 30-day cooldown in milliseconds:
  // 30 days × 24 hours × 60 minutes × 60 seconds × 1000 milliseconds
  COOLDOWN_MS: 30 * 24 * 60 * 60 * 1000
};
