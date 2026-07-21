import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { VmDetail } from '../src/pages/VmDetail.js';

vi.mock('../src/api.js', () => ({
  api: {
    vm: vi.fn().mockResolvedValue({ vmid: 101, name: 'c1', status: { status: 'stopped' }, config: { cores: 2, memory: '2048', description: '## Plano Dedicado\n\nCliente **Acme** — suporte 24x7' }, node: 'n1' }),
    action: vi.fn().mockResolvedValue({ upid: 'UPID' }),
    remove: vi.fn(),
  },
}));

function wrap() {
  return (
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={["/vms/101"]}>
        <Routes><Route path="/vms/:id" element={<VmDetail />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('VmDetail', () => {
  it('mostra as notas da VM renderizadas como markdown', async () => {
    render(wrap());
    const h = await screen.findByText('Plano Dedicado');
    expect(h.tagName).toBe('H2');
    expect(screen.getByText('Acme').tagName).toBe('STRONG');
    expect(screen.queryByText(/## Plano Dedicado/)).toBeNull();
  });
  it('liga a VM', async () => {
    const { api } = await import('../src/api.js');
    render(wrap());
    await screen.findByText('c1');
    await userEvent.click(screen.getByRole('button', { name: /ligar/i }));
    expect(api.action).toHaveBeenCalledWith(101, 'start');
  });
});
