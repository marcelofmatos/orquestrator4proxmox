import { useEffect, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';

export function CreateSimple() {
  const nav = useNavigate();
  const templates = useQuery({ queryKey: ['templates'], queryFn: api.templates });
  const [templateId, setTemplateId] = useState<number | ''>('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const sorted = [...(templates.data ?? [])].sort((a, b) => b.vmid - a.vmid);
  const nameValid = /^[a-zA-Z0-9-]+$/.test(name);

  useEffect(() => {
    if (templateId === '' && templates.data && templates.data.length > 0) {
      const ordered = [...templates.data].sort((a, b) => b.vmid - a.vmid);
      const last = Number(localStorage.getItem('o4p_last_template'));
      setTemplateId((ordered.find((t) => t.vmid === last) ?? ordered[0]).vmid);
    }
  }, [templates.data]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (templateId === '' || !nameValid) return;
    setBusy(true); setError('');
    try {
      const r = await api.create({ templateId: Number(templateId), name, start: true });
      localStorage.setItem('o4p_last_template', String(templateId));
      nav(`/vms/${r.vmid}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ maxWidth: 900, margin: '2rem auto', padding: '0 1rem' }}>
      <Link to="/">← voltar</Link>
      {busy && (
        <div className="overlay"><div className="box">
          <span className="spinner lg" /> Criando a VM… isso pode levar alguns segundos.
        </div></div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '1rem' }}>
        <h1 style={{ margin: '.4rem 0' }}>Nova VM</h1>
        <Link to="/vms/new/avancado">Criação avançada →</Link>
      </div>
      <p style={{ color: '#8b97a7', marginTop: 0 }}>Escolha um modelo e dê um nome à VM.</p>

      <form onSubmit={submit}>
        <div className="tpl-grid">
          {sorted.map((t) => (
            <button
              key={t.vmid}
              type="button"
              className={`tpl-card${templateId === t.vmid ? ' selected' : ''}`}
              onClick={() => setTemplateId(t.vmid)}
              aria-pressed={templateId === t.vmid}
            >
              <strong>{t.name}</strong>
              <span className="tpl-id">#{t.vmid}</span>
              <p className="tpl-desc">{t.description?.trim() || 'Sem descrição (campo Notes do Proxmox).'}</p>
            </button>
          ))}
        </div>
        {templates.isLoading && <p>Carregando modelos…</p>}
        {templates.data?.length === 0 && <p>Nenhum template disponível no Proxmox.</p>}

        <div className="card" style={{ marginTop: '1.2rem' }}>
          <label>Nome da VM
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="letras, números e hífen" autoFocus />
          </label>
          {name && !nameValid && <p className="error">Nome inválido: use apenas letras, números e hífen.</p>}
          {error && <p className="error">{error}</p>}
          <button disabled={busy || templateId === '' || !nameValid}>
            {busy ? <><span className="spinner" /> Criando…</> : 'Criar VM'}
          </button>
        </div>
      </form>
    </div>
  );
}
