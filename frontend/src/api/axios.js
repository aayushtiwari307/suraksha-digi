import axios from 'axios';

const API = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api'
});

// Add token to every request automatically
API.interceptors.request.use((config) => {
  const token = localStorage.getItem('familyToken') || localStorage.getItem('elderToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default API;