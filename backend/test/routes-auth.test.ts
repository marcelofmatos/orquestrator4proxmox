import { describe, it, expect, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import type { AuthedUser } from '../src/auth/ldap.js';

function testConfig() {
  return {
    port: 8080,
    proxmox: { url: 'https://pve:8006', tokenId: 't', tokenSecret: 's', tlsInsecure: true,
      clientTag: 'cliente', hiddenTags: ['mgmt', 'infra'], targetStorage: 'local-zfs' },
    ldap: { url: 'ldap://l:3890', baseDn: 'dc=a', bindDn: 'uid=admin', bindPassword: 'p',
      userBase: 'ou=people', userAttr: 'uid', groupBase: 'ou=groups', requiredGroup: undefined },
    jwtSecret: 'segredo', sessionTtl: '1h',
  };
}

describe('rotas de auth', () => {
  it('login OK seta cookie e /me devolve o usuário', async () => {
    const authFn = vi.fn(async (): Promise<AuthedUser> => ({ username: 'alice', dn: 'uid=alice', groups: ['ops'] }));
    const app = buildApp(testConfig(), { authenticate: authFn, vmService: {} as any });
    const login = await app.inject({ method: 'POST', url: '/api/auth/login',
      payload: { username: 'alice', password: 'x' } });
    expect(login.statusCode).toBe(200);
    const cookie = login.cookies.find((c) => c.name === 'o4p_session')!;
    expect(cookie).toBeTruthy();
    const me = await app.inject({ method: 'GET', url: '/api/auth/me',
      cookies: { o4p_session: cookie.value } });
    expect(me.statusCode).toBe(200);
    expect(me.json().username).toBe('alice');
    await app.close();
  });

  it('login com credencial inválida devolve 401', async () => {
    const { AuthError } = await import('../src/errors.js');
    const authFn = vi.fn(async () => { throw new AuthError(); });
    const app = buildApp(testConfig(), { authenticate: authFn, vmService: {} as any });
    const r = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'a', password: 'b' } });
    expect(r.statusCode).toBe(401);
    await app.close();
  });

  it('/me sem cookie devolve 401', async () => {
    const app = buildApp(testConfig(), { authenticate: vi.fn() as any, vmService: {} as any });
    const r = await app.inject({ method: 'GET', url: '/api/auth/me' });
    expect(r.statusCode).toBe(401);
    await app.close();
  });
});
