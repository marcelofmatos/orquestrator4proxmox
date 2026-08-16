import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProxmoxClient } from '../src/proxmox/client.js';

const cfg = { url: 'https://pve:8006', tokenId: 'root@pam!x', tokenSecret: 'sec', tlsInsecure: true };

function mockFetch(body: unknown, ok = true, status = 200) {
  return vi.fn().mockResolvedValue({
    ok, status,
    text: async () => JSON.stringify(body),
    json: async () => body,
  } as Response);
}

describe('ProxmoxClient', () => {
  let fetchMock: ReturnType<typeof mockFetch>;
  beforeEach(() => { fetchMock = mockFetch({ data: 'ok' }); });

  it('GET envia header de token e retorna data', async () => {
    const c = new ProxmoxClient(cfg, fetchMock as unknown as typeof fetch);
    const data = await c.get<string>('/version');
    expect(data).toBe('ok');
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('https://pve:8006/api2/json/version');
    expect((opts as RequestInit).headers).toMatchObject({
      Authorization: 'PVEAPIToken=root@pam!x=sec',
    });
  });

  it('POST serializa form-urlencoded', async () => {
    const c = new ProxmoxClient(cfg, fetchMock as unknown as typeof fetch);
    await c.post('/nodes/n1/qemu/103/clone', { newid: 104, name: 'x', full: 1 });
    const [, opts] = fetchMock.mock.calls[0];
    const o = opts as RequestInit;
    expect((o.headers as Record<string, string>)['Content-Type']).toBe('application/x-www-form-urlencoded');
    expect(String(o.body)).toContain('newid=104');
    expect(String(o.body)).toContain('name=x');
  });

  it('lança ProxmoxError em resposta não-ok', async () => {
    const c = new ProxmoxClient(cfg, mockFetch({ errors: 'bad' }, false, 500) as unknown as typeof fetch);
    await expect(c.get('/x')).rejects.toThrow(/proxmox/i);
  });

  it('agentExec serializa command repetido e agentExecStatus lê o pid', async () => {
    const fetchMock = mockFetch({ data: { pid: 7 } });
    const c = new ProxmoxClient(cfg, fetchMock as unknown as typeof fetch);
    await c.agentExec('n1', 106, ['a', 'b']);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('https://pve:8006/api2/json/nodes/n1/qemu/106/agent/exec');
    const body = String((opts as RequestInit).body);
    expect(body).toBe('command=a&command=b');

    const statusMock = mockFetch({ data: { exited: 1, exitcode: 0, 'out-data': 'ok' } });
    const c2 = new ProxmoxClient(cfg, statusMock as unknown as typeof fetch);
    const st = await c2.agentExecStatus('n1', 106, 7);
    expect(st).toEqual({ exited: 1, exitcode: 0, 'out-data': 'ok' });
    const [surl] = statusMock.mock.calls[0];
    expect(surl).toBe('https://pve:8006/api2/json/nodes/n1/qemu/106/agent/exec-status?pid=7');
  });
});
