import axios from 'axios';

export const TOKEN_KEY = 'prep-token';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 150000, // AI calls can take a while
});

// Attach JWT to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Expired / invalid session -> clear token and notify AuthContext
api.interceptors.response.use(
  (res) => res,
  (err) => {
    const url = err.config?.url || '';
    if (err.response?.status === 401 && !/\/auth\/(login|register)/.test(url)) {
      localStorage.removeItem(TOKEN_KEY);
      window.dispatchEvent(new Event('prep-ai:unauthorized'));
    }
    return Promise.reject(err);
  }
);

export const apiError = (err) =>
  err?.response?.data?.error ||
  (err?.code === 'ECONNABORTED' ? 'The request timed out. Please try again.' : null) ||
  (err?.message === 'Network Error' ? 'Cannot reach the server. Is the backend running?' : null) ||
  err?.message ||
  'Something went wrong';

export default api;
