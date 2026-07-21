import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthProvider } from '../src/auth.js';
import { Login } from '../src/pages/Login.js';
import { api } from '../src/api.js';

vi.mock('../src/api.js', () => ({
  api: { me: vi.fn().mockRejectedValue(new Error('401')), login: vi.fn() },
}));

describe('Login', () => {
  beforeEach(() => vi.clearAllMocks());
  it('mostra erro quando login falha', async () => {
    (api.login as any).mockRejectedValueOnce(new Error('usuário ou senha inválidos'));
    render(<AuthProvider><Login /></AuthProvider>);
    await userEvent.type(screen.getByLabelText('Usuário'), 'alice');
    await userEvent.type(screen.getByLabelText('Senha'), 'x');
    await userEvent.click(screen.getByRole('button'));
    expect(await screen.findByRole('alert')).toHaveTextContent('inválidos');
  });
});
