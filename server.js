const http = require('http');
const fs   = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;

const mime = {
  '.html': 'text/html',
  '.css':  'text/css',
  '.js':   'application/javascript',
  '.json': 'application/json',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico':  'image/x-icon',
  '.svg':  'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
};

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // Contract config API
  if (req.url === '/api/config') {
    const cfgPath = path.join(__dirname, 'contract-config.json');
    if (fs.existsSync(cfgPath)) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(fs.readFileSync(cfgPath, 'utf8'));
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Contract not deployed. Run: node deploy.js' }));
    }
    return;
  }

  // Static files
  const filePath = path.join(__dirname, req.url === '/' ? 'index.html' : req.url);
  const ext      = path.extname(filePath).toLowerCase();
  const type     = mime[ext] || 'text/plain';

  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': type });
    res.end(data);
  });
});

// Handle port already in use — try next port automatically
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    const next = Number(PORT) + 1;
    console.log(`\n  Port ${PORT} is busy. Trying port ${next}...`);
    server.listen(next, () => {
      console.log(`\n  Server   ->  http://localhost:${next}`);
      console.log(`  Config   ->  http://localhost:${next}/api/config`);
      console.log(`  MediVault -> http://localhost:${next}/medivault/dashboard.html`);
      console.log('\n  Press Ctrl+C to stop.\n');
    });
  } else {
    console.error('Server error:', err.message);
    process.exit(1);
  }
});

server.listen(PORT, () => {
  console.log(`\n  Server   ->  http://localhost:${PORT}`);
  console.log(`  Config   ->  http://localhost:${PORT}/api/config`);
  console.log(`  MediVault -> http://localhost:${PORT}/medivault/dashboard.html`);
  console.log('\n  Press Ctrl+C to stop.\n');
});
