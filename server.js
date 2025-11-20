import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = __dirname;
const PORT = Number.parseInt(process.env.PORT ?? '4173', 10);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml'
};

const DEFAULT_FILE = 'index.html';

const server = createServer(async (req, res) => {
  try {
    const urlPath = new URL(req.url ?? '/', `http://${req.headers.host}`).pathname;
    const safePath = normalize(urlPath).replace(/^\/+/, '');

    if (safePath.includes('..')) {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Bad Request');
      return;
    }

    const targetPath = join(ROOT, safePath || DEFAULT_FILE);
    const ext = extname(targetPath) || '.html';

    const body = await readFile(targetPath);

    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] ?? 'application/octet-stream' });
    res.end(body);
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      try {
        const fallback = await readFile(join(ROOT, DEFAULT_FILE));
        res.writeHead(200, { 'Content-Type': MIME_TYPES['.html'] });
        res.end(fallback);
        return;
      } catch (fallbackError) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not Found');
        return;
      }
    }

    console.error('[server] unexpected error', error);
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Internal Server Error');
  }
});

server.listen(PORT, () => {
  console.log(`S&OP 웹앱이 http://localhost:${PORT} 에서 실행 중입니다.`);
});
