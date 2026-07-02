const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");
const dotenv = require("dotenv");
const logger = require("./logger");
dotenv.config();

const MIGRATIONS_DIR = path.join(__dirname, "../../migrations");

async function getMigrationConnection() {
  return mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    port: parseInt(process.env.DB_PORT, 10) || 3306,
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "lms",
    multipleStatements: true,
  });
}

function getMigrationFiles() {
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d{2}_.*\.sql$/.test(f))
    .sort();

  const syncFile = "14_sync_old_database.sql";
  const withoutSync = files.filter((f) => f !== syncFile);
  const firstContentIdx = withoutSync.findIndex((f) => f >= "10_");
  if (firstContentIdx >= 0) {
    withoutSync.splice(firstContentIdx, 0, syncFile);
  } else {
    withoutSync.push(syncFile);
  }
  return withoutSync;
}

async function ensureMigrationTable(connection) {
  await connection.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INT AUTO_INCREMENT PRIMARY KEY,
      filename VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

async function getAppliedMigrations(connection) {
  const [rows] = await connection.query("SELECT filename FROM schema_migrations");
  return new Set(rows.map((r) => r.filename));
}

async function bootstrapExistingDatabase(connection, files) {
  const [rows] = await connection.query(
    `SELECT COUNT(*) AS c FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products'`
  );
  if (!rows[0]?.c) return;

  const applied = await getAppliedMigrations(connection);
  if (applied.size > 0) return;

  const pending = files.filter((f) => f < "17_");
  for (const file of pending) {
    await connection.query("INSERT IGNORE INTO schema_migrations (filename) VALUES (?)", [file]);
  }
  if (pending.length) {
    logger.info(`Bootstrapped ${pending.length} existing migration record(s) for current database`);
  }
}

async function runPendingMigrations() {
  const connection = await getMigrationConnection();
  try {
    await ensureMigrationTable(connection);
    const files = getMigrationFiles();
    await bootstrapExistingDatabase(connection, files);
    const applied = await getAppliedMigrations(connection);
    let ran = 0;

    for (const file of files) {
      if (applied.has(file)) continue;

      const sqlPath = path.join(MIGRATIONS_DIR, file);
      const sql = fs.readFileSync(sqlPath, "utf8");
      logger.info(`Running migration: ${file}`);

      await connection.query(sql);
      await connection.query("INSERT INTO schema_migrations (filename) VALUES (?)", [file]);
      logger.info(`Migration applied: ${file}`);
      ran++;
    }

    if (ran === 0) {
      logger.info("Database migrations up to date");
    } else {
      logger.info(`Applied ${ran} pending migration(s)`);
    }
  } catch (error) {
    logger.error("Auto-migration failed:", error);
    throw error;
  } finally {
    await connection.end();
  }
}

module.exports.runPendingMigrations = runPendingMigrations;
