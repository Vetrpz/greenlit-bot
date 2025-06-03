// db.js
// =====================
// This file initializes an SQLite database (data.sqlite) and creates three tables:
// 1) users       – tracks Discord ID ↔ Roblox ID
// 2) purchases   – tracks each redeemed license, system name, when, and cooldown
// 3) logs        – audit trail of actions (redeems, revokes, join accepts, etc.)
// It also exports “prepared statements” (functions) that other code can call easily.
// =====================

const path = require("path");               // For building file paths
const Database = require("better-sqlite3"); // SQLite library

// Build a path to the database file (in the project root)
const dbPath = path.join(__dirname, "data.sqlite");

// Open (or create if it doesn't exist) the SQLite file
const db = new Database(dbPath);

// ---------------------
// 1) Create 'users' table
//    - discord_id  TEXT PRIMARY KEY
//    - roblox_id   TEXT (can be updated later)
//    - joined_at   INTEGER (timestamp when first seen)
db.prepare(`
  CREATE TABLE IF NOT EXISTS users (
    discord_id TEXT PRIMARY KEY,
    roblox_id TEXT,
    joined_at INTEGER
  );
`).run();

// ---------------------
// 2) Create 'purchases' table
//    - id                INTEGER PRIMARY KEY AUTOINCREMENT
//    - discord_id        TEXT NOT NULL  (foreign key → users.discord_id)
//    - system            TEXT NOT NULL  (one of config.SYSTEMS.name)
//    - license_key       TEXT UNIQUE NOT NULL
//    - verified_at       INTEGER NOT NULL
//    - cooldown_ends_at  INTEGER NOT NULL
db.prepare(`
  CREATE TABLE IF NOT EXISTS purchases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    discord_id TEXT NOT NULL,
    system TEXT NOT NULL,
    license_key TEXT UNIQUE NOT NULL,
    verified_at INTEGER NOT NULL,
    cooldown_ends_at INTEGER NOT NULL,
    FOREIGN KEY(discord_id) REFERENCES users(discord_id)
  );
`).run();

// ---------------------
// 3) Create 'logs' table
//    - id          INTEGER PRIMARY KEY AUTOINCREMENT
//    - action_type TEXT NOT NULL      (e.g., "whitelist_redeemed", "revoke", etc.)
//    - actor_id    TEXT               (Discord ID of who triggered action)
//    - target_id   TEXT               (Roblox ID targeted by the action, if any)
//    - system      TEXT               (system name if relevant)
//    - timestamp   INTEGER NOT NULL   (when the action occurred)
db.prepare(`
  CREATE TABLE IF NOT EXISTS logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action_type TEXT NOT NULL,
    actor_id TEXT,
    target_id TEXT,
    system TEXT,
    timestamp INTEGER NOT NULL
  );
`).run();

// =====================
// EXPORT PREPARED STATEMENTS FOR USE IN OTHER FILES
// =====================
module.exports = {
  db, // raw Database object, if you ever need manual queries

  // === users table ===
  // Insert a user if not already in the table (discord_id, joined_at)
  addUser: db.prepare("INSERT OR IGNORE INTO users(discord_id, joined_at) VALUES(?, ?)"),
  // Update an existing user’s Roblox ID
  updateUserRoblox: db.prepare("UPDATE users SET roblox_id = ? WHERE discord_id = ?"),
  // Retrieve a user row by Discord ID
  getUser: db.prepare("SELECT * FROM users WHERE discord_id = ?"),

  // === purchases table ===
  // Insert a new purchase record (discord_id, system, license_key, verified_at, cooldown_ends_at)
  addPurchase: db.prepare(`
    INSERT INTO purchases(discord_id, system, license_key, verified_at, cooldown_ends_at)
    VALUES(?, ?, ?, ?, ?)
  `),
  // Get a purchase by its license key
  getPurchaseByKey: db.prepare("SELECT * FROM purchases WHERE license_key = ?"),
  // Get all purchases for a given Discord ID
  getPurchasesByUser: db.prepare("SELECT * FROM purchases WHERE discord_id = ?"),
  // Update the cooldown end timestamp for a purchase (when changing Roblox ID)
  updateCooldown: db.prepare("UPDATE purchases SET cooldown_ends_at = ? WHERE id = ?"),
  // Delete a purchase record by its license key (used when revoking)
  deletePurchase: db.prepare("DELETE FROM purchases WHERE license_key = ?"),

  // === logs table ===
  // Add a log entry: action_type, actor_id, target_id, system, timestamp
  addLog: db.prepare(`
    INSERT INTO logs(action_type, actor_id, target_id, system, timestamp)
    VALUES(?, ?, ?, ?, ?)
  `),
  // Get the most recent N log entries
  getRecentLogs: db.prepare("SELECT * FROM logs ORDER BY timestamp DESC LIMIT ?")
};
