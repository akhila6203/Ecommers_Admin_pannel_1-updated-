import api from "./api";

export const getOrders = (params = {}) => api.get("/orders", { params });

export const getOrderStats = () => api.get("/orders/stats");

export const getOrder = (id) => api.get(`/orders/${id}`);

export const createOrder = (data) => api.post("/orders", data);

export const updateOrderStatus = (id, status) => api.put(`/orders/${id}/status`, { status });

export const updatePaymentStatus = (id, paymentStatus) =>
  api.put(`/orders/${id}/payment`, { payment_status: paymentStatus });

export const addOrderNote = (id, note) => api.post(`/orders/${id}/notes`, { note });

export const deleteOrder = (id) => api.delete(`/orders/${id}`);

export const cancelOrder = (id) => api.put(`/orders/${id}/status`, { status: "cancelled" });

export const createShiprocketShipment = (id, payload = {}) =>
  api.post(`/orders/${id}/shiprocket/create-shipment`, payload);

export const syncShiprocketTracking = (id) =>
  api.post(`/orders/${id}/shiprocket/sync-tracking`);

export const generateShiprocketLabel = (id) =>
  api.post(`/orders/${id}/shiprocket/generate-label`);

export const scheduleShiprocketPickup = (id) =>
  api.post(`/orders/${id}/shiprocket/schedule-pickup`);

export const assignShiprocketAwb = (id, payload = {}) =>
  api.post(`/orders/${id}/shiprocket/assign-awb`, payload);