// JS/api.js
export const API_BASE = 'http://localhost:3000';
const K_TOKEN = 'dt_token';
const K_USER  = 'dt_user';

export const getToken = () => localStorage.getItem(K_TOKEN);
export const getUser  = () => {
  try { return JSON.parse(localStorage.getItem(K_USER) || 'null'); }
  catch { return null; }
};

export async function apiFetch(path, { method='GET', body, headers={}, auth=false } = {}) {
  const opts = { method, headers: { ...headers } };
  if (body && !(body instanceof FormData)) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  } else if (body instanceof FormData) {
    opts.body = body;
  }
  if (auth && getToken()) {
    opts.headers['Authorization'] = `Bearer ${getToken()}`;
  }
  const res = await fetch(`${API_BASE}${path}`, opts);
  const isJson = res.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await res.json().catch(()=>null) : null;
  return { ok: res.ok, status: res.status, data };
}
