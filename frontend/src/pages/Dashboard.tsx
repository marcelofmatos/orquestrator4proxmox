import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { api, type Vm } from '../api.js';
import { useAuth } from '../auth.js';
import { StatusBadge } from '../components/StatusBadge.js';

function Gauge({ label, used, total, unit = '' }: { label: string; used: number; total: number; unit?: string }) {
  const pct = total > 0 ? Math.min(100, (used / total) * 100) : 0;
  const color = pct > 85 ? 'var(--err)' : pct > 60 ? '#f59e0b' : 'var(--run)';
  return (
    <div className="stat">
      <b>{used}{unit} <span className="sub">/ {total}{unit}</span></b>
      {label}
      <div className="gauge"><div className="gauge-fill" style={{ width: `${pct}%`, background: color }} /></div>
    </div>
  );
}

export function Dashboard() {
  const { user, logout, brand, hostDomain } = useAuth();
  const nav = useNavigate();
  const dash = useQuery({ queryKey: ['dashboard'], queryFn: api.dashboard });
  const vms = useQuery({ queryKey: ['vms'], queryFn: api.vms });
  const [sshVm, setSshVm] = useState<Vm | null>(null);
  const [copied, setCopied] = useState(false);
  const sshUser = user?.username || '<usuário>';
  const sshCmd = sshVm ? `ssh ${sshUser}@${sshVm.name}.${hostDomain || '<HOST_DOMAIN>'}` : '';

  return (
    <div>
      <div className="topbar">
        <strong>{brand}</strong>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <Link to="/vms/new"><button>+ Nova VM</button></Link>
          <span>{user?.username}</span>
          <button onClick={async () => { await logout(); nav('/login'); }} style={{ background: '#2d3746' }}>Sair</button>
        </div>
      </div>

      <div className="grid">
        <div className="stat"><b>{dash.data?.total ?? '—'}</b>Total</div>
        <div className="stat"><b>{dash.data?.running ?? '—'}</b>Ligadas</div>
        <div className="stat"><b>{dash.data?.stopped ?? '—'}</b>Desligadas</div>
        {dash.data
          ? <Gauge label="vCPU (alocado / total)" used={dash.data.allocatedVcpu} total={dash.data.totalVcpu} />
          : <div className="stat"><b>—</b>vCPU alocados</div>}
        {dash.data
          ? <Gauge label="RAM (alocado / total)" used={Math.round(dash.data.allocatedMemMB / 1024)} total={Math.round(dash.data.totalMemMB / 1024)} unit=" GB" />
          : <div className="stat"><b>—</b>RAM alocada</div>}
      </div>

      <div style={{ padding: '0 1.5rem 1.5rem' }}>
        <table>
          <thead><tr><th>VMID</th><th>Nome</th><th>Status</th><th>Node</th><th></th></tr></thead>
          <tbody>
            {vms.data?.map((vm) => (
              <tr key={vm.vmid}>
                <td>{vm.vmid}</td>
                <td>{vm.name}</td>
                <td><StatusBadge status={vm.status} /></td>
                <td>{vm.node}</td>
                <td style={{ whiteSpace: 'nowrap', fontSize: '1.25rem' }}>
                  <Link to={`/vms/${vm.vmid}`} title="Detalhes" style={{ textDecoration: 'none' }}>🔍</Link>
                  {' '}
                  <Link to={`/vms/${vm.vmid}/console`} title="Console" style={{ textDecoration: 'none' }}>🖥️</Link>
                  {' '}
                  <span role="button" title="Acesso SSH" style={{ cursor: 'pointer' }} onClick={() => { setSshVm(vm); setCopied(false); }}>🔑</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {vms.isLoading && <p>Carregando VMs…</p>}
        {vms.data?.length === 0 && <p>Nenhuma VM de cliente ainda.</p>}
      </div>

      {sshVm && (
        <div className="overlay" onClick={() => setSshVm(null)}>
          <div className="box" style={{ flexDirection: 'column', alignItems: 'stretch', minWidth: 380, maxWidth: '90vw' }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 .3rem' }}>Acesso SSH — {sshVm.name}</h3>
            {!hostDomain && <p className="error" style={{ margin: '0 0 .5rem' }}>HOST_DOMAIN não configurado — defina a env no stack.</p>}
            <code className="ssh-cmd">{sshCmd}</code>
            <div style={{ display: 'flex', gap: '.5rem', marginTop: '.8rem' }}>
              <button onClick={() => { navigator.clipboard?.writeText(sshCmd); setCopied(true); }}>{copied ? 'Copiado!' : 'Copiar'}</button>
              <button style={{ background: '#2d3746' }} onClick={() => setSshVm(null)}>Fechar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
