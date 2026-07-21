import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import type { Config } from './config.js';
import { registerAuthRoutes, type AuthenticateFn } from './routes/auth.js';
import { registerVmRoutes } from './routes/vms.js';
import { registerMetaRoutes } from './routes/meta.js';
import type { VmService } from './vms/service.js';
import { AppError } from './errors.js';

export interface AppDeps {
  authenticate: (username: string, password: string) => ReturnType<AuthenticateFn>;
  vmService: VmService;
}

export function buildApp(cfg: Config, deps: AppDeps): FastifyInstance {
  const app = Fastify({ logger: false });
  app.register(cookie);

  app.setErrorHandler((err: Error, _req, reply) => {
    if (err instanceof AppError) return reply.code(err.status).send({ error: err.message, detail: err.detail });
    if ((err as { statusCode?: number }).statusCode === 400 || err.name === 'ZodError')
      return reply.code(400).send({ error: 'entrada inválida', detail: err.message });
    reply.code(500).send({ error: 'erro interno' });
  });

  // config pública (marca do topo personalizável em runtime via env APP_BRAND) — sem auth
  app.get('/api/config', async () => ({ brand: process.env.APP_BRAND || 'orquestrator4proxmox' }));

  app.register(async (instance) => { await registerAuthRoutes(instance, cfg, deps.authenticate); });
  app.register(async (instance) => { await registerVmRoutes(instance, cfg.jwtSecret, deps.vmService); });
  app.register(async (instance) => { await registerMetaRoutes(instance, cfg.jwtSecret, deps.vmService); });

  return app;
}
