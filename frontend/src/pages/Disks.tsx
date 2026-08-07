import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { api, type VmDisk } from '../api.js';

export function Disks() {
  const { id } = useParams();
  const vmid = Number(id);
  const qc = useQueryClient();
  const disks = useQuery({ queryKey: ['vm-disks', vmid], queryFn: () => api.disks(vmid) });
  const [resizing, setResizing] = useState<VmDisk | null>(null);
  const [adding, setAdding] = useState(false);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['vm-disks', vmid] });
    qc.invalidateQueries({ queryKey: ['vm', vmid] });
  };

  return (
    <div style={{ maxWidth: 800, margin: '2rem auto', padding: '0 1rem' }}>
      <Link to={`/vms/${vmid}`} className="navlink">← voltar</Link>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '1rem' }}>
        <h1>Discos — VM #{vmid}</h1>
        <button onClick={() => setAdding(true)}>+ Novo disco</button>
      </div>

      {disks.isLoading && <p>Carregando…</p>}
      {disks.data && disks.data.length > 0 && (
        <table>
          <thead><tr><th>Disco</th><th>Interface</th><th>Storage</th><th>Tamanho</th><th></th></tr></thead>
          <tbody>
            {disks.data.map((d) => (
              <tr key={d.key}>
                <td>{d.key}</td>
                <td>{d.interface}</td>
                <td>{d.storage}</td>
                <td>{d.sizeGB} GB</td>
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
  const [sizeGB, setSizeGB] = useState(String(disk.sizeGB));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const valid = Number(sizeGB) > disk.sizeGB;

  const submit = async () => {
    setBusy(true); setError('');
    try { await api.resizeDisk(vmid, disk.key, Number(sizeGB)); onDone(); }
    catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="box" style={{ flexDirection: 'column', alignItems: 'stretch', minWidth: 340 }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 .3rem' }}>Redimensionar {disk.key}</h3>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '.35rem' }}>Novo tamanho (GB)
          <input type="number" min={disk.sizeGB + 1} value={sizeGB} onChange={(e) => setSizeGB(e.target.value)} />
        </label>
        <p style={{ fontSize: '.85rem', opacity: .8 }}>
          Depois de redimensionar, o filesystem dentro da VM ainda precisa ser crescido manualmente
          (ex.: resize2fs ou growpart).
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
  const [sizeGB, setSizeGB] = useState('10');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const valid = Number(sizeGB) > 0;

  const submit = async () => {
    setBusy(true); setError('');
    try { await api.addDisk(vmid, Number(sizeGB)); onDone(); }
    catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="box" style={{ flexDirection: 'column', alignItems: 'stretch', minWidth: 340 }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 .3rem' }}>Novo disco</h3>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '.35rem' }}>Tamanho (GB)
          <input type="number" min={1} value={sizeGB} onChange={(e) => setSizeGB(e.target.value)} />
        </label>
        {error && <p className="error">{error}</p>}
        <div style={{ display: 'flex', gap: '.5rem', marginTop: '.5rem' }}>
          <button disabled={!valid || busy} onClick={submit}>{busy ? <><span className="spinner" /> Criando…</> : 'Adicionar disco'}</button>
          <button style={{ background: '#2d3746' }} onClick={onClose}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}
