import { describe, it, expect, vi } from 'vitest';
import { openConsole } from '../src/console/proxy.js';
import { NotFoundError } from '../src/errors.js';

const policy = { clientTag: 'cliente', hiddenTags: ['mgmt'] };
function svc(found: boolean) {
  return {
    findVisibleNode: vi.fn(async (id: number) => {
      if (!found) throw new NotFoundError();
      return 'n1';
    }),
  };
}
function px(ticket = 'PVEVNC:abc') {
  return { post: vi.fn(async () => ({ ticket, port: '5901', user: 'root@pam' })) };
}

describe('openConsole', () => {
  it('retorna ticket/porta/node para VM visível', async () => {
    const r = await openConsole(svc(true) as any, px() as any, 101);
    expect(r).toMatchObject({ node: 'n1', port: '5901', ticket: 'PVEVNC:abc' });
    expect(px().post).toBeDefined();
  });
  it('propaga NotFound para VM de gestão', async () => {
    await expect(openConsole(svc(false) as any, px() as any, 100)).rejects.toBeInstanceOf(NotFoundError);
  });
});
