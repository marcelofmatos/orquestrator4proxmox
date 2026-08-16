import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { api, type VmDisk, type StorageStatus, type DiskUsage } from '../api.js';

function fmtGB(n: number): string {
  return `${Math.round(n)} GB`;
}

/** Barra de uso real do disco (guest agent). Sem dado → aviso discreto do porquê. */
function DiskUsageBar({ usage, vmStopped, diskSizeGB, onGrow, growing }: {
  usage?: DiskUsage; vmStopped?: boolean; diskSizeGB?: number; onGrow?: () => void; growing?: boolean;
}) {
  if (!usage) {
    // VM desligada: o agent não roda; ligada e mesmo assim sem dado: agent ausente/parado
    const label = vmStopped ? 'VM desligada' : 'sem dados do agente';
    return <span style={{ opacity: .5, fontSize: '.85rem' }}>{label}</span>;
  }
  const pct = Math.round(usage.usedPct);
  const hasSlack = diskSizeGB != null && diskSizeGB > usage.fsTotalGB + 1;
  return (
    <div title={usage.mounts.join(', ')} style={{ minWidth: 140 }}>
      <div style={{ fontSize: '.8rem', opacity: .85, marginBottom: '.25rem' }}>
        {fmtGB(usage.usedGB)} / {fmtGB(usage.fsTotalGB)} · <b>{pct}%</b>
      </div>
      <div className="gauge">
        <div className="gauge-fill" style={{ width: `${usage.usedPct}%`, background: gaugeColor(usage.usedPct) }} />
      </div>
      {hasSlack && onGrow && (
        <button onClick={onGrow} disabled={growing} style={{ marginTop: '.35rem', background: '#2d3746', fontSize: '.78rem', padding: '.25rem .5rem' }}>
          {growing ? <><span className="spinner" /> Expandindo…</> : 'Expandir FS'}
        </button>
      )}
    </div>
  );
}

function gaugeColor(pct: number): string {
  return pct > 85 ? 'var(--err)' : pct > 60 ? '#f59e0b' : 'var(--run)';
}

// pendingGB = quanto essa operação (incremento do resize, ou tamanho do disco novo) vai
// somar ao storage — mostrado como uma "sombra" translúcida depois do uso atual, pra dar
// visibilidade de quanto vai ficar ocupado no total antes de confirmar.
function StorageGauge({ status, pendingGB = 0 }: { status: StorageStatus; pendingGB?: number }) {
  const usedPct = status.totalGB > 0 ? Math.min(100, (status.usedGB / status.totalGB) * 100) : 0;
  const projectedPct = status.totalGB > 0
    ? Math.min(100, ((status.usedGB + Math.max(0, pendingGB)) / status.totalGB) * 100)
    : 0;
  const pendingPct = Math.max(0, projectedPct - usedPct);
  return (
    <div>
      <p style={{ margin: '0 0 .3rem', fontSize: '.85rem', opacity: .8 }}>
        {fmtGB(status.usedGB)} / {fmtGB(status.totalGB)} usados no storage {status.storage}
      </p>
      <div className="gauge" style={{ display: 'flex' }}>
        <div className="gauge-fill" style={{ width: `${usedPct}%`, background: gaugeColor(usedPct) }} />
        {pendingPct > 0 && (
          <div className="gauge-fill" style={{ width: `${pendingPct}%`, background: gaugeColor(projectedPct), opacity: .4 }} />
        )}
      </div>
    </div>
  );
}

export function Disks() {
  const { id } = useParams();
  const vmid = Number(id);
  const qc = useQueryClient();
  const vm = useQuery({ queryKey: ['vm', vmid], queryFn: () => api.vm(vmid) });
  const disks = useQuery({ queryKey: ['vm-disks', vmid], queryFn: () => api.disks(vmid) });
  // uso real por disco (guest agent) — atualiza sozinho, sem travar a tela se o agente estiver off
  const usage = useQuery({ queryKey: ['vm-disk-usage', vmid], queryFn: () => api.disksUsage(vmid), refetchInterval: 15000 });
  const usageByKey = new Map((usage.data ?? []).map((u) => [u.key, u]));
  // status vem do status/current (objeto). Só marca "desligada" quando já sabemos o status.
  const vmStatus = (vm.data?.status as any)?.status as string | undefined;
  const vmStopped = vmStatus != null && vmStatus !== 'running';
  const [resizing, setResizing] = useState<VmDisk | null>(null);
  const [adding, setAdding] = useState(false);
  const [growingKey, setGrowingKey] = useState<string | null>(null);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['vm-disks', vmid] });
    qc.invalidateQueries({ queryKey: ['vm-disk-usage', vmid] });
    qc.invalidateQueries({ queryKey: ['vm', vmid] });
  };

  const grow = async (key: string) => {
    setGrowingKey(key);
    try { await api.growFilesystem(vmid, key); refresh(); }
    finally { setGrowingKey(null); }
  };

  return (
    <div style={{ maxWidth: 800, margin: '2rem auto', padding: '0 1rem' }}>
      <Link to={`/vms/${vmid}`} className="navlink">← voltar</Link>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ margin: 0 }}>Discos — {vm.data?.name ?? `VM #${vmid}`}</h1>
          <p style={{ margin: '.25rem 0 0', color: '#8b97a7' }}>
            VM #{vmid}{vm.data?.node ? ` · node ${vm.data.node}` : ''}
          </p>
        </div>
        <button onClick={() => setAdding(true)}>+ Novo disco</button>
      </div>

      {disks.isLoading && <p>Carregando…</p>}
      {disks.data && disks.data.length > 0 && (
        <table>
          <thead><tr><th>Disco</th><th>Interface</th><th>Storage</th><th>Tamanho</th><th>Uso</th><th></th></tr></thead>
          <tbody>
            {disks.data.map((d) => (
              <tr key={d.key}>
                <td>{d.key}</td>
                <td>{d.interface}</td>
                <td>{d.storage}</td>
                <td>{d.sizeGB} GB</td>
                <td><DiskUsageBar usage={usageByKey.get(d.key)} vmStopped={vmStopped}
                      diskSizeGB={d.sizeGB} onGrow={() => grow(d.key)} growing={growingKey === d.key} /></td>
                <td><button onClick={() => setResizing(d)} style={{ background: '#2d3746' }}>Redimensionar</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {disks.data?.length === 0 && <p>Nenhum disco encontrado.</p>}

      {resizing && (
        <ResizeDiskModal vmid={vmid} disk={resizing} onClose={() => setResizing(null)}
          onDone={() => { setResizing(null); refresh(); }} />
      )}
      {adding && (
        <AddDiskModal vmid={vmid} onClose={() => setAdding(false)}
          onDone={() => { setAdding(false); refresh(); }} />
      )}
    </div>
  );
}

function ResizeDiskModal(
  { vmid, disk, onClose, onDone }: { vmid: number; disk: VmDisk; onClose: () => void; onDone: () => void },
) {
  const storage = useQuery({ queryKey: ['disk-storage', vmid, disk.key], queryFn: () => api.diskStorage(vmid, disk.key) });
  const [increment, setIncrement] = useState('0');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [autoGrow, setAutoGrow] = useState(true);
  const [growNote, setGrowNote] = useState('');
  const incrementGB = Number(increment) || 0;
  const newSizeGB = disk.sizeGB + incrementGB;
  const valid = incrementGB > 0;
  const overAvail = storage.data != null && incrementGB > storage.data.availGB;

  const submit = async () => {
    setBusy(true); setError(''); setGrowNote('');
    try {
      await api.resizeDisk(vmid, disk.key, newSizeGB);
      if (autoGrow) {
        const g = await api.growFilesystem(vmid, disk.key);
        if (!g.grown) { setGrowNote(`Disco aumentado, mas o filesystem não foi expandido: ${g.reason ?? 'motivo desconhecido'}.`); }
      }
      onDone();
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="box" style={{ flexDirection: 'column', alignItems: 'stretch', minWidth: 340, maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 .3rem' }}>Redimensionar {disk.key}</h3>
        <p style={{ margin: 0 }}>Tamanho atual: <b>{disk.sizeGB} GB</b></p>
        {storage.data && <StorageGauge status={storage.data} pendingGB={incrementGB} />}
        <label style={{ display: 'flex', flexDirection: 'column', gap: '.35rem' }}>Aumentar em (GB)
          <input type="number" min={0} value={increment} onChange={(e) => setIncrement(e.target.value)} />
        </label>
        <p style={{ margin: 0 }}>Novo tamanho: <b>{newSizeGB} GB</b></p>
        {overAvail && (
          <p style={{ color: '#f59e0b', fontSize: '.85rem', margin: 0 }}>
            Aumento maior que o espaço livre relatado no storage ({fmtGB(storage.data!.availGB)}).
          </p>
        )}
        <label style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '.5rem' }}>
          <input type="checkbox" style={{ width: 'auto' }} checked={autoGrow} onChange={(e) => setAutoGrow(e.target.checked)} />
          Expandir o filesystem automaticamente após aumentar
        </label>
        {growNote && <p style={{ color: '#f59e0b', fontSize: '.85rem', margin: 0 }}>{growNote}</p>}
        <p style={{ fontSize: '.85rem', opacity: .8 }}>
          Com a opção acima ligada, o filesystem (XFS de disco inteiro) é expandido online logo
          após o aumento, sem reboot. Discos particionados/LVM ainda precisam ser crescidos
          manualmente ou via reboot.
        </p>
        {error && <p className="error">{error}</p>}
        <div style={{ display: 'flex', gap: '.5rem', marginTop: '.5rem' }}>
          <button disabled={!valid || busy} onClick={submit}>{busy ? <><span className="spinner" /> Redimensionando…</> : 'Confirmar'}</button>
          <button style={{ background: '#2d3746' }} onClick={onClose}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}

function AddDiskModal({ vmid, onClose, onDone }: { vmid: number; onClose: () => void; onDone: () => void }) {
  const storage = useQuery({ queryKey: ['vm-storage', vmid], queryFn: () => api.vmStorage(vmid) });
  const [sizeGB, setSizeGB] = useState('10');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const sizeGBNum = Number(sizeGB) || 0;
  const valid = sizeGBNum > 0;
  const overAvail = storage.data != null && sizeGBNum > storage.data.availGB;

  const submit = async () => {
    setBusy(true); setError('');
    try { await api.addDisk(vmid, sizeGBNum); onDone(); }
    catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="box" style={{ flexDirection: 'column', alignItems: 'stretch', minWidth: 340, maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 .3rem' }}>Novo disco</h3>
        {storage.data && <StorageGauge status={storage.data} pendingGB={sizeGBNum} />}
        <label style={{ display: 'flex', flexDirection: 'column', gap: '.35rem' }}>Tamanho (GB)
          <input type="number" min={1} value={sizeGB} onChange={(e) => setSizeGB(e.target.value)} />
        </label>
        {overAvail && (
          <p style={{ color: '#f59e0b', fontSize: '.85rem', margin: 0 }}>
            Tamanho maior que o espaço livre relatado no storage ({fmtGB(storage.data!.availGB)}).
          </p>
        )}
        {error && <p className="error">{error}</p>}
        <div style={{ display: 'flex', gap: '.5rem', marginTop: '.5rem' }}>
          <button disabled={!valid || busy} onClick={submit}>{busy ? <><span className="spinner" /> Criando…</> : 'Adicionar disco'}</button>
          <button style={{ background: '#2d3746' }} onClick={onClose}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}
