/**
 * Lightweight wrapper around fetch() that includes credentials + Bearer fallback.
 * Use across the app for any authenticated API call.
 */
const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

export const apiFetch = async (path, options = {}) => {
  const token = sessionStorage.getItem('session_token');
  const headers = {
    ...(options.headers || {}),
    ...(options.body && !(options.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  const res = await fetch(`${BACKEND_URL}${path}`, {
    ...options,
    headers,
    credentials: 'include',
  });
  return res;
};

export const apiJSON = async (path, options = {}) => {
  const res = await apiFetch(path, options);
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
};
