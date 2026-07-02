/**
 * Normalize stored image paths for API responses.
 * Legacy seed data may store bare filenames without uploads/ prefix.
 */
function normalizeUploadPath(path, folder = "banners") {
  if (!path) return path;
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  const cleaned = path.replace(/^\/+/, "");
  if (cleaned.startsWith("uploads/")) return cleaned;
  return `uploads/${folder}/${cleaned}`;
}

function normalizeBannerImage(banner) {
  if (!banner) return banner;
  return { ...banner, image: normalizeUploadPath(banner.image, "banners") };
}

module.exports.normalizeUploadPath = normalizeUploadPath;
module.exports.normalizeBannerImage = normalizeBannerImage;
