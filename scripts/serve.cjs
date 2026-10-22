const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = process.cwd();
const types = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.json': 'application/json' };
http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (['/api/drive-archive', '/api/chrome-report'].includes(pathname)) {
    const limit = pathname === '/api/chrome-report' ? 4 * 1024 * 1024 : 2 * 1024 * 1024;
    const chunks = []; let size = 0;
    req.on('data', chunk => { size += chunk.length; if (size <= limit) chunks.push(chunk); });
    req.on('end', async () => {
      res.status = code => {res.statusCode = code; return res;};
      res.json = data => {res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(data));};
      if (size > limit) return res.status(413).json({error:'Solicitud demasiado grande.'});
      req.body = Buffer.concat(chunks).toString();
      await require('..' + pathname + '.js')(req, res);
    });
    return;
  }
  const file = path.resolve(root, '.' + decodeURIComponent(pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(root + path.sep) || file.includes(path.sep+'node_modules'+path.sep) || file.includes(path.sep+'.git'+path.sep) || path.basename(file).startsWith('.env')) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => { if (err) { res.writeHead(404); return res.end(); } res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream'); res.setHeader('Cache-Control', 'no-cache'); res.end(data); });
}).listen(Number(process.env.WASH_FIT_PORT || 8765), '127.0.0.1', () => console.log('http://127.0.0.1:' + (process.env.WASH_FIT_PORT || 8765)));
