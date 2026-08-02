import { useEffect, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { api, type Template } from '../api.js';
import { isValidHostname, normalizeHostname, HOSTNAME_HINT } from '../hostname.js';

/** ordem alfabética pelo nome, com números naturais (kvm2 antes de kvm10) */
const byName = (a: Template, b: Template) =>
  (a.name ?? '').localeCompare(b.name ?? '', 'pt-BR', { numeric: true, sensitivity: 'base' });

export function CreateSimple() {
  const nav = useNavigate();
  const templates = useQuery({ queryKey: ['templates'], queryFn: api.templates });
  const [templateId, setTemplateId] = useState<number | ''>('');
  const [name, setName] = useState('');
  const [plan, setPlan] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const sorted = [...(templates.data ?? [])].sort(byName);
  const nameValid = isValidHostname(name);
  const selected = sorted.find((t) => t.vmid === templateId);
  const planNames = Object.keys(selected?.plans ?? {});

  useEffect(() => {
    if (templateId === '' && templates.data && templates.data.length > 0) {
      const ordered = [...templates.data].sort(byName);
      const last = Number(localStorage.getItem('o4p_last_template'));
      setTemplateId((ordered.find((t) => t.vmid === last) ?? ordered[0]).vmid);
    }
  }, [templates.data]);

  // ao trocar de template, seleciona o 1º plano dele (ou nenhum, se o template não tiver planos)
  useEffect(() => {
    setPlan((cur) => (planNames.includes(cur) ? cur : (planNames[0] ?? '')));
  }, [templateId, templates.data]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (templateId === '' || !nameValid) return;
    setBusy(true); setError('');
    try {
      const r = await api.create({ templateId: Number(templateId), name, plan: plan || undefined, start: true });
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

        {planNames.length > 0 && (
          <div className="card" style={{ marginTop: '1.2rem' }}>
            <label style={{ marginBottom: '.4rem', display: 'block' }}>Plano (recursos)</label>
            <div className="tpl-grid">
              {planNames.map((pn) => {
                const p = selected!.plans![pn];
                return (
                  <label key={pn} className={`tpl-card${plan === pn ? ' selected' : ''}`}>
                    <input
                      type="radio"
                      name="plan"
                      className="sr-only"
                      value={pn}
                      checked={plan === pn}
                      onChange={() => setPlan(pn)}
                    />
                    <span className="tpl-head"><span className="tpl-name">{p.label || pn}</span></span>
                    <div className="tpl-desc">
                      {p.desc && <div>{p.desc}</div>}
                      <div style={{ color: '#8b97a7', marginTop: p.desc ? '.35rem' : 0 }}>
                        {p.cores} vCPU · {Math.round(p.memoryMB / 1024)} GB RAM · {p.homeGB} GB disco
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        )}

        <div className="card" style={{ marginTop: '1.2rem' }}>
          <label>Nome da VM (hostname)
            <input value={name} onChange={(e) => setName(normalizeHostname(e.target.value))} placeholder="ex.: cliente-web-01" autoFocus />
          </label>
          {name && !nameValid && <p className="error">Nome inválido: {HOSTNAME_HINT}.</p>}
          {error && <p className="error">{error}</p>}
          <button disabled={busy || templateId === '' || !nameValid}>
            {busy ? <><span className="spinner" /> Criando…</> : 'Criar VM'}
          </button>
        </div>
      </form>
    </div>
  );
}
