import { useState, type FormEvent } from 'react';
import { useAuth } from '../auth.js';

export function Login() {
  const { login } = useAuth();
  const [username, setU] = useState('');
  const [password, setP] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const onSubmit = async (e: FormEvent) => {
    e.preventDefault(); setError(''); setBusy(true);
    try { await login(username, password); }
    catch (err) { setError((err as Error).message || 'falha no login'); }
    finally { setBusy(false); }
  };
  return (
    <div className="login">
      <form onSubmit={onSubmit} className="card">
        <h1>orquestrator4proxmox</h1>
        <label>Usuário<input value={username} onChange={(e) => setU(e.target.value)} autoFocus /></label>
        <label>Senha<input type="password" value={password} onChange={(e) => setP(e.target.value)} /></label>
        {error && <p role="alert" className="error">{error}</p>}
        <button disabled={busy || !username || !password}>{busy ? 'Entrando…' : 'Entrar'}</button>
      </form>
    </div>
  );
}
