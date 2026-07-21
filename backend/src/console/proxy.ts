import type { ProxmoxClient } from '../proxmox/client.js';
import type { VmService } from '../vms/service.js';
import type { VncProxy } from '../proxmox/types.js';

export interface ConsoleTicket { node: string; port: string; ticket: string; vmid: number; }

export async function openConsole(vms: VmService, px: ProxmoxClient, vmid: number): Promise<ConsoleTicket> {
  const node = await vms.findVisibleNode(vmid); // guard: 404 se não visível
  const r = await px.post<VncProxy>(`/nodes/${node}/qemu/${vmid}/vncproxy`, { websocket: 1 });
  return { node, port: r.port, ticket: r.ticket, vmid };
}
