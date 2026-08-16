import { Agent } from 'undici';
import { ProxmoxError } from '../errors.js';

export interface ProxmoxClientConfig {
  url: string; tokenId: string; tokenSecret: string; tlsInsecure: boolean;
}
type Params = Record<string, string | number | undefined>;

export interface AgentExecStatus {
  exited: number;
  exitcode?: number;
  'out-data'?: string;
  'err-data'?: string;
}

export class ProxmoxClient {
  private readonly dispatcher?: Agent;
  constructor(private readonly cfg: ProxmoxClientConfig, private readonly fetchFn: typeof fetch = fetch) {
    this.dispatcher = cfg.tlsInsecure ? new Agent({ connect: { rejectUnauthorized: false } }) : undefined;
  }

  private headers(): Record<string, string> {
    return { Authorization: `PVEAPIToken=${this.cfg.tokenId}=${this.cfg.tokenSecret}` };
  }

  private async request<T>(method: string, path: string, params?: Params): Promise<T> {
    const url = `${this.cfg.url}/api2/json${path}`;
    const init: RequestInit & { dispatcher?: Agent } = { method, headers: this.headers(), dispatcher: this.dispatcher };
    if (params && method !== 'GET') {
      const body = new URLSearchParams();
      for (const [k, v] of Object.entries(params)) if (v !== undefined) body.append(k, String(v));
      init.body = body.toString();
      init.headers = { ...this.headers(), 'Content-Type': 'application/x-www-form-urlencoded' };
    }
    const res = await this.fetchFn(url, init as RequestInit);
    const raw = await res.text();
    if (!res.ok) throw new ProxmoxError(`erro proxmox ${res.status}`, raw.slice(0, 500));
    return (raw ? JSON.parse(raw) : {}).data as T;
  }

  get<T>(path: string): Promise<T> { return this.request<T>('GET', path); }
  post<T>(path: string, params?: Params): Promise<T> { return this.request<T>('POST', path, params); }
  put<T>(path: string, params?: Params): Promise<T> { return this.request<T>('PUT', path, params); }
  del<T>(path: string): Promise<T> { return this.request<T>('DELETE', path); }

  private async requestForm<T>(path: string, body: URLSearchParams): Promise<T> {
    const url = `${this.cfg.url}/api2/json${path}`;
    const res = await this.fetchFn(url, {
      method: 'POST',
      headers: { ...this.headers(), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      dispatcher: this.dispatcher,
    } as RequestInit);
    const raw = await res.text();
    if (!res.ok) throw new ProxmoxError(`erro proxmox ${res.status}`, raw.slice(0, 500));
    return (raw ? JSON.parse(raw) : {}).data as T;
  }

  /** Executa um comando no guest via QEMU agent. argv vira command[] (array). */
  agentExec(node: string, vmid: number, argv: string[]): Promise<{ pid: number }> {
    const body = new URLSearchParams();
    for (const a of argv) body.append('command', a);
    return this.requestForm(`/nodes/${node}/qemu/${vmid}/agent/exec`, body);
  }

  agentExecStatus(node: string, vmid: number, pid: number): Promise<AgentExecStatus> {
    return this.get(`/nodes/${node}/qemu/${vmid}/agent/exec-status?pid=${pid}`);
  }
}
