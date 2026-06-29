import crypto from "crypto";
import { hashPassword, comparePassword } from "./passwordHelper.js";
import { generateToken, verifyToken } from "./jwtHelper.js";

export const INDIAN_PHONE_REGEX = /^[6-9]\d{9}$/;

export const normalizeIndianPhone = (phone) => {
  if (!phone) return "";
  const digits = String(phone).replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) return digits.slice(1);
  return digits.length >= 10 ? digits.slice(-10) : digits;
};

export const isValidIndianPhone = (phone) => INDIAN_PHONE_REGEX.test(normalizeIndianPhone(phone));

export const generateOtpCode = () => String(Math.floor(100000 + Math.random() * 900000));

export const hashOtp = async (otp) => hashPassword(String(otp));

export const compareOtp = async (otp, otpHash) => comparePassword(String(otp), otpHash);

export const getOtpExpiryDate = (minutes = 5) => {
  const expires = new Date();
  expires.setMinutes(expires.getMinutes() + minutes);
  return expires;
};

export const createPhoneVerificationToken = (payload) =>
  generateToken(
    {
      type: "phone_verification",
      storeId: payload.storeId,
      phone: payload.phone,
      purpose: payload.purpose,
    },
    "10m"
  );

export const verifyPhoneVerificationToken = (token, expected) => {
  const decoded = verifyToken(token);
  if (decoded.type !== "phone_verification") {
    throw new Error("Invalid verification token");
  }
  if (decoded.storeId !== expected.storeId) {
    throw new Error("Invalid verification token");
  }
  if (decoded.phone !== expected.phone) {
    throw new Error("Invalid verification token");
  }
  if (decoded.purpose !== expected.purpose) {
    throw new Error("Invalid verification token");
  }
  return decoded;
};

export const hashResetToken = (token) =>
  crypto.createHash("sha256").update(String(token)).digest("hex");
