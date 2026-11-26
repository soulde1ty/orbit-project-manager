export async function api(path, options = {}) {
  let response;
  try {
    response = await fetch(`/api${path}`, {
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      ...options,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw Object.assign(new Error('networkError'), { code: 'networkError' });
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok)
    throw Object.assign(new Error(body.error || 'error'), {
      status: response.status,
      code: body.error || 'error',
      details: body,
    });
  return body;
}
