import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { Historico } from '../src/pages/Historico.js';

vi.mock('../src/api.js', () => ({ api: { history: vi.fn() } }));

function wrap() {
  return (
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={["/vms/101/historico"]}>
        <Routes><Route path="/vms/:id/historico" element={<Historico />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('Historico', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renderiza os eventos com rótulo, quem e status', async () => {
    const { api } = await import('../src/api.js');
    (api.history as any).mockResolvedValue([
      { upid: 'b', type: 'qmshutdown', label: 'Desligamento seguro', status: 'running', running: true, ok: false, user: 'root@pam', starttime: 200, endtime: null, durationSec: null },
      { upid: 'a', type: 'qmstart', label: 'Ligou', status: 'OK', running: false, ok: true, user: 'root@pam', starttime: 100, endtime: 105, durationSec: 5 },
    ]);
    render(wrap());
    expect(await screen.findByText('Desligamento seguro')).toBeInTheDocument();
    expect(screen.getByText('Ligou')).toBeInTheDocument();
    expect(screen.getByText('em execução')).toBeInTheDocument();
    expect(screen.getAllByText('root@pam').length).toBeGreaterThan(0);
  });

  it('mostra estado vazio quando não há eventos', async () => {
    const { api } = await import('../src/api.js');
    (api.history as any).mockResolvedValue([]);
    render(wrap());
    expect(await screen.findByText(/nenhuma ação registrada/i)).toBeInTheDocument();
  });

  it('"Carregar mais" busca a próxima página com limit maior', async () => {
    const { api } = await import('../src/api.js');
    const page = Array.from({ length: 50 }, (_, i) => ({
      upid: `u${i}`, type: 'qmstart', label: 'Ligou', status: 'OK', running: false, ok: true,
      user: 'root@pam', starttime: 1000 - i, endtime: 1001 - i, durationSec: 1,
    }));
    (api.history as any).mockResolvedValue(page);
    render(wrap());
    await screen.findAllByText('Ligou');
    await userEvent.click(screen.getByRole('button', { name: /carregar mais/i }));
    expect(api.history).toHaveBeenLastCalledWith(101, { limit: 100 });
  });
});
