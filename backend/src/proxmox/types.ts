export interface ClusterVm {
  vmid: number; name?: string; status: string; node: string;
  tags?: string; template?: number; maxcpu?: number; maxmem?: number; uptime?: number; type: string;
}
export interface TaskStatus { status: string; exitstatus?: string; upid: string; }
export interface VncProxy { ticket: string; port: string; user: string; cert?: string; }
