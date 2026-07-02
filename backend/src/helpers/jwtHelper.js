const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const generateToken = (payload, expiresIn = "1h") => {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn,
    issuer: process.env.JWT_ISSUER,
  });
};

const generateRefreshToken = (payload) => {
  return jwt.sign(payload, process.env.JWT_REFRESH_SECRET, {
    expiresIn: "7d",
    issuer: process.env.JWT_ISSUER,
  });
};

const verifyToken = (token) => {
  return jwt.verify(token, process.env.JWT_SECRET);
};

const verifyRefreshToken = (token) => {
  return jwt.verify(token, process.env.JWT_REFRESH_SECRET);
};

const generateRandomToken = (bytes = 32) => {
  return crypto.randomBytes(bytes).toString("hex");
};

module.exports = {
  generateToken,
  generateRefreshToken,
  verifyToken,
  verifyRefreshToken,
  generateRandomToken,
};