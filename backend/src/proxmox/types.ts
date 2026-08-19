export interface ClusterVm {
  vmid: number; name?: string; status: string; node: string;
  tags?: string; template?: number; maxcpu?: number; maxmem?: number; uptime?: number; type: string;
}
export interface TaskStatus { status: string; exitstatus?: string; upid: string; }
export interface VncProxy { ticket: string; port: string; user: string; cert?: string; }
export interface ProxmoxTask {
  upid: string;
  type: string;
  id?: string;        // vmid como string, ex.: "101"
  user?: string;      // ex.: "root@pam"
  node?: string;
  status?: string;    // "running" enquanto ativa; "OK" ou string de erro quando encerrada
  starttime: number;  // epoch (s)
  endtime?: number;   // epoch (s); ausente enquanto rodando
  pid?: number;
}
