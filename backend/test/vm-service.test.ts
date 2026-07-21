import { describe, it, expect, vi } from 'vitest';
import { VmService } from '../src/vms/service.js';
import { NotFoundError } from '../src/errors.js';

const policy = { clientTag: 'cliente', hiddenTags: ['mgmt', 'infra'] };
const resources = [
  { vmid: 100, name: 'vpn', status: 'running', node: 'n1', tags: 'infra;mgmt', template: 0, type: 'qemu' },
  { vmid: 101, name: 'c1', status: 'running', node: 'n1', tags: 'cliente', template: 0, maxcpu: 4, maxmem: 8, type: 'qemu' },
  { vmid: 998, name: 't', status: 'stopped', node: 'n1', tags: 'template', template: 1, type: 'qemu' },
];

function fakeClient(over: Partial<Record<string, any>> = {}) {
  return {
    get: vi.fn(async (path: string) => {
      if (path === '/cluster/resources?type=vm') return resources;
      if (path === '/cluster/nextid') return '103';
      if (path.endsWith('/status/current')) return { status: 'running' };
      if (path.endsWith('/config')) return { cores: 2, memory: '4096' };
      if (path.includes('/tasks/')) return { status: 'stopped', exitstatus: 'OK' };
      return {};
    }),
    post: vi.fn(async () => 'UPID:n1:xxxx'),
    put: vi.fn(async () => ({})),
    del: vi.fn(async () => 'UPID:n1:del'),
    ...over,
  };
}

describe('VmService.listVisible', () => {
  it('lista só VMs cliente', async () => {
    const svc = new VmService(fakeClient() as any, policy, 'local-zfs');
    const vms = await svc.listVisible();
    expect(vms.map((v) => v.vmid)).toEqual([101]);
  });
});

describe('VmService guard', () => {
  it('lifecycle numa VM de gestão lança NotFound', async () => {
    const svc = new VmService(fakeClient() as any, policy, 'local-zfs');
    await expect(svc.lifecycle(100, 'start')).rejects.toBeInstanceOf(NotFoundError);
  });
  it('lifecycle numa VM cliente chama status/start', async () => {
    const client = fakeClient();
    const svc = new VmService(client as any, policy, 'local-zfs');
    await svc.lifecycle(101, 'start');
    expect(client.post).toHaveBeenCalledWith('/nodes/n1/qemu/101/status/start');
  });
  it('remove numa VM de gestão lança NotFound', async () => {
    const svc = new VmService(fakeClient() as any, policy, 'local-zfs');
    await expect(svc.remove(100)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('VmService.create', () => {
  it('clona, aplica tag cliente e configura', async () => {
    const client = fakeClient();
    const svc = new VmService(client as any, policy, 'local-zfs');
    const r = await svc.create({ templateId: 998, name: 'novo', cores: 2, memoryMB: 2048, start: false });
    expect(r.vmid).toBe(103);
    expect(client.post).toHaveBeenCalledWith('/nodes/n1/qemu/998/clone',
      expect.objectContaining({ newid: 103, name: 'novo', full: 1, storage: 'local-zfs' }));
    const putArgs = client.put.mock.calls.find((c: any[]) => c[0] === '/nodes/n1/qemu/103/config');
    expect(putArgs[1]).toMatchObject({ tags: 'cliente', cores: 2, memory: 2048 });
  });
  it('rejeita clonar de um id que não é template', async () => {
    const svc = new VmService(fakeClient() as any, policy, 'local-zfs');
    await expect(svc.create({ templateId: 101, name: 'x', start: false })).rejects.toBeInstanceOf(NotFoundError);
  });
});
