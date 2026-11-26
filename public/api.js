/** Read one of the site's same-origin JSON endpoints. */
export async function api(path, { signal } = {}) {
  const response = await fetch('/api/v1' + path, {
    headers: { Accept: 'application/json' },
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
