import api from "./api";

export const getSettings = () => api.get("/settings");

export const getSettingsByGroup = (group) => api.get(`/settings/${group}`);

export const updateSettings = (settings) => api.put("/settings", { settings });

export const updateSettingsGroup = (group, data) => api.put(`/settings/${group}`, data);

export const getPublicSettings = () => api.get("/settings/public");

export const getStoreInformation = () => api.get("/settings/store-information");

export const updateStoreInformation = (data) => api.put("/settings/store-information", data);

export const getIntegrationSettings = () => api.get("/settings/integrations");

export const updateIntegrationSettings = (data) => api.put("/settings/integrations", data);

export const getAboutUsSettings = () => api.get("/settings/about-us");

export const updateAboutUsSettings = (data) => api.put("/settings/about-us", data);

export const getPrivacyPolicySettings = () => api.get("/settings/privacy-policy");

export const updatePrivacyPolicySettings = (data) => api.put("/settings/privacy-policy", data);

export const getTermsConditionsSettings = () => api.get("/settings/terms-conditions");

export const updateTermsConditionsSettings = (data) => api.put("/settings/terms-conditions", data);

export const getContactPageSettings = () => api.get("/settings/contact-page");

export const updateContactPageSettings = (data) => api.put("/settings/contact-page", data);

export const uploadSettingsImage = async (file, folder = "settings") => {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("folder", folder);
  const res = await api.post("/media/upload", formData);
  return res.data?.url || "";
};

export const getContentPage = (pageKey) => api.get(`/content/${pageKey}`);

export const updateContentPage = (pageKey, data) => api.put(`/content/${pageKey}`, data);

export const testEmailSettings = (data) => api.post("/settings/test-email", data);
export const testShiprocketConnection = (data) => api.post("/settings/test-shiprocket", data);


// export const getShippingSettings = () => api.get("/settings/shipping");

// export const updateShippingSettings = (data) =>
//   api.put("/settings/shipping", data);

const normalizeSettingsGroup = (res) => {
  const data = res.data?.data || res.data || {};
  const flat = {};
  Object.entries(data).forEach(([key, val]) => {
    flat[key] = val?.value !== undefined ? val.value : val;
  });
  return flat;
};
export const getShippingSettings = async () => {
  const res = await api.get("/settings/shipping");
  return normalizeSettingsGroup(res);
};
export const updateShippingSettings = (data) =>
  api.put("/settings/shipping", data);