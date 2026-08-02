import { useEffect, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, Link } from 'react-router-dom';
import { api, type Template } from '../api.js';
import { isValidHostname, normalizeHostname, HOSTNAME_HINT } from '../hostname.js';

/** ordem alfabética pelo nome, com números naturais (kvm2 antes de kvm10) */
const byName = (a: Template, b: Template) =>
  (a.name ?? '').localeCompare(b.name ?? '', 'pt-BR', { numeric: true, sensitivity: 'base' });

export function CreateWizard() {
  const nav = useNavigate();
  const templates = useQuery({ queryKey: ['templates'], queryFn: api.templates });
  const [templateId, setTemplateId] = useState<number | ''>('');
  const [name, setName] = useState('');
  const [cores, setCores] = useState('');
  const [memoryMB, setMemoryMB] = useState('');
  const [diskGB, setDiskGB] = useState('');
  const [netMode, setNetMode] = useState<'dhcp' | 'static'>('dhcp');
  const [ip, setIp] = useState('');
  const [gateway, setGateway] = useState('');
  const [ciuser, setCiuser] = useState('');
  const [cipassword, setCipassword] = useState('');
  const [sshkey, setSshkey] = useState('');
  const [start, setStart] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (templateId === '' && templates.data && templates.data.length > 0) {
      const sorted = [...templates.data].sort(byName);
      const last = Number(localStorage.getItem('o4p_last_template'));
      const pick = sorted.find((t) => t.vmid === last) ?? sorted[0];
      setTemplateId(pick.vmid);
    }
  }, [templates.data]);

  const nameValid = isValidHostname(name);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (templateId === '' || !nameValid) return;
    setBusy(true); setError('');
    try {
      const body: Record<string, unknown> = { templateId: Number(templateId), name, start };
      if (cores) body.cores = Number(cores);
      if (memoryMB) body.memoryMB = Number(memoryMB);
      if (diskGB) body.diskGB = Number(diskGB);
      body.net = netMode === 'dhcp' ? { mode: 'dhcp' } : { mode: 'static', ip, gateway: gateway || undefined };
      if (ciuser) body.ciuser = ciuser;
      if (cipassword) body.cipassword = cipassword;
      if (sshkey) body.sshkey = sshkey;
      const r = await api.create(body);
      localStorage.setItem('o4p_last_template', String(templateId)); // lembra o último template usado
      nav(`/vms/${r.vmid}`);
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <div style={{ maxWidth: 620, margin: '2rem auto', padding: '0 1rem' }}>
      <Link to="/" className="navlink">← voltar</Link>
      {busy && (
        <div className="overlay"><div className="box">
          <span className="spinner lg" /> Criando a VM… isso pode levar alguns segundos.
        </div></div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '1rem' }}>
        <h1>Nova VM (avançado)</h1>
        <Link to="/vms/new" className="ghost-btn">← modo simples</Link>
      </div>
      <form onSubmit={submit} className="card">
        <label>Template
          <select value={templateId} onChange={(e) => setTemplateId(e.target.value ? Number(e.target.value) : '')}>
            <option value="">selecione…</option>
            {[...(templates.data ?? [])].sort(byName).map((t) => (
              <option key={t.vmid} value={t.vmid}>{`#${t.vmid} — ${t.name}`}</option>
            ))}
          </select>
        </label>
        <label>Nome (hostname)
          <input value={name} onChange={(e) => setName(normalizeHostname(e.target.value))} placeholder="ex.: cliente-web-01" />
        </label>
        {name && !nameValid && <p className="error">Nome inválido: {HOSTNAME_HINT}.</p>}
        <div style={{ display: 'flex', gap: '.75rem' }}>
          <label style={{ flex: 1 }}>vCPU<input value={cores} onChange={(e) => setCores(e.target.value)} type="number" min="1" placeholder="padrão do template" /></label>
          <label style={{ flex: 1 }}>RAM (MB)<input value={memoryMB} onChange={(e) => setMemoryMB(e.target.value)} type="number" min="256" placeholder="padrão" /></label>
          <label style={{ flex: 1 }}>Disco (GB)<input value={diskGB} onChange={(e) => setDiskGB(e.target.value)} type="number" min="1" placeholder="crescer p/" /></label>
        </div>
        <label>Rede
          <select value={netMode} onChange={(e) => setNetMode(e.target.value as 'dhcp' | 'static')}>
            <option value="dhcp">DHCP</option><option value="static">IP fixo</option>
          </select>
        </label>
        {netMode === 'static' && (
          <div style={{ display: 'flex', gap: '.75rem' }}>
            <label style={{ flex: 2 }}>IP/CIDR<input value={ip} onChange={(e) => setIp(e.target.value)} placeholder="10.0.0.10/24" /></label>
            <label style={{ flex: 2 }}>Gateway<input value={gateway} onChange={(e) => setGateway(e.target.value)} placeholder="10.0.0.1" /></label>
          </div>
        )}
        <label>Usuário cloud-init<input value={ciuser} onChange={(e) => setCiuser(e.target.value)} placeholder="opcional" /></label>
        <label>Senha cloud-init<input type="password" value={cipassword} onChange={(e) => setCipassword(e.target.value)} placeholder="opcional" /></label>
        <label>Chave SSH<textarea value={sshkey} onChange={(e) => setSshkey(e.target.value)} placeholder="ssh-ed25519 … (opcional)" rows={2} /></label>
        <label style={{ flexDirection: 'row', alignItems: 'center', gap: '.5rem' }}>
          <input type="checkbox" checked={start} onChange={(e) => setStart(e.target.checked)} style={{ width: 'auto' }} /> Iniciar após criar
        </label>
        {error && <p className="error">{error}</p>}
        <button disabled={busy || templateId === '' || !nameValid}>{busy ? <><span className="spinner" /> Criando…</> : 'Criar VM'}</button>
      </form>
    </div>
  );
}
