import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { loadEnvFile } from 'node:process';
import assets from '../netlify/functions/assets.mjs';

try { loadEnvFile('.env'); } catch (error) { if (error.code !== 'ENOENT') throw error; }

const port = Number(process.env.PORT || 8080);
createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    if (url.pathname === '/.netlify/functions/assets') {
      const response = await assets(new Request(url, { method: req.method }));
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(await response.text());
      return;
    }
    if (url.pathname !== '/' && url.pathname !== '/index.html') {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(await readFile(new URL('../index.html', import.meta.url)));
  } catch {
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: '로컬 서버 요청을 처리하지 못했습니다.' }));
  }
}).listen(port, '127.0.0.1', () => console.log(`Local dashboard: http://localhost:${port}`));
