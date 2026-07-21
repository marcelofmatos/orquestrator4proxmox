import jwt from 'jsonwebtoken';

export interface Session { username: string; groups: string[]; }

export function signSession(s: Session, secret: string, ttl: string): string {
  return jwt.sign(s, secret, { expiresIn: ttl as jwt.SignOptions['expiresIn'] });
}
export function verifySession(token: string, secret: string): Session {
  const p = jwt.verify(token, secret) as jwt.JwtPayload;
  return { username: String(p.username), groups: (p.groups as string[]) ?? [] };
}
