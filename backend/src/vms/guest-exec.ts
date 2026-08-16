import type { ProxmoxClient } from '../proxmox/client.js';
import { ProxmoxError } from '../errors.js';

export interface GuestExecResult { exitcode: number; outData: string; errData: string; }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Executa um comando no guest (QEMU agent) e espera terminar.
 * O primeiro poll é imediato — no caminho feliz não há espera.
 */
export async function execInGuest(
  px: ProxmoxClient,
  node: string,
  vmid: number,
  argv: string[],
  opts: { pollMs?: number; timeoutMs?: number } = {},
): Promise<GuestExecResult> {
  const pollMs = opts.pollMs ?? 400;
  const timeoutMs = opts.timeoutMs ?? 20000;
  const { pid } = await px.agentExec(node, vmid, argv);
  for (let waited = 0; ; waited += pollMs) {
    const st = await px.agentExecStatus(node, vmid, pid);
    if (st.exited) {
      return { exitcode: st.exitcode ?? -1, outData: st['out-data'] ?? '', errData: st['err-data'] ?? '' };
    }
    if (waited >= timeoutMs) throw new ProxmoxError('timeout no guest-exec');
    await sleep(pollMs);
  }
}
