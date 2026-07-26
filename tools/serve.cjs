const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const MIME = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp'
};

function createStaticServer({ rootDir }) {
  const root = path.resolve(rootDir);
  return http.createServer((request, response) => {
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
    } catch {
      response.writeHead(400).end('Bad request');
      return;
    }

    if (pathname.includes('..')) {
      response.writeHead(403).end('Forbidden');
      return;
    }

    const relative = pathname.endsWith('/') ? `${pathname}index.html` : pathname;
    const filePath = path.resolve(root, relative.replace(/^\/+/, ''));
    if (filePath !== root && !filePath.startsWith(`${root}${path.sep}`)) {
      response.writeHead(403).end('Forbidden');
      return;
    }

    fs.stat(filePath, (statError, stat) => {
      if (statError || !stat.isFile()) {
        response.writeHead(404).end('Not found');
        return;
      }
      response.writeHead(200, {
        'Cache-Control': 'no-store',
        'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream'
      });
      fs.createReadStream(filePath).pipe(response);
    });
  });
}

module.exports = { createStaticServer };

if (require.main === module) {
  const port = Number(process.env.PORT || 4173);
  const server = createStaticServer({ rootDir: path.resolve(__dirname, '..') });
  server.listen(port, '127.0.0.1', () => {
    console.log(`Preview: http://127.0.0.1:${port}`);
  });
}
