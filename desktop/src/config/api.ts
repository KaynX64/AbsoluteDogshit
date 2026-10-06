import appConfig from '../../app-config.json';

const rawBase = appConfig.apiBaseUrl || 'https://localhost:5000';

export const API_BASE_URL = rawBase.replace(/\/+$/, '');
export const SOCKET_URL = API_BASE_URL;