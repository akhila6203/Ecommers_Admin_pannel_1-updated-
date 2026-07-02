const mysql = require("mysql2/promise");
const dotenv = require("dotenv");
const logger = require("./logger");
dotenv.config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT) || 3306,
  database: process.env.DB_NAME || "lms",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  waitForConnections: true,
  connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT) || 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
});

async function query(sql, params = []) {
  try {
    const [results] = await pool.execute(sql, params);
    return results;
  } catch (error) {
    logger.error("Database query error:", error);
    throw error;
  }
}

async function getConnection() {
  try {
    const connection = await pool.getConnection();
    return connection;
  } catch (error) {
    logger.error("Database connection error:", error);
    throw error;
  }
}

async function testConnection() {
  try {
    const connection = await pool.getConnection();
    logger.info("MySQL database connected successfully");
    connection.release();
    return true;
  } catch (error) {
    logger.error("MySQL database connection failed:", error.message);
    return false;
  }
}

module.exports.query = query;
module.exports.getConnection = getConnection;
module.exports.testConnection = testConnection;
