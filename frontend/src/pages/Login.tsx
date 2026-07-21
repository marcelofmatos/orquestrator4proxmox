import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth.js';

export function Login() {
  const { user, login, brand } = useAuth();
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
  // já autenticado (ou logou agora) → sai da tela de login
  if (user) return <Navigate to="/" replace />;
  return (
    <div className="login">
      <form onSubmit={onSubmit} className="card">
        <h1>{brand}</h1>
        <label>Usuário<input value={username} onChange={(e) => setU(e.target.value)} autoFocus /></label>
        <label>Senha<input type="password" value={password} onChange={(e) => setP(e.target.value)} /></label>
        {error && <p role="alert" className="error">{error}</p>}
        <button disabled={busy || !username || !password}>{busy ? 'Entrando…' : 'Entrar'}</button>
      </form>
    </div>
  );
}
