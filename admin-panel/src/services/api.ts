import axios from 'axios';

// Gateway adresi build sırasında VITE_API_URL ile değiştirilebilir
// (örn. VITE_API_URL=https://api.asistcell.com/api/v1)
export const API_BASE_URL =
  import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

// Socket.io gibi origin isteyen istemciler için (örn. http://localhost:8000)
export const API_ORIGIN = new URL(API_BASE_URL).origin;

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor: add auth token if available
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default api;
