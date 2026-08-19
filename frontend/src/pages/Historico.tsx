import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';

function fmtAgo(sec: number): string {
  if (sec < 60) return 'há instantes';
  const m = Math.floor(sec / 60); if (m < 60) return `há ${m}min`;
  const h = Math.floor(m / 60); if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24); return `há ${d}d`;
}
function fmtWhen(sec: number): string {
  const abs = new Date(sec * 1000).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
  return `${abs} (${fmtAgo(Math.floor(Date.now() / 1000) - sec)})`;
}
function fmtDur(sec: number | null): string {
  if (sec == null) return '';
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60), s = sec % 60;
  if (m < 60) return s ? `${m}m ${s}s` : `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

export function Historico() {
  const { id } = useParams();
  const vmid = Number(id);
  const [limit, setLimit] = useState(50);
  const q = useQuery({ queryKey: ['historico', vmid, limit], queryFn: () => api.history(vmid, { limit }) });
  const items = q.data ?? [];
  const hasMore = items.length === limit;

  return (
    <div style={{ maxWidth: 900, margin: '2rem auto', padding: '0 1rem' }}>
      <Link to={`/vms/${vmid}`} className="navlink">← voltar</Link>
      <h1 style={{ margin: '.5rem 0 1rem' }}>Histórico</h1>

      {q.isLoading && <p>Carregando…</p>}
      {q.isError && <p className="error">Não foi possível carregar o histórico.</p>}
      {q.data && items.length === 0 && <p style={{ color: '#8b97a7' }}>Nenhuma ação registrada para esta VM.</p>}

      {items.length > 0 && (
        <ul className="timeline">
          {items.map((e) => {
            const kind = e.running ? 'run' : e.ok ? 'ok' : 'err';
            return (
              <li key={e.upid} className="tl-item">
                <span className={`tl-dot ${kind}`} />
                <div className="tl-body">
                  <div className="tl-head">
                    <b>{e.label}</b>
                    <span className={`tl-status ${kind}`} title={e.status}>
                      {e.running ? 'em execução' : e.ok ? 'OK' : e.status}
                    </span>
                  </div>
                  <div className="tl-meta">
                    <span>{e.user}</span> · {fmtWhen(e.starttime)}{e.durationSec != null ? ` · ${fmtDur(e.durationSec)}` : ''}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {hasMore && (
        <button className="ghost-btn" style={{ marginTop: '1rem' }} disabled={q.isFetching}
          onClick={() => setLimit((l) => l + 50)}>
          {q.isFetching ? <><span className="spinner" /> Carregando…</> : 'Carregar mais'}
        </button>
      )}
    </div>
  );
}
