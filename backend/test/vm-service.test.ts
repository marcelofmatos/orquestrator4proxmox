import { describe, it, expect, vi } from 'vitest';
import { VmService } from '../src/vms/service.js';
import { NotFoundError, AppError } from '../src/errors.js';

const policy = { clientTag: 'cliente', hiddenTags: ['mgmt', 'infra'] };
const resources = [
  { vmid: 100, name: 'vpn', status: 'running', node: 'n1', tags: 'infra;mgmt', template: 0, type: 'qemu' },
  { vmid: 101, name: 'c1', status: 'running', node: 'n1', tags: 'cliente', template: 0, maxcpu: 4, maxmem: 8, type: 'qemu' },
  { vmid: 998, name: 't', status: 'stopped', node: 'n1', tags: 'template', template: 1, type: 'qemu' },
  { vmid: 997, name: 't-mgmt', status: 'stopped', node: 'n1', tags: 'template;mgmt', template: 1, type: 'qemu' },
];

function fakeClient(over: Partial<Record<string, any>> = {}) {
  return {
    get: vi.fn(async (path: string) => {
      if (path === '/cluster/resources?type=vm') return resources;
      if (path === '/cluster/resources?type=node') return [{ maxcpu: 80, maxmem: 68719476736 }];
      if (path === '/cluster/nextid') return '103';
      if (path.endsWith('/status/current')) return { status: 'running' };
      // config do template 998: carrega os planos (Notes) e o disco de dados (scsi2)
      if (path === '/nodes/n1/qemu/998/config') return {
        cores: 2, memory: '4096',
        scsi2: 'local-zfs:base-998-disk-2,size=80G',
        description: '# Template\n<!-- o4p-plans\npadrao=cores:4,memoryMB:8192,homeGB:80\nextendido=cores:8,memoryMB:16384,homeGB:180\n-->',
      };
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

function fakeClientWithConfig(config: Record<string, unknown>) {
  return fakeClient({
    get: vi.fn(async (path: string) => {
      if (path === '/cluster/resources?type=vm') return resources;
      if (path === '/nodes/n1/qemu/101/config') return config;
      return {};
    }),
  });
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
    expect(putArgs[1]).toMatchObject({ tags: 'cliente', cores: 2, sockets: 1, memory: 2048 });
  });
  it('aplica o plano extendido (cores/RAM do plano + resize do scsi2)', async () => {
    const client = fakeClient();
    const svc = new VmService(client as any, policy, 'local-zfs');
    await svc.create({ templateId: 998, name: 'grande', plan: 'extendido', start: false });
    const putCfg = client.put.mock.calls.find((c: any[]) => c[0] === '/nodes/n1/qemu/103/config');
    expect(putCfg[1]).toMatchObject({ tags: 'cliente', cores: 8, sockets: 1, memory: 16384 });
    expect(client.put).toHaveBeenCalledWith('/nodes/n1/qemu/103/resize',
      { disk: 'scsi2', size: '180G' });
  });
  it('plano padrão não redimensiona (homeGB = base do template)', async () => {
    const client = fakeClient();
    const svc = new VmService(client as any, policy, 'local-zfs');
    await svc.create({ templateId: 998, name: 'pequena', plan: 'padrao', start: false });
    const putCfg = client.put.mock.calls.find((c: any[]) => c[0] === '/nodes/n1/qemu/103/config');
    expect(putCfg[1]).toMatchObject({ cores: 4, memory: 8192 });
    expect(client.put.mock.calls.some((c: any[]) => c[0] === '/nodes/n1/qemu/103/resize')).toBe(false);
  });
  it('plano inexistente no template lança NotFound', async () => {
    const svc = new VmService(fakeClient() as any, policy, 'local-zfs');
    await expect(svc.create({ templateId: 998, name: 'x', plan: 'gigante', start: false }))
      .rejects.toBeInstanceOf(NotFoundError);
  });
  it('rejeita clonar de template com tag oculta', async () => {
    const svc = new VmService(fakeClient() as any, policy, 'local-zfs');
    await expect(svc.create({ templateId: 997, name: 'x', start: false })).rejects.toBeInstanceOf(NotFoundError);
  });
  it('rejeita clonar de um id que não é template', async () => {
    const svc = new VmService(fakeClient() as any, policy, 'local-zfs');
    await expect(svc.create({ templateId: 101, name: 'x', start: false })).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('VmService.listTemplates / meta / dashboard', () => {
  it('listTemplates retorna só templates', async () => {
    const svc = new VmService(fakeClient() as any, policy, 'local-zfs');
    expect((await svc.listTemplates()).map((t) => t.vmid)).toEqual([998]);
  });
  it('listTemplates esconde template com tag oculta (mgmt/infra)', async () => {
    const svc = new VmService(fakeClient() as any, policy, 'local-zfs');
    expect((await svc.listTemplates()).map((t) => t.vmid)).not.toContain(997);
  });
  it('listTemplates expõe os planos e NÃO vaza o bloco no description', async () => {
    const svc = new VmService(fakeClient() as any, policy, 'local-zfs');
    const t = (await svc.listTemplates()).find((x) => x.vmid === 998);
    expect(t?.plans).toEqual({
      padrao: { cores: 4, memoryMB: 8192, homeGB: 80 },
      extendido: { cores: 8, memoryMB: 16384, homeGB: 180 },
    });
    expect(t?.description).not.toContain('o4p-plans');
    expect(t?.description).toContain('# Template');
  });
  it('meta retorna nodes distintos e o storage alvo', async () => {
    const svc = new VmService(fakeClient() as any, policy, 'local-zfs');
    expect(await svc.meta()).toEqual({ nodes: ['n1'], storages: ['local-zfs'] });
  });
  it('dashboard conta só VMs cliente', async () => {
    const svc = new VmService(fakeClient() as any, policy, 'local-zfs');
    const d = await svc.dashboard();
    expect(d.total).toBe(1);
    expect(d.running).toBe(1);
    expect(d.stopped).toBe(0);
    expect(d.allocatedVcpu).toBe(4);
    expect(d.totalVcpu).toBe(80);
    expect(d.totalMemMB).toBe(65536);
  });
});

describe('VmService.taskStatus guard', () => {
  it('consulta tarefa de VM cliente (vmid do UPID visível)', async () => {
    const client = fakeClient();
    const svc = new VmService(client as any, policy, 'local-zfs');
    await svc.taskStatus('UPID:n1:0000:0000:0000:qmstart:101:root@pam:');
    expect(client.get).toHaveBeenCalledWith(expect.stringContaining('/nodes/n1/tasks/'));
  });
  it('recusa tarefa cujo vmid do UPID é VM de gestão', async () => {
    const svc = new VmService(fakeClient() as any, policy, 'local-zfs');
    await expect(svc.taskStatus('UPID:n1:0000:0000:0000:qmstart:100:root@pam:'))
      .rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('VmService disks', () => {
  const config = {
    scsi0: 'local-zfs:vm-101-disk-0,size=32G',
    scsi2: 'local-zfs:vm-101-disk-2,size=180G',
    ide2: 'none,media=cdrom',
  };

  it('listDisks lista os discos reais e ignora o cdrom', async () => {
    const client = fakeClientWithConfig(config);
    const svc = new VmService(client as any, policy, 'local-zfs');
    const disks = await svc.listDisks(101);
    expect(disks).toEqual([
      { key: 'scsi0', interface: 'scsi', sizeGB: 32, storage: 'local-zfs' },
      { key: 'scsi2', interface: 'scsi', sizeGB: 180, storage: 'local-zfs' },
    ]);
  });

  it('listDisks numa VM de gestão lança NotFound', async () => {
    const client = fakeClientWithConfig(config);
    const svc = new VmService(client as any, policy, 'local-zfs');
    await expect(svc.listDisks(100)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('resizeDisk cresce o disco chamando o resize do Proxmox', async () => {
    const client = fakeClientWithConfig(config);
    const svc = new VmService(client as any, policy, 'local-zfs');
    await svc.resizeDisk(101, 'scsi0', 64);
    expect(client.put).toHaveBeenCalledWith('/nodes/n1/qemu/101/resize', { disk: 'scsi0', size: '64G' });
  });

  it('resizeDisk rejeita encolher sem chamar o Proxmox', async () => {
    const client = fakeClientWithConfig(config);
    const svc = new VmService(client as any, policy, 'local-zfs');
    await expect(svc.resizeDisk(101, 'scsi0', 32)).rejects.toBeInstanceOf(AppError);
    expect(client.put).not.toHaveBeenCalled();
  });

  it('resizeDisk num disco inexistente lança NotFound', async () => {
    const client = fakeClientWithConfig(config);
    const svc = new VmService(client as any, policy, 'local-zfs');
    await expect(svc.resizeDisk(101, 'scsi5', 64)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('addDisk anexa no primeiro slot scsiN livre', async () => {
    const client = fakeClientWithConfig(config);
    const svc = new VmService(client as any, policy, 'local-zfs');
    const disk = await svc.addDisk(101, 50);
    expect(disk).toEqual({ key: 'scsi1', interface: 'scsi', sizeGB: 50, storage: 'local-zfs' });
    expect(client.put).toHaveBeenCalledWith('/nodes/n1/qemu/101/config', { scsi1: 'local-zfs:50' });
  });
});
