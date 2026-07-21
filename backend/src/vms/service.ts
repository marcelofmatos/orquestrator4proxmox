import type { ProxmoxClient } from '../proxmox/client.js';
import type { ClusterVm, TaskStatus } from '../proxmox/types.js';
import { NotFoundError, ProxmoxError } from '../errors.js';
import { filterVisible, isClientVisible, type TagPolicy } from './visibility.js';

export interface CreateVmInput {
  templateId: number; name: string; cores?: number; memoryMB?: number; diskGB?: number;
  net?: { mode: 'dhcp' } | { mode: 'static'; ip: string; gateway?: string };
  ciuser?: string; cipassword?: string; sshkey?: string; start?: boolean;
}

export class VmService {
  constructor(
    private readonly px: ProxmoxClient,
    private readonly policy: TagPolicy,
    private readonly targetStorage: string,
  ) {}

  private resources(): Promise<ClusterVm[]> {
    return this.px.get<ClusterVm[]>('/cluster/resources?type=vm');
  }

  async listVisible(): Promise<ClusterVm[]> {
    return filterVisible(await this.resources(), this.policy);
  }

  /** Localiza uma VM cliente operável; 404 se não visível (fronteira). */
  private async findVisible(vmid: number): Promise<ClusterVm> {
    const vm = (await this.resources()).find((v) => v.vmid === vmid);
    if (!vm || !isClientVisible(vm, this.policy)) throw new NotFoundError('VM não encontrada');
    return vm;
  }

  async get(vmid: number) {
    const vm = await this.findVisible(vmid);
    const [config, status] = await Promise.all([
      this.px.get<Record<string, unknown>>(`/nodes/${vm.node}/qemu/${vmid}/config`),
      this.px.get<Record<string, unknown>>(`/nodes/${vm.node}/qemu/${vmid}/status/current`),
    ]);
    return { ...vm, config, status };
  }

  async lifecycle(vmid: number, action: 'start' | 'stop' | 'shutdown' | 'reboot') {
    const vm = await this.findVisible(vmid);
    return this.px.post<string>(`/nodes/${vm.node}/qemu/${vmid}/status/${action}`);
  }

  async remove(vmid: number) {
    const vm = await this.findVisible(vmid);
    if (vm.status === 'running') await this.px.post(`/nodes/${vm.node}/qemu/${vmid}/status/stop`);
    return this.px.del<string>(`/nodes/${vm.node}/qemu/${vmid}`);
  }

  private async waitTask(node: string, upid: string, timeoutMs = 120_000) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const t = await this.px.get<TaskStatus>(`/nodes/${node}/tasks/${encodeURIComponent(upid)}/status`);
      if (t.status === 'stopped') {
        if (t.exitstatus && t.exitstatus !== 'OK') throw new ProxmoxError('tarefa falhou', t.exitstatus);
        return;
      }
      if (Date.now() > deadline) throw new ProxmoxError('timeout da tarefa', upid);
      await new Promise((r) => setTimeout(r, 1500));
    }
  }

  async create(input: CreateVmInput): Promise<{ vmid: number; node: string }> {
    const tpl = (await this.resources()).find((v) => v.vmid === input.templateId);
    if (!tpl || tpl.template !== 1) throw new NotFoundError('template não encontrado');
    const node = tpl.node;
    const newid = parseInt(await this.px.get<string>('/cluster/nextid'), 10);

    const upid = await this.px.post<string>(`/nodes/${node}/qemu/${input.templateId}/clone`, {
      newid, name: input.name, full: 1, storage: this.targetStorage,
    });
    await this.waitTask(node, upid);

    const cfg: Record<string, string | number> = { tags: this.policy.clientTag };
    // vCPU do form = total. Fixa sockets=1 para que "cores" seja o total de vCPU
    // (senão herda sockets do template, ex.: 2 → o valor informado dobra).
    if (input.cores) { cfg.cores = input.cores; cfg.sockets = 1; }
    if (input.memoryMB) cfg.memory = input.memoryMB;
    if (input.ciuser) cfg.ciuser = input.ciuser;
    if (input.cipassword) cfg.cipassword = input.cipassword;
    if (input.sshkey) cfg.sshkeys = encodeURIComponent(input.sshkey);
    if (input.net) {
      cfg.ipconfig0 = input.net.mode === 'dhcp'
        ? 'ip=dhcp'
        : `ip=${input.net.ip}${input.net.gateway ? `,gw=${input.net.gateway}` : ''}`;
    }
    await this.px.put(`/nodes/${node}/qemu/${newid}/config`, cfg);

    if (input.diskGB) {
      await this.px.put(`/nodes/${node}/qemu/${newid}/resize`, { disk: 'scsi0', size: `${input.diskGB}G` });
    }
    if (input.start) await this.px.post(`/nodes/${node}/qemu/${newid}/status/start`);
    return { vmid: newid, node };
  }

  async listTemplates() {
    return (await this.resources())
      .filter((v) => v.template === 1)
      .map((v) => ({ vmid: v.vmid, name: v.name, node: v.node, tags: v.tags }));
  }

  async meta() {
    const res = await this.resources();
    const nodes = [...new Set(res.map((v) => v.node))];
    return { nodes, storages: [this.targetStorage] };
  }

  async taskStatus(upid: string) {
    // UPID:node:pid:pstart:starttime:dtype:vmid:user:...  — deriva node e vmid do próprio
    // UPID e exige que a VM seja visível (fronteira): sem isso um operador poderia consultar
    // tarefas de VMs de gestão passando um node/upid arbitrário.
    const parts = upid.split(':');
    const node = parts[1];
    const vmid = Number.parseInt(parts[6], 10);
    if (!node || !Number.isInteger(vmid)) throw new NotFoundError('tarefa não encontrada');
    await this.findVisible(vmid);
    return this.px.get(`/nodes/${node}/tasks/${encodeURIComponent(upid)}/status`);
  }

  async dashboard() {
    const [vms, nodes] = await Promise.all([
      this.listVisible(),
      this.px.get<Array<{ maxcpu?: number; maxmem?: number }>>('/cluster/resources?type=node'),
    ]);
    const nodeList = Array.isArray(nodes) ? nodes : [];
    const running = vms.filter((v) => v.status === 'running').length;
    return {
      total: vms.length,
      running,
      stopped: vms.length - running,
      allocatedVcpu: vms.reduce((s, v) => s + (v.maxcpu ?? 0), 0),
      allocatedMemMB: Math.round(vms.reduce((s, v) => s + (v.maxmem ?? 0), 0) / (1024 * 1024)),
      totalVcpu: nodeList.reduce((s, n) => s + (n.maxcpu ?? 0), 0),
      totalMemMB: Math.round(nodeList.reduce((s, n) => s + (n.maxmem ?? 0), 0) / (1024 * 1024)),
    };
  }

  async findVisibleNode(vmid: number): Promise<string> {
    return (await this.findVisible(vmid)).node;
  }
}
