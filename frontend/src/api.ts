export interface ApiError { error: string; detail?: string; }

async function req<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method, credentials: 'include',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) throw Object.assign(new Error((data as ApiError).error || 'erro'), { status: res.status, detail: (data as ApiError).detail });
  return data as T;
}

export interface Vm { vmid: number; name?: string; status: string; node: string; tags?: string; maxcpu?: number; maxmem?: number; uptime?: number; }
export interface Template { vmid: number; name?: string; node: string; }
export interface Dashboard { total: number; running: number; stopped: number; allocatedVcpu: number; allocatedMemMB: number; totalVcpu: number; totalMemMB: number; }
export interface Me { username: string; groups: string[]; }

export const api = {
  login: (username: string, password: string) => req<Me>('POST', '/api/auth/login', { username, password }),
  logout: () => req<{ ok: true }>('POST', '/api/auth/logout'),
  me: () => req<Me>('GET', '/api/auth/me'),
  vms: () => req<Vm[]>('GET', '/api/vms'),
  vm: (id: number) => req<any>('GET', `/api/vms/${id}`),
  action: (id: number, a: 'start' | 'stop' | 'shutdown' | 'reboot') => req<{ upid: string }>('POST', `/api/vms/${id}/${a}`),
  remove: (id: number) => req<{ upid: string }>('DELETE', `/api/vms/${id}`),
  create: (body: unknown) => req<{ vmid: number; node: string }>('POST', '/api/vms', body),
  templates: () => req<Template[]>('GET', '/api/templates'),
  dashboard: () => req<Dashboard>('GET', '/api/dashboard'),
  console: (id: number) => req<{ wsPath: string; password: string }>('GET', `/api/vms/${id}/console`),
  config: () => req<{ brand: string }>('GET', '/api/config'),
};
