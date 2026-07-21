import type { FastifyReply, FastifyRequest } from 'fastify';
import { verifySession, type Session } from './session.js';
import { AuthError } from '../errors.js';

export const SESSION_COOKIE = 'o4p_session';

declare module 'fastify' {
  interface FastifyRequest { session?: Session; }
}

export function makeAuthHook(secret: string) {
  return async function authHook(req: FastifyRequest, _reply: FastifyReply) {
    const token = req.cookies?.[SESSION_COOKIE];
    if (!token) throw new AuthError();
    try {
      req.session = verifySession(token, secret);
    } catch {
      throw new AuthError();
    }
  };
}
