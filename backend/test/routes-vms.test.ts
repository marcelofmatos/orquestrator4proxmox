import { describe, it, expect, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { signSession } from '../src/auth/session.js';
import { NotFoundError } from '../src/errors.js';

function cfg() {
  return {
    port: 8080,
    proxmox: { url: 'https://pve:8006', tokenId: 't', tokenSecret: 's', tlsInsecure: true,
      clientTag: 'cliente', hiddenTags: ['mgmt', 'infra'], targetStorage: 'local-zfs' },
    ldap: { url: '', baseDn: '', bindDn: '', bindPassword: '', userBase: 'ou=people', userAttr: 'uid', groupBase: 'ou=groups' },
    jwtSecret: 'seg', sessionTtl: '1h',
  };
}
function authCookie() {
  return { o4p_session: signSession({ username: 'alice', groups: [] }, 'seg', '1h') };
}
function fakeVmService() {
  return {
    listVisible: vi.fn(async () => [{ vmid: 101, name: 'c1', status: 'running', node: 'n1', tags: 'cliente' }]),
    get: vi.fn(async (id: number) => { if (id === 100) throw new NotFoundError(); return { vmid: id }; }),
    lifecycle: vi.fn(async () => 'UPID'),
    remove: vi.fn(async () => 'UPID'),
    create: vi.fn(async () => ({ vmid: 103, node: 'n1' })),
  };
}

describe('rotas de VM', () => {
  it('exige auth', async () => {
    const app = buildApp(cfg(), { authenticate: vi.fn() as any, vmService: fakeVmService() as any });
    const r = await app.inject({ method: 'GET', url: '/api/vms' });
    expect(r.statusCode).toBe(401);
    await app.close();
  });
  it('lista VMs cliente', async () => {
    const app = buildApp(cfg(), { authenticate: vi.fn() as any, vmService: fakeVmService() as any });
    const r = await app.inject({ method: 'GET', url: '/api/vms', cookies: authCookie() });
    expect(r.statusCode).toBe(200);
    expect(r.json()[0].vmid).toBe(101);
    await app.close();
  });
  it('GET de VM de gestão devolve 404', async () => {
    const app = buildApp(cfg(), { authenticate: vi.fn() as any, vmService: fakeVmService() as any });
    const r = await app.inject({ method: 'GET', url: '/api/vms/100', cookies: authCookie() });
    expect(r.statusCode).toBe(404);
    await app.close();
  });
  it('start chama lifecycle', async () => {
    const svc = fakeVmService();
    const app = buildApp(cfg(), { authenticate: vi.fn() as any, vmService: svc as any });
    const r = await app.inject({ method: 'POST', url: '/api/vms/101/start', cookies: authCookie() });
    expect(r.statusCode).toBe(200);
    expect(svc.lifecycle).toHaveBeenCalledWith(101, 'start');
    await app.close();
  });
  it('cria VM', async () => {
    const svc = fakeVmService();
    const app = buildApp(cfg(), { authenticate: vi.fn() as any, vmService: svc as any });
    const r = await app.inject({ method: 'POST', url: '/api/vms', cookies: authCookie(),
      payload: { templateId: 998, name: 'novo', start: false } });
    expect(r.statusCode).toBe(201);
    expect(r.json().vmid).toBe(103);
    await app.close();
  });
  it('rejeita IP estático malicioso (injeção em ipconfig0) com 400', async () => {
    const svc = fakeVmService();
    const app = buildApp(cfg(), { authenticate: vi.fn() as any, vmService: svc as any });
    const r = await app.inject({ method: 'POST', url: '/api/vms', cookies: authCookie(),
      payload: { templateId: 998, name: 'novo', start: false,
        net: { mode: 'static', ip: '1.2.3.4/24,gw=9.9.9.9,foo=bar' } } });
    expect(r.statusCode).toBe(400);
    expect(svc.create).not.toHaveBeenCalled();
    await app.close();
  });
});
