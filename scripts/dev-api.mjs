import { createServer } from 'node:http';
import { readdir } from 'node:fs/promises';
import { basename, extname, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { pathToFileURL } from 'node:url';
import { loadEnv } from 'vite';

const rootDir = process.cwd();
const apiDir = resolve(rootDir, 'api');
const env = loadEnv(process.env.NODE_ENV || 'development', rootDir, '');

for (const [key, value] of Object.entries(env)) {
  if (process.env[key] == null) {
    process.env[key] = value;
  }
}

const port = Number(process.env.API_PORT || 3000);

const routeEntries = await readdir(apiDir, { withFileTypes: true });
const routes = new Map(
  routeEntries
    .filter((entry) => entry.isFile() && extname(entry.name) === '.js' && !entry.name.startsWith('_'))
    .map((entry) => [`/api/${basename(entry.name, '.js')}`, resolve(apiDir, entry.name)]),
);

const sendJson = (response, status, payload) => {
  response.writeHead(status, {
    'Content-Type': 'application/json',
  });
  response.end(JSON.stringify(payload));
};

const server = createServer(async (req, res) => {
  try {
    const host = req.headers.host || `localhost:${port}`;
    const requestUrl = new URL(req.url || '/', `http://${host}`);
    const handlerPath = routes.get(requestUrl.pathname);

    if (!handlerPath) {
      sendJson(res, 404, {
        error: `No existe ${requestUrl.pathname} en el runtime local.`,
      });
      return;
    }

    const moduleUrl = `${pathToFileURL(handlerPath).href}?t=${Date.now()}`;
    const routeModule = await import(moduleUrl);
    const handler = routeModule.default;

    if (typeof handler !== 'function') {
      throw new Error(`La ruta ${requestUrl.pathname} no exporta un handler por defecto.`);
    }

    const method = req.method || 'GET';
    const body = ['GET', 'HEAD'].includes(method) ? undefined : Readable.toWeb(req);
    const request = new Request(requestUrl, {
      method,
      headers: req.headers,
      body,
      duplex: body ? 'half' : undefined,
    });

    const response = await handler(request);

    if (!(response instanceof Response)) {
      throw new Error(`La ruta ${requestUrl.pathname} no devolvio una Response valida.`);
    }

    response.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });
    res.writeHead(response.status);

    if (!response.body) {
      res.end();
      return;
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    res.end(buffer);
  } catch (error) {
    console.error('[dev-api]', error);
    sendJson(res, 500, {
      error: error.message || 'No se pudo ejecutar la API local.',
    });
  }
});

server.listen(port, () => {
  console.log(`[dev-api] escuchando en http://localhost:${port}`);
  console.log(`[dev-api] rutas: ${Array.from(routes.keys()).sort().join(', ')}`);
});
