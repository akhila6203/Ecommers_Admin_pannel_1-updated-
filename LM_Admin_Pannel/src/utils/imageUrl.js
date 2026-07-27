const API_BASE = import.meta.env.VITE_API_URL
  ? import.meta.env.VITE_API_URL.replace(/\/api\/?$/, "")
   : (import.meta.env.VITE_API_BASE_URL || "https://api.lmshowroom.com/api").replace(/\/api\/?$/, "");;
  // : (import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api").replace(/\/api\/?$/, "");;

const PLACEHOLDER = "https://placehold.co/600x400/png?text=No+Image";

/**
 * Resolve a stored upload path to a full URL for display.
 * Handles legacy bare filenames (e.g. placeholder.svg from seeds).
 */
export function resolveUploadUrl(path, folder = "banners") {
  if (!path) return PLACEHOLDER;
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  const cleaned = path.replace(/^\/+/, "");
  if (cleaned.startsWith("uploads/")) return `${API_BASE}/${cleaned}`;
  return `${API_BASE}/uploads/${folder}/${cleaned}`;
}

export { API_BASE, PLACEHOLDER };



// const API_BASE = import.meta.env.VITE_API_URL
//   ? import.meta.env.VITE_API_URL.replace(/\/api\/?$/, "")
//   : "http://localhost:5000";

// const PLACEHOLDER = "https://placehold.co/600x400/png?text=No+Image";

// /**
//  * Resolve a stored upload path to a full URL for display.
//  * Handles legacy bare filenames (e.g. placeholder.svg from seeds).
//  */
// export function resolveUploadUrl(path, folder = "banners") {
//   if (!path) return PLACEHOLDER;
//   if (path.startsWith("http://") || path.startsWith("https://")) return path;
//   const cleaned = path.replace(/^\/+/, "");
//   if (cleaned.startsWith("uploads/")) return `${API_BASE}/${cleaned}`;
//   return `${API_BASE}/uploads/${folder}/${cleaned}`;
// }

// export { API_BASE, PLACEHOLDER };
