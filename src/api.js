export async function api(path, options = {}) {
  const res = await fetch(path, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    },
    ...options
  });

  // Read the raw text first so we never hit "Unexpected end of JSON input"
  const text = await res.text();

  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch (e) {
      // Server returned non-JSON (e.g. HTML error page)
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
