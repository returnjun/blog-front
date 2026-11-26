import http from 'node:http';
import path from 'node:path';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { pipeline } from 'node:stream';
import { fileURLToPath } from 'node:url';

const frontendDir = fileURLToPath(new URL('./public/', import.meta.url));
const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || 5173);
const backend = new URL(process.env.BACKEND_ORIGIN || 'http://127.0.0.1:8091');
if (backend.protocol !== 'http:' || backend.pathname !== '/' || backend.search || backend.hash || backend.username || backend.password) {
  throw new Error('BACKEND_ORIGIN 应为 HTTP 服务地址，例如 http://127.0.0.1:8091');
}

const types = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.ico': 'image/x-icon',
  '.avif': 'image/avif', '.woff2': 'font/woff2', '.woff': 'font/woff'
};
const publicPage = /^\/(?:articles(?:\/[^/]+)?|projects(?:\/[^/]+)?|tools|catalog\/tools\/[^/]+|about)?\/?$/;
const backendPrefix = /^\/(?:api|media|admin)(?:\/|$)/;

function fail(res, status, detail) {
  if (res.destroyed) return;
  if (res.headersSent) return res.destroy();
  res.writeHead(status, { 'Content-Type': 'application/problem+json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify({ status, detail }));
}

function endToEndHeaders(headers) {
  const clean = { ...headers };
  const connectionFields = (headers.connection || '').toLowerCase().split(',').map(name => name.trim());
  for (const name of ['connection', 'keep-alive', 'proxy-connection', 'proxy-authenticate',
    'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade', ...connectionFields]) {
    delete clean[name];
  }
  return clean;
}

function proxy(req, res) {
  // Connect to the backend while retaining the browser's Host, Origin and HttpOnly session cookie.
  const headers = endToEndHeaders(req.headers);
  for (const name of Object.keys(headers)) {
    if (name === 'forwarded' || name.startsWith('x-forwarded-')) delete headers[name];
  }
  const upstream = http.request(backend, { method: req.method, path: req.url, headers }, incoming => {
    res.writeHead(incoming.statusCode, endToEndHeaders(incoming.headers));
    pipeline(incoming, res, () => {});
  });
  upstream.setTimeout(30000, () => upstream.destroy(new Error('后端响应超时')));
  upstream.on('error', () => fail(res, 502, '暂时连不上博客服务，请稍后重试。'));
  res.on('close', () => upstream.destroy());
  req.on('error', () => upstream.destroy());
  req.pipe(upstream);
}

async function serve(req, res) {
  if (!req.url.startsWith('/') || req.url.startsWith('//')) return fail(res, 400, '请求路径无效');
  let pathname;
  try {
    pathname = decodeURIComponent(req.url.split('?')[0]);
  } catch {
    return fail(res, 400, '请求路径编码无效');
  }
  if (/[\\:\x00-\x1f]/.test(pathname) || pathname.split('/').some(part => part.startsWith('.'))) {
    return fail(res, 400, '请求路径无效');
  }
  if (backendPrefix.test(pathname)) return proxy(req, res);
  const page = publicPage.test(pathname);
  if (!['GET', 'HEAD'].includes(req.method)) {
    if (!page) return proxy(req, res);
    res.setHeader('Allow', 'GET, HEAD');
    return fail(res, 405, '页面只支持读取');
  }
  const file = path.join(frontendDir, page ? 'index.html' : pathname);
  let info;
  try {
    info = await stat(file);
  } catch (error) {
    if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error;
  }
  if (!info?.isFile()) {
    if (page) return fail(res, 500, '缺少博客页面文件 public/index.html');
    // A catalog entry can launch a separate same-origin tool hosted by Spring.
    return proxy(req, res);
  }
  res.writeHead(200, {
    'Content-Type': types[path.extname(file).toLowerCase()] || 'application/octet-stream',
    'Content-Length': info.size,
    'Cache-Control': 'no-cache',
    'X-Content-Type-Options': 'nosniff'
  });
  if (req.method === 'HEAD') return res.end();
  pipeline(createReadStream(file), res, () => {});
}

const server = http.createServer((req, res) => {
  serve(req, res).catch(() => fail(res, 500, '页面读取失败'));
});
server.on('error', error => {
  console.error('前端未能启动：' + error.message);
  process.exitCode = 1;
});
server.listen(port, host, () => {
  console.log('博客前端 http://' + host + ':' + server.address().port + '/');
  console.log('后端服务 ' + backend.origin);
});
