const { query } = require("../config/db");
const {
  generateOtpCode,
  hashOtp,
  compareOtp,
  getOtpExpiryDate,
  normalizeIndianPhone,
  createPhoneVerificationToken,
  verifyPhoneVerificationToken,
} = require("../helpers/otpHelper");
const { sendWhatsAppOtp } = require("../helpers/whatsappHelper");
const logger = require("../config/logger");
const OTP_EXPIRY_MINUTES = 5;
const MAX_OTP_ATTEMPTS = 5;
const OTP_RESEND_COOLDOWN_SECONDS = 60;
const OTP_HOURLY_LIMIT = 100;

const VALID_PURPOSES = new Set(["register", "forgot_password"]);

const assertValidPurpose = (purpose) => {
  if (!VALID_PURPOSES.has(purpose)) {
    throw Object.assign(new Error("Invalid OTP purpose"), { statusCode: 400 });
  }
};

const invalidateActiveOtps = async (storeId, phone, purpose) => {
  await query(
    `UPDATE customer_otps
     SET is_used = 1
     WHERE store_id = ? AND phone = ? AND purpose = ? AND is_used = 0`,
    [storeId, phone, purpose]
  );
};

const checkRateLimit = async (storeId, phone) => {
  const recentRows = await query(
    `SELECT created_at
     FROM customer_otps
     WHERE store_id = ? AND phone = ?
     ORDER BY created_at DESC
     LIMIT 1`,
    [storeId, phone]
  );

  if (recentRows.length) {
    const lastSent = new Date(recentRows[0].created_at);
    const secondsSince = (Date.now() - lastSent.getTime()) / 1000;
    if (secondsSince < OTP_RESEND_COOLDOWN_SECONDS) {
      const waitSeconds = Math.ceil(OTP_RESEND_COOLDOWN_SECONDS - secondsSince);
      throw Object.assign(
        new Error(`Please wait ${waitSeconds} seconds before requesting another OTP`),
        { statusCode: 429 }
      );
    }
  }

  const hourlyRows = await query(
    `SELECT COUNT(*) AS count
     FROM customer_otps
     WHERE store_id = ? AND phone = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR)`,
    [storeId, phone]
  );

  if ((hourlyRows[0]?.count ?? 0) >= OTP_HOURLY_LIMIT) {
    throw Object.assign(
      new Error("Too many OTP requests. Please try again after an hour."),
      { statusCode: 429 }
    );
  }
};

const createAndSendOtp = async ({ storeId, phone, email = null, purpose }) => {
  assertValidPurpose(purpose);
  await checkRateLimit(storeId, phone);

  const otp = generateOtpCode();
  const otpHash = await hashOtp(otp);
  const expiresAt = getOtpExpiryDate(OTP_EXPIRY_MINUTES);

  await invalidateActiveOtps(storeId, phone, purpose);

  await query(
    `INSERT INTO customer_otps
      (store_id, phone, email, otp_hash, purpose, expires_at, attempts, is_used)
     VALUES (?, ?, ?, ?, ?, ?, 0, 0)`,
    [storeId, phone, email, otpHash, purpose, expiresAt]
  );

  try {
    await sendWhatsAppOtp({ storeId, phone, otp });
  } catch (error) {
    logger.error("WhatsApp OTP delivery failed:", error);
    throw Object.assign(new Error(error.message || "Failed to send OTP via WhatsApp"), {
      statusCode: 502,
    });
  }

  return { expiresInMinutes: OTP_EXPIRY_MINUTES };
};

const getLatestActiveOtp = async (storeId, phone, purpose) => {
  const rows = await query(
    `SELECT id, otp_hash, expires_at, attempts, is_used
     FROM customer_otps
     WHERE store_id = ? AND phone = ? AND purpose = ? AND is_used = 0
     ORDER BY created_at DESC
     LIMIT 1`,
    [storeId, phone, purpose]
  );
  return rows[0] || null;
};

const verifyOtpCode = async ({ storeId, phone, otp, purpose }) => {
  assertValidPurpose(purpose);

  const record = await getLatestActiveOtp(storeId, phone, purpose);
  if (!record) {
    throw Object.assign(new Error("OTP expired or not found. Please request a new one."), {
      statusCode: 400,
    });
  }

  if (new Date(record.expires_at) < new Date()) {
    await query("UPDATE customer_otps SET is_used = 1 WHERE id = ?", [record.id]);
    throw Object.assign(new Error("OTP has expired. Please request a new one."), {
      statusCode: 400,
    });
  }

  if (record.attempts >= MAX_OTP_ATTEMPTS) {
    await query("UPDATE customer_otps SET is_used = 1 WHERE id = ?", [record.id]);
    throw Object.assign(new Error("Maximum OTP attempts exceeded. Please request a new one."), {
      statusCode: 429,
    });
  }

  const isMatch = await compareOtp(otp, record.otp_hash);
  if (!isMatch) {
    await query("UPDATE customer_otps SET attempts = attempts + 1 WHERE id = ?", [record.id]);
    const remaining = MAX_OTP_ATTEMPTS - (record.attempts + 1);
    throw Object.assign(
      new Error(
        remaining > 0
          ? `Invalid OTP. ${remaining} attempt(s) remaining.`
          : "Invalid OTP. Maximum attempts exceeded."
      ),
      { statusCode: 400 }
    );
  }

  await query("UPDATE customer_otps SET is_used = 1 WHERE id = ?", [record.id]);

  const verificationToken = createPhoneVerificationToken({ storeId, phone, purpose });
  return { verificationToken };
};

const assertRegisterPhoneVerified = ({ storeId, phone, verificationToken }) => {
  verifyPhoneVerificationToken(verificationToken, {
    storeId,
    phone: normalizeIndianPhone(phone),
    purpose: "register",
  });
};

module.exports = { normalizeIndianPhone, OTP_EXPIRY_MINUTES, MAX_OTP_ATTEMPTS };

module.exports.assertValidPurpose = assertValidPurpose;
module.exports.createAndSendOtp = createAndSendOtp;
module.exports.verifyOtpCode = verifyOtpCode;
module.exports.assertRegisterPhoneVerified = assertRegisterPhoneVerified;
