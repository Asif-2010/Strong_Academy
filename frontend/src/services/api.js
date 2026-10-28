import axios from "axios";
import { clearAuthentication } from "./auth";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000/api/",
  headers: {
    "Content-Type": "application/json",
  },
});

api.interceptors.request.use((config) => {
  if (config.data instanceof FormData) {
    config.headers.delete("Content-Type");
  }
  const requestPath = (config.url || "").replace(/^\/+/, "").split("?")[0];
  const access = localStorage.getItem("ssa_access");
  const publicAuthRequest = requestPath.startsWith("auth/") &&
    requestPath !== "auth/google/link/";
  if (publicAuthRequest) {
    delete config.headers.Authorization;
  } else if (access) {
    config.headers.Authorization = `Bearer ${access}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (requestError) => {
    const originalRequest = requestError.config;
    const path = (originalRequest?.url || "").replace(/^\/+/, "");
    if (
      requestError.response?.status !== 401 ||
      !originalRequest ||
      originalRequest._retry ||
      (path.startsWith("auth/") && path !== "auth/google/link/")
    ) {
      return Promise.reject(requestError);
    }

    const refresh = localStorage.getItem("ssa_refresh");
    if (!refresh) {
      clearAuthentication();
      if (window.location.pathname !== "/login") window.location.assign("/login");
      return Promise.reject(requestError);
    }

    originalRequest._retry = true;
    try {
      const response = await axios.post(
        `${api.defaults.baseURL}auth/token/refresh/`,
        { refresh },
        { headers: { "Content-Type": "application/json" } },
      );
      localStorage.setItem("ssa_access", response.data.access);
      originalRequest.headers.Authorization = `Bearer ${response.data.access}`;
      return api(originalRequest);
    } catch (refreshError) {
      clearAuthentication();
      if (window.location.pathname !== "/login") window.location.assign("/login");
      return Promise.reject(refreshError);
    }
  },
);

export default api;
