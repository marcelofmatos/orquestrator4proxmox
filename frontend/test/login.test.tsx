import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from '../src/auth.js';
import { Login } from '../src/pages/Login.js';
import { api } from '../src/api.js';

vi.mock('../src/api.js', () => ({
  api: {
    me: vi.fn().mockRejectedValue(new Error('401')),
    login: vi.fn(),
    config: vi.fn().mockResolvedValue({ brand: 'orquestrator4proxmox' }),
  },
}));

describe('Login', () => {
  beforeEach(() => vi.clearAllMocks());
  it('mostra erro quando login falha', async () => {
    (api.login as any).mockRejectedValueOnce(new Error('usuário ou senha inválidos'));
    render(<AuthProvider><MemoryRouter><Login /></MemoryRouter></AuthProvider>);
    await userEvent.type(screen.getByLabelText('Usuário'), 'alice');
    await userEvent.type(screen.getByLabelText('Senha'), 'x');
    await userEvent.click(screen.getByRole('button'));
    expect(await screen.findByRole('alert')).toHaveTextContent('inválidos');
  });
  it('redireciona para o dashboard ao logar com sucesso', async () => {
    (api.login as any).mockResolvedValueOnce({ username: 'marcelo', groups: [] });
    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/login']}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<div>DASHBOARD</div>} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    );
    await userEvent.type(screen.getByLabelText('Usuário'), 'marcelo');
    await userEvent.type(screen.getByLabelText('Senha'), 'x');
    await userEvent.click(screen.getByRole('button'));
    expect(await screen.findByText('DASHBOARD')).toBeInTheDocument();
  });
});
