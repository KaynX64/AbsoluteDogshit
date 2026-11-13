const appConfig = require('../app-config.json');

const API_BASE_URL = (appConfig.apiBaseUrl || 'https://localhost:5000').replace(/\/+$/, '');
const VITE_URL = 'https://127.0.0.1:5173';

module.exports = { API_BASE_URL, VITE_URL };
