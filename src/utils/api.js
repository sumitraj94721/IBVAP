/**
 * Centralized API, WebSocket, and media URL resolution for IBVAP.
 * Supports both unified same-origin deployment (Docker / local Vite proxy)
 * and split cross-origin deployment (Vercel frontend + Render/cloud backend).
 */

const rawApiUrl = (import.meta.env.VITE_API_URL || '').trim().replace(/\/+$/, '');
const rawWsUrl = (import.meta.env.VITE_WS_URL || '').trim().replace(/\/+$/, '');

export const API_BASE_URL = rawApiUrl;

const TOKEN_STORAGE_KEY = 'ibvap_token';

export function getAuthToken() {
  try {
    return sessionStorage.getItem(TOKEN_STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

export function setAuthToken(token) {
  try {
    if (token) {
      sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
    } else {
      sessionStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch {
    // Ignore storage quota or SSR errors
  }
}

export function clearAuthToken() {
  try {
    sessionStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    // Ignore
  }
}

function appendTokenQuery(url) {
  const token = getAuthToken();
  if (!token) return url;
  if (/[?&]token=/.test(url)) return url;
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}token=${encodeURIComponent(token)}`;
}

/**
 * Resolves a backend HTTP path (e.g. '/api/status', '/video_feed/CAM-01', '/static/snapshots/...')
 * against VITE_API_URL when configured.
 */
export function apiUrl(path = '') {
  if (!path) return API_BASE_URL;
  if (/^https?:\/\//i.test(path) || path.startsWith('data:') || path.startsWith('blob:')) {
    return path;
  }
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const fullUrl = API_BASE_URL ? `${API_BASE_URL}${normalizedPath}` : normalizedPath;

  // Attach token query param to MJPEG video feeds for cross-origin <img> compatibility
  if (normalizedPath.startsWith('/video_feed/')) {
    return appendTokenQuery(fullUrl);
  }
  return fullUrl;
}

/**
 * Resolves a backend WebSocket path (e.g. '/ws/stream') against VITE_WS_URL or VITE_API_URL.
 */
export function wsUrl(path = '/ws/stream') {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  let base = rawWsUrl;

  if (!base && API_BASE_URL) {
    base = API_BASE_URL.replace(/^http/i, 'ws');
  }

  if (!base && typeof window !== 'undefined') {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    base = `${protocol}//${window.location.host}`;
  }

  return appendTokenQuery(`${base}${normalizedPath}`);
}

/**
 * Wrapper around fetch() that resolves backend URLs, includes credentials,
 * and attaches the Bearer token header when present.
 */
export function apiFetch(path, options = {}) {
  const url = apiUrl(path);
  const headers = new Headers(options.headers || {});
  const token = getAuthToken();

  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  return fetch(url, {
    credentials: 'include',
    ...options,
    headers,
  });
}
