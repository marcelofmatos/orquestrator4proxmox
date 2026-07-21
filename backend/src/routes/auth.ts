import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Config } from '../config.js';
import type { AuthedUser } from '../auth/ldap.js';
import { signSession } from '../auth/session.js';
import { SESSION_COOKIE, makeAuthHook } from '../auth/middleware.js';

export type AuthenticateFn = (username: string, password: string) => Promise<AuthedUser>;

const loginBody = z.object({ username: z.string().min(1), password: z.string().min(1) });

export async function registerAuthRoutes(app: FastifyInstance, cfg: Config, authenticate: AuthenticateFn) {
  const authHook = makeAuthHook(cfg.jwtSecret);

  app.post('/api/auth/login', async (req, reply) => {
    const { username, password } = loginBody.parse(req.body);
    const user = await authenticate(username, password);
    const token = signSession({ username: user.username, groups: user.groups }, cfg.jwtSecret, cfg.sessionTtl);
    reply.setCookie(SESSION_COOKIE, token, { httpOnly: true, sameSite: 'lax', path: '/', secure: false });
    return { username: user.username, groups: user.groups };
  });

  app.post('/api/auth/logout', async (_req, reply) => {
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  });

  app.get('/api/auth/me', { preHandler: authHook }, async (req) => {
    return req.session;
  });
}
