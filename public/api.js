export async function api(path, { method = 'GET', body, signal } = {}) {
  const headers = { Accept: 'application/json' };
  const multipart = body instanceof FormData;
  if (method !== 'GET' && method !== 'HEAD' && path.startsWith('/admin/')) headers['X-Blog-Request'] = '1';
  if (body !== undefined && !multipart) headers['Content-Type'] = 'application/json';
  const response = await fetch('/api/v1' + path, {
    method, headers,
    body: body === undefined || multipart ? body : JSON.stringify(body),
    credentials: 'same-origin',
    cache: 'no-store',
    signal
  });
  const result = await response.json().catch(error => {
    if (signal?.aborted) throw error;
    return null;
  });
  if (!response.ok || result?.code !== '0000') {
    const message = result?.info || result?.detail || '接口返回异常（HTTP ' + response.status + '）';
    throw Object.assign(new Error(message), { status: response.status, code: result?.code });
  }
  return result.data;
}
