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
    listDisks: vi.fn(async () => [{ key: 'scsi0', interface: 'scsi', sizeGB: 32, storage: 'local-zfs' }]),
    addDisk: vi.fn(async () => ({ key: 'scsi1', interface: 'scsi', sizeGB: 50, storage: 'local-zfs' })),
    resizeDisk: vi.fn(async () => undefined),
    storageStatus: vi.fn(async () => ({ storage: 'local-zfs', totalGB: 500, usedGB: 230, availGB: 270 })),
    diskStorageStatus: vi.fn(async () => ({ storage: 'local-zfs', totalGB: 500, usedGB: 230, availGB: 270 })),
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
  it('rejeita nome não-DNS (maiúscula, espaço ou hífen nas pontas) com 400', async () => {
    const svc = fakeVmService();
    const app = buildApp(cfg(), { authenticate: vi.fn() as any, vmService: svc as any });
    for (const name of ['ClienteX', 'cli ente', '-cliente', 'cliente-']) {
      const r = await app.inject({ method: 'POST', url: '/api/vms', cookies: authCookie(),
        payload: { templateId: 998, name, start: false } });
      expect(r.statusCode, `nome "${name}"`).toBe(400);
    }
    expect(svc.create).not.toHaveBeenCalled();
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

  it('lista discos da VM', async () => {
    const svc = fakeVmService();
    const app = buildApp(cfg(), { authenticate: vi.fn() as any, vmService: svc as any });
    const r = await app.inject({ method: 'GET', url: '/api/vms/101/disks', cookies: authCookie() });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual([{ key: 'scsi0', interface: 'scsi', sizeGB: 32, storage: 'local-zfs' }]);
    await app.close();
  });

  it('anexa disco novo', async () => {
    const svc = fakeVmService();
    const app = buildApp(cfg(), { authenticate: vi.fn() as any, vmService: svc as any });
    const r = await app.inject({ method: 'POST', url: '/api/vms/101/disks', cookies: authCookie(),
      payload: { sizeGB: 50 } });
    expect(r.statusCode).toBe(201);
    expect(svc.addDisk).toHaveBeenCalledWith(101, 50);
    await app.close();
  });

  it('rejeita tamanho inválido ao anexar disco com 400', async () => {
    const svc = fakeVmService();
    const app = buildApp(cfg(), { authenticate: vi.fn() as any, vmService: svc as any });
    const r = await app.inject({ method: 'POST', url: '/api/vms/101/disks', cookies: authCookie(),
      payload: { sizeGB: -5 } });
    expect(r.statusCode).toBe(400);
    expect(svc.addDisk).not.toHaveBeenCalled();
    await app.close();
  });

  it('redimensiona um disco', async () => {
    const svc = fakeVmService();
    const app = buildApp(cfg(), { authenticate: vi.fn() as any, vmService: svc as any });
    const r = await app.inject({ method: 'POST', url: '/api/vms/101/disks/scsi0/resize', cookies: authCookie(),
      payload: { sizeGB: 64 } });
    expect(r.statusCode).toBe(200);
    expect(svc.resizeDisk).toHaveBeenCalledWith(101, 'scsi0', 64);
    await app.close();
  });

  it('rejeita chave de disco inválida no resize com 400', async () => {
    const svc = fakeVmService();
    const app = buildApp(cfg(), { authenticate: vi.fn() as any, vmService: svc as any });
    const r = await app.inject({ method: 'POST', url: '/api/vms/101/disks/not-a-disk/resize', cookies: authCookie(),
      payload: { sizeGB: 64 } });
    expect(r.statusCode).toBe(400);
    expect(svc.resizeDisk).not.toHaveBeenCalled();
    await app.close();
  });

  it('retorna o status do storage-alvo da VM', async () => {
    const svc = fakeVmService();
    const app = buildApp(cfg(), { authenticate: vi.fn() as any, vmService: svc as any });
    const r = await app.inject({ method: 'GET', url: '/api/vms/101/storage', cookies: authCookie() });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ storage: 'local-zfs', totalGB: 500, usedGB: 230, availGB: 270 });
    await app.close();
  });

  it('retorna o status do storage de um disco específico', async () => {
    const svc = fakeVmService();
    const app = buildApp(cfg(), { authenticate: vi.fn() as any, vmService: svc as any });
    const r = await app.inject({ method: 'GET', url: '/api/vms/101/disks/scsi0/storage', cookies: authCookie() });
    expect(r.statusCode).toBe(200);
    expect(svc.diskStorageStatus).toHaveBeenCalledWith(101, 'scsi0');
    await app.close();
  });
});
