import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
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
  const { user, logout, brand } = useAuth();
  const nav = useNavigate();
  const dash = useQuery({ queryKey: ['dashboard'], queryFn: api.dashboard });
  const vms = useQuery({ queryKey: ['vms'], queryFn: api.vms });

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
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {vms.isLoading && <p>Carregando VMs…</p>}
        {vms.data?.length === 0 && <p>Nenhuma VM de cliente ainda.</p>}
      </div>
    </div>
  );
}
