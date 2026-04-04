// Store the role/token in localStorage so it survives page refreshes
// and works reliably on all hosting platforms without cookie issues.

const TOKEN_KEY = 'et_alsawan_role';

export function getStoredRole() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setStoredRole(role) {
  if (role) {
    localStorage.setItem(TOKEN_KEY, role);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

export async function api(path, options = {}) {
  const token = getStoredRole();

  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {})
  };

  const res = await fetch(path, {
    ...options,
    headers
  });

  // Read raw text first to avoid "Unexpected end of JSON input"
  const text = await res.text();

  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch (e) {
      if (!res.ok) throw new Error(`Server error (${res.status})`);
      throw new Error('Invalid response from server');
    }
  }

  if (!res.ok) {
    const msg = (data && data.error) ? data.error : `Request failed (${res.status})`;
    throw new Error(msg);
  }

  return data;
}
