import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Zero-dependency static server for the e2e harness. Serves the standalone
// harness page (e2e/fixtures/index.html) at `/` and everything else from the
// built dashboard bundle in dist/webcomponents/. One process, no framework —
// Playwright's webServer starts it after `npm run build:wc-dashboard`.
const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

const PORT = Number(process.env.E2E_PORT) || 4321;
const DIST_DIR = join(repoRoot, 'dist/webcomponents');
const FIXTURE = join(repoRoot, 'e2e/fixtures/index.html');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
};

function send(res, status, body, type) {
  res.writeHead(status, { 'Content-Type': type || 'text/plain' });
  res.end(body);
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    let pathname = decodeURIComponent(url.pathname);

    // Root serves the harness page.
    if (pathname === '/' || pathname === '') {
      const html = await readFile(FIXTURE);
      return send(res, 200, html, MIME['.html']);
    }

    // Everything else is served from the dist bundle dir, with a
    // path-traversal guard so requests cannot escape DIST_DIR.
    const safePath = normalize(pathname).replace(/^(\.\.[/\\])+/, '');
    const filePath = join(DIST_DIR, safePath);
    if (!filePath.startsWith(DIST_DIR)) {
      return send(res, 403, 'Forbidden');
    }

    const data = await readFile(filePath);
    const type = MIME[extname(filePath)] || 'application/octet-stream';
    return send(res, 200, data, type);
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      return send(res, 404, 'Not found');
    }
    return send(res, 500, String(err));
  }
});

server.listen(PORT, () => {
  console.log(`e2e static server on http://localhost:${PORT}`);
});
