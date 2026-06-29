import axios from "axios";

const API_BASE_URL=import.meta.env.VITE_API_URL|| "http://localhost:5000/api"
// const API_BASE_URL = import.meta.env.VITE_API_URL || "https://ecommers-admin-pannel.onrender.com/api";


const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
});

let isRefreshing = false;
let refreshSubscribers = [];

function subscribeTokenRefresh(cb) {
  refreshSubscribers.push(cb);
}

function onRefreshed(token) {
  refreshSubscribers.forEach((cb) => cb(token));
  refreshSubscribers = [];
}

export function clearAuthAndRedirect() {
  localStorage.removeItem("lm_admin_token");
  localStorage.removeItem("lm_admin_refresh_token");
  localStorage.removeItem("lm_admin_user");
  if (!window.location.pathname.includes("/login")) {
    window.location.href = "/login";
  }
}

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("lm_admin_token");
    if (token) config.headers.Authorization = `Bearer ${token}`;
    // Let axios set multipart boundary when uploading files
    if (config.data instanceof FormData) {
      delete config.headers["Content-Type"];
    }
    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => {
    const body = response.data;
    if (body && typeof body === "object" && "success" in body) {
      if (body.success === false) {
        const error = new Error(body.message || "API Error");
        error.response = response;
        throw error;
      }
      return body;
    }
    return body;
  },
  async (error) => {
    const originalRequest = error.config;
    const status = error.response?.status;

    if (status === 401 && originalRequest && !originalRequest._retry) {
      const url = originalRequest.url || "";
      if (url.includes("/auth/login") || url.includes("/auth/refresh-token")) {
        clearAuthAndRedirect();
        return Promise.reject(error);
      }

      originalRequest._retry = true;

      if (isRefreshing) {
        return new Promise((resolve) => {
          subscribeTokenRefresh((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            resolve(api(originalRequest));
          });
        });
      }

      isRefreshing = true;
      const storedRefresh = localStorage.getItem("lm_admin_refresh_token");

      if (!storedRefresh) {
        isRefreshing = false;
        clearAuthAndRedirect();
        return Promise.reject(error);
      }

      try {
        const refreshResponse = await axios.post(
          `${API_BASE_URL}/auth/refresh-token`,
          { refreshToken: storedRefresh },
          { headers: { "Content-Type": "application/json" } }
        );
        const body = refreshResponse.data;
        if (body?.success && body?.data?.token) {
          localStorage.setItem("lm_admin_token", body.data.token);
          if (body.data.refreshToken) {
            localStorage.setItem("lm_admin_refresh_token", body.data.refreshToken);
          }
          onRefreshed(body.data.token);
          isRefreshing = false;
          originalRequest.headers.Authorization = `Bearer ${body.data.token}`;
          return api(originalRequest);
        }
        throw new Error("Token refresh failed");
      } catch (refreshError) {
        isRefreshing = false;
        refreshSubscribers = [];
        clearAuthAndRedirect();
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

export default api;


// import axios from "axios";

// const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

// const api = axios.create({
//   baseURL: API_BASE_URL,
//   withCredentials: true,
//   headers: { "Content-Type": "application/json" },
// });

// let isRefreshing = false;
// let refreshSubscribers = [];

// function subscribeTokenRefresh(cb) {
//   refreshSubscribers.push(cb);
// }

// function onRefreshed(token) {
//   refreshSubscribers.forEach((cb) => cb(token));
//   refreshSubscribers = [];
// }

// export function clearAuthAndRedirect() {
//   localStorage.removeItem("lm_admin_token");
//   localStorage.removeItem("lm_admin_refresh_token");
//   localStorage.removeItem("lm_admin_user");
//   if (!window.location.pathname.includes("/login")) {
//     window.location.href = "/login";
//   }
// }

// api.interceptors.request.use(
//   (config) => {
//     const token = localStorage.getItem("lm_admin_token");
//     if (token) config.headers.Authorization = `Bearer ${token}`;
//     // Let axios set multipart boundary when uploading files
//     if (config.data instanceof FormData) {
//       delete config.headers["Content-Type"];
//     }
//     return config;
//   },
//   (error) => Promise.reject(error)
// );

// api.interceptors.response.use(
//   (response) => {
//     const body = response.data;
//     if (body && typeof body === "object" && "success" in body) {
//       if (body.success === false) {
//         const error = new Error(body.message || "API Error");
//         error.response = response;
//         throw error;
//       }
//       return body;
//     }
//     return body;
//   },
//   async (error) => {
//     const originalRequest = error.config;
//     const status = error.response?.status;

//     if (status === 401 && originalRequest && !originalRequest._retry) {
//       const url = originalRequest.url || "";
//       if (url.includes("/auth/login") || url.includes("/auth/refresh-token")) {
//         clearAuthAndRedirect();
//         return Promise.reject(error);
//       }

//       originalRequest._retry = true;

//       if (isRefreshing) {
//         return new Promise((resolve) => {
//           subscribeTokenRefresh((token) => {
//             originalRequest.headers.Authorization = `Bearer ${token}`;
//             resolve(api(originalRequest));
//           });
//         });
//       }

//       isRefreshing = true;
//       const storedRefresh = localStorage.getItem("lm_admin_refresh_token");

//       if (!storedRefresh) {
//         isRefreshing = false;
//         clearAuthAndRedirect();
//         return Promise.reject(error);
//       }

//       try {
//         const refreshResponse = await axios.post(
//           `${API_BASE_URL}/auth/refresh-token`,
//           { refreshToken: storedRefresh },
//           { headers: { "Content-Type": "application/json" } }
//         );
//         const body = refreshResponse.data;
//         if (body?.success && body?.data?.token) {
//           localStorage.setItem("lm_admin_token", body.data.token);
//           if (body.data.refreshToken) {
//             localStorage.setItem("lm_admin_refresh_token", body.data.refreshToken);
//           }
//           onRefreshed(body.data.token);
//           isRefreshing = false;
//           originalRequest.headers.Authorization = `Bearer ${body.data.token}`;
//           return api(originalRequest);
//         }
//         throw new Error("Token refresh failed");
//       } catch (refreshError) {
//         isRefreshing = false;
//         refreshSubscribers = [];
//         clearAuthAndRedirect();
//         return Promise.reject(refreshError);
//       }
//     }

//     return Promise.reject(error);
//   }
// );

// export default api;
