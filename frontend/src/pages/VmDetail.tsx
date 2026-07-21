import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { StatusBadge } from '../components/StatusBadge.js';

export function VmDetail() {
  const { id } = useParams();
  const vmid = Number(id);
  const qc = useQueryClient();
  const nav = useNavigate();
  const [busy, setBusy] = useState('');
  const [confirmName, setConfirmName] = useState('');
  const vm = useQuery({ queryKey: ['vm', vmid], queryFn: () => api.vm(vmid) });

  const act = async (a: 'start' | 'stop' | 'shutdown' | 'reboot') => {
    setBusy(a);
    try { await api.action(vmid, a); await qc.invalidateQueries({ queryKey: ['vm', vmid] }); }
    finally { setBusy(''); }
  };
  const status = vm.data?.status?.status ?? vm.data?.status;
  const name = vm.data?.name;

  const remove = async () => {
    if (confirmName !== name) return;
    setBusy('delete');
    try { await api.remove(vmid); nav('/'); } finally { setBusy(''); }
  };

  return (
    <div style={{ maxWidth: 720, margin: '2rem auto', padding: '0 1rem' }}>
      <Link to="/">← voltar</Link>
      {vm.isLoading && <p>Carregando…</p>}
      {vm.data && (
        <>
          <h1>{name} <StatusBadge status={String(status)} /></h1>
          <p>VMID {vmid} · node {vm.data.node} · {vm.data.config?.cores} vCPU · {vm.data.config?.memory} MB</p>
          <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', margin: '1rem 0' }}>
            <button disabled={!!busy} onClick={() => act('start')}>Ligar</button>
            <button disabled={!!busy} onClick={() => act('shutdown')} style={{ background: '#2d3746' }}>Encerrar (ACPI)</button>
            <button disabled={!!busy} onClick={() => act('stop')} style={{ background: '#2d3746' }}>Forçar stop</button>
            <button disabled={!!busy} onClick={() => act('reboot')} style={{ background: '#2d3746' }}>Reiniciar</button>
            <Link to={`/vms/${vmid}/console`}><button>Console</button></Link>
          </div>
          <details className="card" style={{ marginTop: '1rem' }}>
            <summary style={{ cursor: 'pointer', color: 'var(--err)' }}>Excluir VM</summary>
            <p>Digite o nome {name} para confirmar a exclusão.</p>
            <input value={confirmName} onChange={(e) => setConfirmName(e.target.value)} />
            <button disabled={confirmName !== name || busy === 'delete'} onClick={remove} style={{ background: 'var(--err)', marginTop: '.5rem' }}>
              Excluir definitivamente
            </button>
          </details>
        </>
      )}
    </div>
  );
}
