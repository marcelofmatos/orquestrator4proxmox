import type { ProxmoxClient } from '../proxmox/client.js';
import type { ClusterVm, TaskStatus } from '../proxmox/types.js';
import { AppError, NotFoundError, ProxmoxError } from '../errors.js';
import { filterVisible, isClientVisible, parseTags, type TagPolicy } from './visibility.js';
import { parsePlans, stripPlansBlock, type Plan } from './plans.js';

export interface CreateVmInput {
  templateId: number; name: string; plan?: string;
  cores?: number; memoryMB?: number; diskGB?: number;
  net?: { mode: 'dhcp' } | { mode: 'static'; ip: string; gateway?: string };
  ciuser?: string; cipassword?: string; sshkey?: string; start?: boolean;
}

export interface VmDisk {
  key: string;
  interface: 'scsi' | 'virtio' | 'sata' | 'ide';
  sizeGB: number;
  storage: string;
}

export class VmService {
  constructor(
    private readonly px: ProxmoxClient,
    private readonly policy: TagPolicy,
    private readonly targetStorage: string,
    // disco de DADOS do residente (/home). Único disco que muda por plano; o
    // Proxmox só cresce, então só redimensiona quando o plano pede mais que o base.
    private readonly dataDisk = 'scsi2',
  ) {}

  private static readonly DISK_KEY = /^(scsi|virtio|sata|ide)(\d+)$/;

  /** Tamanho (GiB) e storage de uma entrada de disco (ex.: "local-zfs:vm-101-disk-0,size=32G"). */
  private parseDiskValue(value: string): { storage: string; sizeGB: number } | undefined {
    const m = /(?:^|,)size=(\d+(?:\.\d+)?)([KMGT])/i.exec(value);
    if (!m) return undefined;
    const mult: Record<string, number> = { K: 1 / (1024 * 1024), M: 1 / 1024, G: 1, T: 1024 };
    return { storage: value.split(':')[0], sizeGB: parseFloat(m[1]) * (mult[m[2].toUpperCase()] ?? 1) };
  }

  /** Tamanho (GiB) de um disco a partir da config da VM (ex.: "…,size=80G"). */
  private diskSizeGB(cfg: Record<string, unknown>, disk: string): number | undefined {
    const v = cfg[disk];
    return typeof v === 'string' ? this.parseDiskValue(v)?.sizeGB : undefined;
  }

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
    // mesma fronteira da listagem: template oculto (mgmt/infra) não pode ser clonado
    if (!tpl || !this.isOfferableTemplate(tpl)) throw new NotFoundError('template não encontrado');
    const node = tpl.node;

    // config do template = fonte dos PLANOS (bloco no Notes) e do tamanho-base do
    // disco de dados. Sem banco: o estado dos planos vive no próprio Proxmox.
    const tplCfg = await this.px.get<Record<string, unknown>>(
      `/nodes/${node}/qemu/${input.templateId}/config`);
    const plans = parsePlans(typeof tplCfg.description === 'string' ? tplCfg.description : '');
    let plan: Plan | undefined;
    if (input.plan) {
      plan = plans[input.plan];
      if (!plan) throw new NotFoundError(`plano '${input.plan}' não definido no template`);
    }
    // campos avulsos (uso avançado) sobrepõem o plano; senão o plano manda.
    const cores = input.cores ?? plan?.cores;
    const memoryMB = input.memoryMB ?? plan?.memoryMB;
    const homeGB = input.diskGB ?? plan?.homeGB;

    const newid = parseInt(await this.px.get<string>('/cluster/nextid'), 10);
    const upid = await this.px.post<string>(`/nodes/${node}/qemu/${input.templateId}/clone`, {
      newid, name: input.name, full: 1, storage: this.targetStorage,
    });
    await this.waitTask(node, upid);

    const cfg: Record<string, string | number> = { tags: this.policy.clientTag };
    // vCPU = total. Fixa sockets=1 para que "cores" seja o total de vCPU
    // (senão herda sockets do template, ex.: 2 → o valor informado dobra).
    if (cores) { cfg.cores = cores; cfg.sockets = 1; }
    if (memoryMB) cfg.memory = memoryMB;
    if (input.ciuser) cfg.ciuser = input.ciuser;
    if (input.cipassword) cfg.cipassword = input.cipassword;
    if (input.sshkey) cfg.sshkeys = encodeURIComponent(input.sshkey);
    if (input.net) {
      cfg.ipconfig0 = input.net.mode === 'dhcp'
        ? 'ip=dhcp'
        : `ip=${input.net.ip}${input.net.gateway ? `,gw=${input.net.gateway}` : ''}`;
    }
    await this.px.put(`/nodes/${node}/qemu/${newid}/config`, cfg);

    // cresce o disco de dados (/home = scsi2) para o tamanho do plano. O Proxmox
    // só cresce; redimensiona apenas quando o alvo é maior que o base do template
    // (ex.: plano "padrao" = tamanho-base → nada a fazer).
    if (homeGB) {
      const base = this.diskSizeGB(tplCfg, this.dataDisk) ?? 0;
      if (homeGB > base) {
        await this.px.put(`/nodes/${node}/qemu/${newid}/resize`,
          { disk: this.dataDisk, size: `${homeGB}G` });
      }
    }
    if (input.start) await this.px.post(`/nodes/${node}/qemu/${newid}/status/start`);
    return { vmid: newid, node };
  }

  /** Um template é ofertável se não carrega nenhuma tag oculta (mgmt/infra). */
  private isOfferableTemplate(vm: ClusterVm): boolean {
    return vm.template === 1 && !parseTags(vm.tags).some((t) => this.policy.hiddenTags.includes(t));
  }

  async listTemplates() {
    const templates = (await this.resources()).filter((v) => this.isOfferableTemplate(v));
    // a "nota" do Proxmox fica no campo `description` da config da VM
    return Promise.all(templates.map(async (v) => {
      const cfg = await this.px
        .get<Record<string, unknown>>(`/nodes/${v.node}/qemu/${v.vmid}/config`)
        .catch(() => ({} as Record<string, unknown>));
      const raw = typeof cfg?.description === 'string' ? cfg.description : '';
      return {
        vmid: v.vmid,
        name: v.name,
        node: v.node,
        tags: v.tags,
        // description SEM o bloco de planos (não vaza no card); planos vêm em `plans`.
        description: stripPlansBlock(raw),
        // planos disponíveis vêm do Notes do template (sem banco). {} = sem planos.
        plans: parsePlans(raw),
      };
    }));
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

  /** Lista os discos reais (exclui CD-ROM) anexados à VM. */
  async listDisks(vmid: number): Promise<VmDisk[]> {
    const vm = await this.findVisible(vmid);
    const cfg = await this.px.get<Record<string, unknown>>(`/nodes/${vm.node}/qemu/${vmid}/config`);
    const disks: VmDisk[] = [];
    for (const [key, value] of Object.entries(cfg)) {
      const m = VmService.DISK_KEY.exec(key);
      if (!m || typeof value !== 'string') continue;
      if (value === 'none' || /(?:^|,)media=cdrom/.test(value)) continue;
      const parsed = this.parseDiskValue(value);
      if (!parsed) continue;
      disks.push({ key, interface: m[1] as VmDisk['interface'], ...parsed });
    }
    // a ordem das chaves na resposta do Proxmox não é garantida (hash Perl); ordena
    // por chave (numeric-aware) para uma listagem previsível: scsi0, scsi1, …, scsi10.
    disks.sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true }));
    return disks;
  }

  /** Cresce um disco existente. O Proxmox só permite crescer, nunca encolher. */
  async resizeDisk(vmid: number, diskKey: string, sizeGB: number): Promise<void> {
    const vm = await this.findVisible(vmid);
    const cfg = await this.px.get<Record<string, unknown>>(`/nodes/${vm.node}/qemu/${vmid}/config`);
    const current = this.diskSizeGB(cfg, diskKey);
    if (current === undefined) throw new NotFoundError('disco não encontrado');
    if (sizeGB <= current) throw new AppError('o novo tamanho deve ser maior que o atual', 400);
    await this.px.put(`/nodes/${vm.node}/qemu/${vmid}/resize`, { disk: diskKey, size: `${sizeGB}G` });
  }

  /** Anexa um disco novo à VM no próximo slot scsiN livre. */
  async addDisk(vmid: number, sizeGB: number): Promise<VmDisk> {
    const vm = await this.findVisible(vmid);
    const cfg = await this.px.get<Record<string, unknown>>(`/nodes/${vm.node}/qemu/${vmid}/config`);
    let slot = -1;
    for (let n = 0; n <= 30; n++) { if (cfg[`scsi${n}`] === undefined) { slot = n; break; } }
    if (slot < 0) throw new ProxmoxError('sem slot scsi livre nesta VM (máximo 31 discos)');
    const key = `scsi${slot}`;
    await this.px.put(`/nodes/${vm.node}/qemu/${vmid}/config`, { [key]: `${this.targetStorage}:${sizeGB}` });
    return { key, interface: 'scsi', sizeGB, storage: this.targetStorage };
  }
}
