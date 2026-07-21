import { useEffect, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { api, type Template } from '../api.js';

/** ordem alfabética pelo nome, com números naturais (kvm2 antes de kvm10) */
const byName = (a: Template, b: Template) =>
  (a.name ?? '').localeCompare(b.name ?? '', 'pt-BR', { numeric: true, sensitivity: 'base' });

export function CreateSimple() {
  const nav = useNavigate();
  const templates = useQuery({ queryKey: ['templates'], queryFn: api.templates });
  const [templateId, setTemplateId] = useState<number | ''>('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const sorted = [...(templates.data ?? [])].sort(byName);
  const nameValid = /^[a-zA-Z0-9-]+$/.test(name);

  useEffect(() => {
    if (templateId === '' && templates.data && templates.data.length > 0) {
      const ordered = [...templates.data].sort(byName);
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
            <label key={t.vmid} className={`tpl-card${templateId === t.vmid ? ' selected' : ''}`}>
              <input
                type="radio"
                name="template"
                className="sr-only"
                value={t.vmid}
                checked={templateId === t.vmid}
                onChange={() => setTemplateId(t.vmid)}
              />
              <span className="tpl-head">
                <span className="tpl-name">{t.name}</span> <span className="tpl-id">#{t.vmid}</span>
              </span>
              <div className="tpl-desc md">
                {/* notes do Proxmox são markdown; react-markdown escapa HTML embutido */}
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {t.description?.trim() || '_Sem descrição (campo Notes do Proxmox)._'}
                </ReactMarkdown>
              </div>
            </label>
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
