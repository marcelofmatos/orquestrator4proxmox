import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fstatic from '@fastify/static';
import { loadConfig } from './config.js';
import { buildApp } from './app.js';
import { ProxmoxClient } from './proxmox/client.js';
import { VmService } from './vms/service.js';
import { authenticate as ldapAuthenticate, defaultDeps } from './auth/ldap.js';
import { registerConsoleRoutes } from './routes/console.js';

const cfg = loadConfig();
const px = new ProxmoxClient(cfg.proxmox);
const vmService = new VmService(px, { clientTag: cfg.proxmox.clientTag, hiddenTags: cfg.proxmox.hiddenTags }, cfg.proxmox.targetStorage);
const ldapDeps = defaultDeps(cfg.ldap);

const app = buildApp(cfg, {
  authenticate: (u, p) => ldapAuthenticate(ldapDeps, u, p),
  vmService,
});

// console websocket (fora do buildApp por precisar do plugin ws)
await registerConsoleRoutes(app, cfg, px, vmService);

// servir o frontend estático (dist do build)
const frontendDir = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../../frontend/dist');
app.register(fstatic, { root: frontendDir, wildcard: false });
app.setNotFoundHandler((req, reply) => {
  if (req.url.startsWith('/api')) return reply.code(404).send({ error: 'não encontrado' });
  return reply.sendFile('index.html', frontendDir);
});

app.listen({ host: '0.0.0.0', port: cfg.port })
  .then(() => console.log(`orquestrator4proxmox on :${cfg.port}`))
  .catch((e) => { console.error(e); process.exit(1); });
