const { query } = require("../config/db");
const { successResponse, errorResponse } = require("../helpers/responseHelper");
const { getStoreId } = require("../helpers/storeHelper");
const logger = require("../config/logger");
const ADDRESS_FIELDS =
  "id, store_id, customer_id, address_type, full_name, phone, address_line1, address_line2, city, state, pincode, country, is_default, created_at, updated_at";

const normalizeAddressBody = (body) => ({
  address_type: body.address_type || "shipping",
  full_name: body.full_name?.trim(),
  phone: body.phone?.trim(),
  address_line1: body.address_line1?.trim(),
  address_line2: body.address_line2?.trim() || null,
  city: body.city?.trim(),
  state: body.state?.trim(),
  pincode: body.pincode?.trim(),
  country: body.country?.trim() || "India",
  is_default: body.is_default ? 1 : 0,
});

const validateAddressPayload = (payload) => {
  if (!payload.full_name) return "Full name is required";
  if (!payload.phone) return "Phone is required";
  if (!payload.address_line1) return "Address line 1 is required";
  if (!payload.city) return "City is required";
  if (!payload.state) return "State is required";
  if (!payload.pincode) return "Pincode is required";
  return null;
};

const clearDefaultAddresses = async (customerId, storeId, exceptId = null) => {
  const params = [customerId, storeId];
  let sql =
    "UPDATE customer_addresses SET is_default = 0 WHERE customer_id = ? AND store_id = ?";
  if (exceptId) {
    sql += " AND id != ?";
    params.push(exceptId);
  }
  await query(sql, params);
};

const getAddresses = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const customerId = req.customer.id;

    const rows = await query(
      `SELECT ${ADDRESS_FIELDS} FROM customer_addresses
       WHERE store_id = ? AND customer_id = ?
       ORDER BY is_default DESC, created_at DESC`,
      [storeId, customerId]
    );

    return successResponse(res, rows, "Addresses fetched successfully");
  } catch (error) {
    logger.error("Get addresses error:", error);
    return errorResponse(res, "Failed to fetch addresses", 500);
  }
};

const createAddress = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const customerId = req.customer.id;
    const payload = normalizeAddressBody(req.body);
    const validationError = validateAddressPayload(payload);
    if (validationError) return errorResponse(res, validationError, 400);

    if (payload.is_default) {
      await clearDefaultAddresses(customerId, storeId);
    }

    const result = await query(
      `INSERT INTO customer_addresses
        (store_id, customer_id, address_type, full_name, phone, address_line1, address_line2, city, state, pincode, country, is_default)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        storeId,
        customerId,
        payload.address_type,
        payload.full_name,
        payload.phone,
        payload.address_line1,
        payload.address_line2,
        payload.city,
        payload.state,
        payload.pincode,
        payload.country,
        payload.is_default,
      ]
    );

    const rows = await query(
      `SELECT ${ADDRESS_FIELDS} FROM customer_addresses WHERE id = ? AND store_id = ? AND customer_id = ?`,
      [result.insertId, storeId, customerId]
    );

    return successResponse(res, rows[0], "Address added successfully", 201);
  } catch (error) {
    logger.error("Create address error:", error);
    return errorResponse(res, "Failed to add address", 500);
  }
};

const updateAddress = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const customerId = req.customer.id;
    const addressId = req.params.id;

    const existing = await query(
      `SELECT id FROM customer_addresses WHERE id = ? AND store_id = ? AND customer_id = ?`,
      [addressId, storeId, customerId]
    );
    if (!existing.length) return errorResponse(res, "Address not found", 404);

    const payload = normalizeAddressBody(req.body);
    const validationError = validateAddressPayload(payload);
    if (validationError) return errorResponse(res, validationError, 400);

    if (payload.is_default) {
      await clearDefaultAddresses(customerId, storeId, addressId);
    }

    await query(
      `UPDATE customer_addresses SET
        address_type = ?, full_name = ?, phone = ?, address_line1 = ?, address_line2 = ?,
        city = ?, state = ?, pincode = ?, country = ?, is_default = ?
       WHERE id = ? AND store_id = ? AND customer_id = ?`,
      [
        payload.address_type,
        payload.full_name,
        payload.phone,
        payload.address_line1,
        payload.address_line2,
        payload.city,
        payload.state,
        payload.pincode,
        payload.country,
        payload.is_default,
        addressId,
        storeId,
        customerId,
      ]
    );

    const rows = await query(
      `SELECT ${ADDRESS_FIELDS} FROM customer_addresses WHERE id = ? AND store_id = ? AND customer_id = ?`,
      [addressId, storeId, customerId]
    );

    return successResponse(res, rows[0], "Address updated successfully");
  } catch (error) {
    logger.error("Update address error:", error);
    return errorResponse(res, "Failed to update address", 500);
  }
};

const deleteAddress = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const customerId = req.customer.id;
    const addressId = req.params.id;

    const existing = await query(
      `SELECT id FROM customer_addresses WHERE id = ? AND store_id = ? AND customer_id = ?`,
      [addressId, storeId, customerId]
    );
    if (!existing.length) return errorResponse(res, "Address not found", 404);

    await query(
      "DELETE FROM customer_addresses WHERE id = ? AND store_id = ? AND customer_id = ?",
      [addressId, storeId, customerId]
    );

    return successResponse(res, null, "Address deleted successfully");
  } catch (error) {
    logger.error("Delete address error:", error);
    return errorResponse(res, "Failed to delete address", 500);
  }
};

const setDefaultAddress = async (req, res) => {
  try {
    const storeId = getStoreId(req);
    const customerId = req.customer.id;
    const addressId = req.params.id;

    const existing = await query(
      `SELECT id FROM customer_addresses WHERE id = ? AND store_id = ? AND customer_id = ?`,
      [addressId, storeId, customerId]
    );
    if (!existing.length) return errorResponse(res, "Address not found", 404);

    await clearDefaultAddresses(customerId, storeId);
    await query(
      "UPDATE customer_addresses SET is_default = 1 WHERE id = ? AND store_id = ? AND customer_id = ?",
      [addressId, storeId, customerId]
    );

    const rows = await query(
      `SELECT ${ADDRESS_FIELDS} FROM customer_addresses WHERE id = ? AND store_id = ? AND customer_id = ?`,
      [addressId, storeId, customerId]
    );

    return successResponse(res, rows[0], "Default address updated");
  } catch (error) {
    logger.error("Set default address error:", error);
    return errorResponse(res, "Failed to set default address", 500);
  }
};

module.exports.getAddresses = getAddresses;
module.exports.createAddress = createAddress;
module.exports.updateAddress = updateAddress;
module.exports.deleteAddress = deleteAddress;
module.exports.setDefaultAddress = setDefaultAddress;
