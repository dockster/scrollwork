// Serves the repository for the iOS lab on 127.0.0.1 (the Simulator reaches
// the Mac's localhost), and prints what the lab page reports to /log.
//   node tests/ios/serve.mjs   (PORT, default 8123)
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const root = new URL('../..', import.meta.url).pathname;
const port = Number(process.env.PORT || 8123);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css' };
createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/log') {
    let body = '';
    for await (const chunk of req) body += chunk;
    process.stdout.write(`[lab] ${body}\n`);
    return res.end('ok');
  }
  const path = normalize(join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname)));
  if (!path.startsWith(root)) return res.writeHead(403).end();
  try {
    const data = await readFile(path);
    res.writeHead(200, { 'content-type': types[extname(path)] || 'application/octet-stream', 'cache-control': 'no-store' }).end(data);
  } catch {
    res.writeHead(404).end();
  }
}).listen(port, '127.0.0.1', () => process.stdout.write(`lab on http://127.0.0.1:${port}/tests/ios/pin-lab.html\n`));
