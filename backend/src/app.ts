import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import type { Config } from './config.js';
import { registerAuthRoutes, type AuthenticateFn } from './routes/auth.js';
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

  app.register(async (instance) => {
    await registerAuthRoutes(instance, cfg, deps.authenticate);
  });

  return app;
}
