import { useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { api, type VmDisk } from '../api.js';
import { StatusBadge } from '../components/StatusBadge.js';

function fmtBytes(n?: number): string {
  if (!n || n <= 0) return '—';
  const gb = n / 1024 ** 3;
  if (gb >= 1) return `${gb.toFixed(gb < 10 ? 1 : 0)} GB`;
  return `${Math.round(n / 1024 ** 2)} MB`;
}
function fmtUptime(sec?: number): string {
  if (!sec || sec <= 0) return '—';
  const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60);
  return [d && `${d}d`, h && `${h}h`, (m || (!d && !h)) && `${m}m`].filter(Boolean).join(' ');
}
function diskSummary(disks?: VmDisk[]): ReactNode {
  if (!disks || disks.length === 0) return '—';
  const totalGB = Math.round(disks.reduce((sum, d) => sum + d.sizeGB, 0));
  return <>{totalGB} GB <span className="sub">({disks.length} disco{disks.length === 1 ? '' : 's'})</span></>;
}
function netInfo(net0?: string): string {
  if (!net0) return '—';
  const bridge = /bridge=([^,]+)/.exec(net0)?.[1];
  const mac = /(?:virtio|e1000|rtl8139|vmxnet3)=([0-9A-Fa-f:]+)/.exec(net0)?.[1];
  return [bridge, mac].filter(Boolean).join(' · ') || net0;
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return <div className="stat"><b style={{ fontSize: '1.15rem' }}>{value}</b>{label}</div>;
}

function BarGauge({ label, pct, text }: { label: string; pct: number; text: string }) {
  const p = Math.max(0, Math.min(100, pct));
  const color = p > 85 ? 'var(--err)' : p > 60 ? '#f59e0b' : 'var(--run)';
  return (
    <div className="stat">
      <b style={{ fontSize: '1.15rem' }}>{text}</b>{label}
      <div className="gauge"><div className="gauge-fill" style={{ width: `${p}%`, background: color }} /></div>
    </div>
  );
}

export function VmDetail() {
  const { id } = useParams();
  const vmid = Number(id);
  const qc = useQueryClient();
  const nav = useNavigate();
  const [busy, setBusy] = useState('');
  const [confirmName, setConfirmName] = useState('');
  const vm = useQuery({ queryKey: ['vm', vmid], queryFn: () => api.vm(vmid) });
  const disks = useQuery({ queryKey: ['vm-disks', vmid], queryFn: () => api.disks(vmid) });

  const act = async (a: 'start' | 'stop' | 'shutdown' | 'reboot') => {
    setBusy(a);
    try { await api.action(vmid, a); await qc.invalidateQueries({ queryKey: ['vm', vmid] }); }
    finally { setBusy(''); }
  };

  const s = (vm.data?.status ?? {}) as Record<string, any>;
  const c = (vm.data?.config ?? {}) as Record<string, any>;
  const status = s.status ?? vm.data?.status;
  const name = vm.data?.name;
  const running = status === 'running';
  const cores = (Number(c.cores) || 1) * (Number(c.sockets) || 1);
  const memMax = Number(s.maxmem) || (Number(c.memory) || 0) * 1024 ** 2;

  const remove = async () => {
    if (confirmName !== name) return;
    setBusy('delete');
    try { await api.remove(vmid); nav('/'); } finally { setBusy(''); }
  };

  return (
    <div style={{ maxWidth: 900, margin: '2rem auto', padding: '0 1rem' }}>
      <Link to="/" className="navlink">← voltar</Link>
      {busy && (
        <div className="overlay"><div className="box">
          <span className="spinner lg" /> {busy === 'delete' ? 'Excluindo a VM…' : 'Aplicando…'}
        </div></div>
      )}
      {vm.isLoading && <p>Carregando…</p>}
      {vm.data && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <h1 style={{ margin: 0 }}>{name} <StatusBadge status={String(status)} /></h1>
              <p style={{ color: '#8b97a7', margin: '.4rem 0 0' }}>VMID {vmid} · node {vm.data.node}{vm.data.tags ? ` · tags: ${vm.data.tags}` : ''}</p>
            </div>
            <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
              <button disabled={!!busy} onClick={() => act('start')}>Ligar</button>
              <button disabled={!!busy} onClick={() => act('shutdown')} style={{ background: '#2d3746' }}>Encerrar (ACPI)</button>
              <button disabled={!!busy} onClick={() => act('stop')} style={{ background: '#2d3746' }}>Forçar stop</button>
              <button disabled={!!busy} onClick={() => act('reboot')} style={{ background: '#2d3746' }}>Reiniciar</button>
              <Link to={`/vms/${vmid}/console`}><button>Console</button></Link>
              <Link to={`/vms/${vmid}/discos`}><button>Discos</button></Link>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem', margin: '1.2rem 0' }}>
            <BarGauge label="CPU em uso" pct={running && s.cpu != null ? s.cpu * 100 : 0}
              text={running && s.cpu != null ? `${(s.cpu * 100).toFixed(1)}%` : '—'} />
            <BarGauge label="RAM (uso / total)" pct={running && memMax ? (s.mem / memMax) * 100 : 0}
              text={running ? `${fmtBytes(s.mem)} / ${fmtBytes(memMax)}` : fmtBytes(memMax)} />
          </div>

          <div className="grid" style={{ padding: 0, margin: '1rem 0' }}>
            <Stat label="vCPU" value={cores} />
            <Stat label="Disco" value={diskSummary(disks.data)} />
            <Stat label="Uptime" value={running ? fmtUptime(s.uptime) : '—'} />
            <Stat label="Sistema" value={c.ostype ?? '—'} />
            <Stat label="Rede" value={netInfo(c.net0)} />
            <Stat label="IP (cloud-init)" value={c.ipconfig0 ? String(c.ipconfig0).replace('ip=', '') : '—'} />
          </div>

          <section className="notes-card">
            <h3>Notas</h3>
            <div className="md">
              {/* campo Notes/description do Proxmox — markdown, com HTML escapado */}
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {String(c.description ?? '').trim() || '_Sem notas no Proxmox._'}
              </ReactMarkdown>
            </div>
          </section>

          <details className="card" style={{ marginTop: '1rem' }}>
            <summary style={{ cursor: 'pointer', color: 'var(--err)' }}>Excluir VM</summary>
            <p>Digite o nome {name} para confirmar a exclusão.</p>
            <input value={confirmName} onChange={(e) => setConfirmName(e.target.value)} />
            <button disabled={confirmName !== name || busy === 'delete'} onClick={remove} style={{ background: 'var(--err)', marginTop: '.5rem' }}>
              {busy === 'delete' ? <><span className="spinner" /> Excluindo…</> : 'Excluir definitivamente'}
            </button>
          </details>
        </>
      )}
    </div>
  );
}
