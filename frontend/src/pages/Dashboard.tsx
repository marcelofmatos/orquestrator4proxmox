import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.js';
import { StatusBadge } from '../components/StatusBadge.js';

export function Dashboard() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const dash = useQuery({ queryKey: ['dashboard'], queryFn: api.dashboard });
  const vms = useQuery({ queryKey: ['vms'], queryFn: api.vms });

  return (
    <div>
      <div className="topbar">
        <strong>orquestrator4proxmox</strong>
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
        <div className="stat"><b>{dash.data?.allocatedVcpu ?? '—'}</b>vCPU alocados</div>
        <div className="stat"><b>{dash.data ? Math.round(dash.data.allocatedMemMB / 1024) : '—'} GB</b>RAM alocada</div>
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
                <td><Link to={`/vms/${vm.vmid}`}>abrir</Link></td>
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
