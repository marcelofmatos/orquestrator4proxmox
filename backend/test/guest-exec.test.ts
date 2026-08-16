import { describe, it, expect, vi } from 'vitest';
import { execInGuest } from '../src/vms/guest-exec.js';

function fakePx(statuses: any[]) {
  let i = 0;
  return {
    agentExec: vi.fn(async () => ({ pid: 99 })),
    agentExecStatus: vi.fn(async () => statuses[Math.min(i++, statuses.length - 1)]),
  };
}

describe('execInGuest', () => {
  it('roda o comando e devolve exitcode + out/err quando exited', async () => {
    const px = fakePx([{ exited: 1, exitcode: 0, 'out-data': 'done', 'err-data': '' }]);
    const r = await execInGuest(px as any, 'n1', 106, ['xfs_growfs', '/var']);
    expect(px.agentExec).toHaveBeenCalledWith('n1', 106, ['xfs_growfs', '/var']);
    expect(r).toEqual({ exitcode: 0, outData: 'done', errData: '' });
  });

  it('faz poll até exited=1', async () => {
    const px = fakePx([{ exited: 0 }, { exited: 0 }, { exited: 1, exitcode: 2, 'err-data': 'boom' }]);
    const r = await execInGuest(px as any, 'n1', 106, ['x'], { pollMs: 1 });
    expect(px.agentExecStatus).toHaveBeenCalledTimes(3);
    expect(r).toEqual({ exitcode: 2, outData: '', errData: 'boom' });
  });

  it('estoura timeout se nunca sai', async () => {
    const px = fakePx([{ exited: 0 }]);
    await expect(execInGuest(px as any, 'n1', 106, ['x'], { pollMs: 1, timeoutMs: 3 }))
      .rejects.toThrow(/timeout/i);
  });
});
