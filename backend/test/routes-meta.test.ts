import { describe, it, expect, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { signSession } from '../src/auth/session.js';

const cookies = { o4p_session: signSession({ username: 'a', groups: [] }, 'seg', '1h') };
function cfg() {
  return { port: 8080,
    proxmox: { url: 'https://pve:8006', tokenId: 't', tokenSecret: 's', tlsInsecure: true, clientTag: 'cliente', hiddenTags: ['mgmt'], targetStorage: 'local-zfs' },
    ldap: { url: '', baseDn: '', bindDn: '', bindPassword: '', userBase: '', userAttr: 'uid', groupBase: '' },
    jwtSecret: 'seg', sessionTtl: '1h' };
}
function svc() {
  return {
    listVisible: vi.fn(), get: vi.fn(), lifecycle: vi.fn(), remove: vi.fn(), create: vi.fn(),
    listTemplates: vi.fn(async () => [{ vmid: 998, name: 'template-vm-v2' }]),
    meta: vi.fn(async () => ({ nodes: ['n1'], storages: ['local-zfs'] })),
    taskStatus: vi.fn(async () => ({ status: 'stopped', exitstatus: 'OK' })),
    dashboard: vi.fn(async () => ({ total: 2, running: 1, stopped: 1, allocatedVcpu: 6, allocatedMemMB: 12288 })),
  };
}

describe('rotas meta', () => {
  it('exige auth', async () => {
    const app = buildApp(cfg(), { authenticate: vi.fn() as any, vmService: svc() as any });
    const r = await app.inject({ method: 'GET', url: '/api/dashboard' });
    expect(r.statusCode).toBe(401);
    await app.close();
  });
  it('templates', async () => {
    const app = buildApp(cfg(), { authenticate: vi.fn() as any, vmService: svc() as any });
    const r = await app.inject({ method: 'GET', url: '/api/templates', cookies });
    expect(r.json()[0].vmid).toBe(998);
    await app.close();
  });
  it('dashboard', async () => {
    const app = buildApp(cfg(), { authenticate: vi.fn() as any, vmService: svc() as any });
    const r = await app.inject({ method: 'GET', url: '/api/dashboard', cookies });
    expect(r.json().total).toBe(2);
    await app.close();
  });
});
