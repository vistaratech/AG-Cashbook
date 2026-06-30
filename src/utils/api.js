export async function apiFetch(path, options = {}) {
  const token = localStorage.getItem('cb_token');
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const res = await fetch(path, { ...options, headers });

  if (res.status === 401) {
    localStorage.removeItem('cb_token');
    window.location.href = '/login';
    throw new Error('Session expired');
  }

  return res;
}
