// index.js
// =======================================================================
// Main entry point for the GreenLit Whitelist Automation Bot
// =======================================================================
//
// Responsibilities:
// 1) Load environment variables from .env (API keys, tokens, port)
// 2) Start an Express server to handle Payhip webhooks and optional whitelist endpoints
// 3) Initialize the Discord bot: load slash commands, register them, and log in
// 4) Provide a “context” object to each slash-command handler, including:
//    - config (SYSTEMS, COOLDOWN_MS)
//    - DB helper functions (addUser, getUser, addPurchase, etc.)
//    - axios for HTTP requests
//    - Roblox Group API Keys (one per system)
//    - The Discord client instance (so commands can assign roles)
// =======================================================================

// ------------------------------
// 1) LOAD DEPENDENCIES & CONFIG
// ------------------------------
require("dotenv").config(); // Automatically reads .env and sets process.env variables

const fs = require("fs");          // File-system module (read/write files)
const path = require("path");      // For building file paths that work on any OS
const express = require("express"); // Express web framework for Node.js
const axios = require("axios");    // HTTP client to make API calls
const crypto = require("crypto");  // Built-in Node.js crypto library for hashing

// Discord.js classes & REST helper for slash commands
const {
  Client,
  GatewayIntentBits,
  Collection,
  Routes
} = require("discord.js");
const { REST } = require("@discordjs/rest");

// Our own modules
const config = require("./config"); // Exports SYSTEMS array and COOLDOWN_MS
const {
  addUser,
  updateUserRoblox,
  getUser,
  addPurchase,
  getPurchaseByKey,
  getPurchasesByUser,
  updateCooldown,
  deletePurchase,
  addLog,
  getRecentLogs,
  db
} = require("./db");

// ------------------------------
// 2) READ ENVIRONMENT VARIABLES
// ------------------------------
// These variables come from the .env file:
const {
  // Discord bot settings
  DISCORD_TOKEN,
  DISCORD_CLIENT_ID,
  DISCORD_GUILD_ID,

  // Payhip must send webhook signature = SHA256(PAYHIP_API_KEY)
  PAYHIP_API_KEY,

  // Roblox Group API Keys (one API key per group/system)
  APIKEY_SPEEDERS,
  APIKEY_SHIP_SYSTEM,
  APIKEY_LIGHTSABERS,
  APIKEY_BLASTERS,
  APIKEY_UTILITIES,
  APIKEY_MORPH_GUI,

  // Port for Express server (e.g. 3000)
  PORT = 3000
} = process.env;

// ------------------------------
// 3) SET UP EXPRESS SERVER
// ------------------------------
const app = express();
app.use(express.json()); // Automatic JSON parsing for POST bodies

// ---------- PAYHIP WEBHOOK ----------
// Payhip will send a POST request here when a purchase completes.
// The payload includes a “signature” field = SHA256(PAYHIP_API_KEY).
// We verify the signature, then store license keys in pending_licenses.json.
app.post("/payhip-webhook", (req, res) => {
  const body = req.body;       // The JSON payload from Payhip
  const incomingSig = body.signature || ""; // The signature they sent

  // Compute “expected” signature = SHA256(PAYHIP_API_KEY)
  const expectedSig = crypto
    .createHash("sha256")
    .update(PAYHIP_API_KEY)
    .digest("hex");

  // If signatures don’t match, reject
  if (incomingSig !== expectedSig) {
    console.warn("❌ Invalid Payhip signature");
    return res.status(400).send("Invalid signature");
  }

  // Only proceed if the event type is “paid” (a completed purchase)
  if (body.type !== "paid") {
    // If it’s not a “paid” event, we ignore it
    return res.status(200).send("Ignored non-paid event");
  }

  // Load the existing pending_licenses.json (or create a new object)
  const pendingPath = path.join(__dirname, "pending_licenses.json");
  let pending = {};
  if (fs.existsSync(pendingPath)) {
    pending = JSON.parse(fs.readFileSync(pendingPath, "utf8"));
  }

  // The “items” array in the webhook body lists each purchased product.
  // For each item, store its license key as a key in pending_licenses.json.
  for (const item of body.items) {
    // item.product_name = system name (must match config.SYSTEMS.name exactly)
    // item.product_key = the license code the buyer received
    pending[item.product_key] = {
      email: body.email,          // buyer’s email address (not used by bot logic)
      system: item.product_name,  // system name (one of config.SYSTEMS)
      timestamp: Date.now()       // record when Payhip notified us
    };
  }

  // Write the updated pending_licenses.json back to disk
  fs.writeFileSync(pendingPath, JSON.stringify(pending, null, 2));
  console.log("✅ Stored pending licenses:", Object.keys(pending).join(", "));
  return res.status(200).send("OK");
});

// ---------- OPTIONAL: LOCAL WHITELIST ENDPOINT ----------
// If you want Roblox to fetch the whitelist from this server instead of GitHub Gist,
// enable this endpoint. Roblox can GET /whitelist/Speeders, /whitelist/Lightsabers, etc.
app.get("/whitelist/:system", (req, res) => {
  const systemName = req.params.system; // e.g. “Speeders”

  // Find the matching system in config.SYSTEMS (case-insensitive)
  const entry = config.SYSTEMS.find(
    (s) => s.name.toLowerCase() === systemName.toLowerCase()
  );
  if (!entry) {
    return res.status(404).send("No such system");
  }

  // Read the JSON file (an array of Roblox IDs as strings)
  const filePath = path.join(__dirname, entry.file);
  if (!fs.existsSync(filePath)) {
    return res.status(404).send("Whitelist file not found");
  }

  const arr = JSON.parse(fs.readFileSync(filePath, "utf8"));
  // Return as newline-separated text so Roblox’s HttpService:Split() can parse it
  return res.type("text/plain").send(arr.join("\n"));
});

// Start the Express server listening on the specified port
app.listen(PORT, () => {
  console.log(`🌐 Express server listening on port ${PORT}`);
});

// ------------------------------
// 4) DISCORD BOT SETUP
// ------------------------------
// Create a new Discord client. We only need the “Guilds” intent for slash commands.
const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

// Create a Collection (map) to hold slash-command modules
client.commands = new Collection();

// Read all JavaScript files in the “commands” folder
const commandsPath = path.join(__dirname, "commands");
const commandFiles = fs.readdirSync(commandsPath).filter((f) => f.endsWith(".js"));

// For each file, require (load) the module and add it to client.commands
for (const file of commandFiles) {
  const command = require(path.join(commandsPath, file));
  // command.data.name is the slash command’s name (e.g. “whitelist”)
  client.commands.set(command.data.name, command);
}

// Register slash commands to your specific guild (server)
(async () => {
  try {
    console.log("🔄 Registering slash commands...");
    await new REST({ version: "10" })
      .setToken(DISCORD_TOKEN)
      .put(
        Routes.applicationGuildCommands(DISCORD_CLIENT_ID, DISCORD_GUILD_ID),
        { body: client.commands.map((cmd) => cmd.data.toJSON()) }
      );
    console.log("✅ Slash commands registered.");
  } catch (err) {
    console.error("❌ Error registering slash commands:", err);
  }
})();

// When the bot is ready (logged in)
client.once("ready", () => {
  console.log(`🤖 Discord logged in as ${client.user.tag}`);
});

// Handle interactions (slash commands)
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return; // Only proceed if it’s a slash command
  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    // Provide to each command: config, DB methods, axios, API keys, Discord client
    await command.execute(interaction, {
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
        addLog,
        getRecentLogs,
        db
      },
      axios,
      // Pass each group’s API key from .env
      APIKEY_SPEEDERS,
      APIKEY_SHIP_SYSTEM,
      APIKEY_LIGHTSABERS,
      APIKEY_BLASTERS,
      APIKEY_UTILITIES,
      APIKEY_MORPH_GUI,
      client
    });
  } catch (error) {
    console.error(`❌ Error in command ${interaction.commandName}:`, error);
    // If the command has already replied or deferred, edit; otherwise send a new reply
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply("❌ An error occurred while executing that command.");
    } else {
      await interaction.reply({
        content: "❌ An error occurred while executing that command.",
        ephemeral: true
      });
    }
  }
});

// Login to Discord using the bot token from .env
client.login(DISCORD_TOKEN);
