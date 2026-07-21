import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import RFB from '@novnc/novnc';
import { api } from '../api.js';

export function Console() {
  const { id } = useParams();
  const vmid = Number(id);
  const screenRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('connecting');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    let rfb: RFB | null = null;
    let cancelled = false;
    (async () => {
      try {
        const { wsPath, password } = await api.console(vmid);
        if (cancelled || !screenRef.current) return;
        const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
        const url = `${proto}//${location.host}${wsPath}`;
        rfb = new RFB(screenRef.current, url, { credentials: { password } });
        rfb.scaleViewport = true;
        rfb.addEventListener('connect', () => setState('connected'));
        rfb.addEventListener('disconnect', (e: any) => setState(e.detail?.clean ? 'disconnected' : 'error'));
      } catch (err) { setState('error'); setMsg((err as Error).message); }
    })();
    return () => { cancelled = true; rfb?.disconnect(); };
  }, [vmid]);

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div className="topbar">
        <Link to={`/vms/${vmid}`}>← voltar</Link>
        <span>Console VM #{vmid} — {state}{msg && `: ${msg}`}</span>
      </div>
      <div ref={screenRef} style={{ flex: 1, background: '#000' }} />
    </div>
  );
}
