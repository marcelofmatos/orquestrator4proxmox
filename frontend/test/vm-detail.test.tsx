import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { VmDetail } from '../src/pages/VmDetail.js';

vi.mock('../src/api.js', () => ({
  api: {
    vm: vi.fn().mockResolvedValue({ vmid: 101, name: 'c1', status: { status: 'stopped' }, config: { cores: 2, memory: '2048', description: '## Plano Dedicado\n\nCliente **Acme** — suporte 24x7' }, node: 'n1' }),
    disks: vi.fn().mockResolvedValue([
      { key: 'scsi0', interface: 'scsi', sizeGB: 32, storage: 'local-zfs' },
      { key: 'scsi2', interface: 'scsi', sizeGB: 180, storage: 'local-zfs' },
    ]),
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
  beforeEach(() => vi.clearAllMocks());

  it('mostra as notas da VM renderizadas como markdown', async () => {
    render(wrap());
    const h = await screen.findByText('Plano Dedicado');
    expect(h.tagName).toBe('H2');
    expect(screen.getByText('Acme').tagName).toBe('STRONG');
    expect(screen.queryByText(/## Plano Dedicado/)).toBeNull();
  });
  it('liga a VM após confirmar', async () => {
    const { api } = await import('../src/api.js');
    render(wrap());
    await screen.findByText('c1');
    await userEvent.click(screen.getByRole('button', { name: 'Ligar' }));
    const dialog = screen.getByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Ligar' }));
    expect(api.action).toHaveBeenCalledWith(101, 'start');
  });

  it('usa o nome amigável "Desligamento seguro" no lugar de "Encerrar (ACPI)"', async () => {
    render(wrap());
    await screen.findByText('c1');
    expect(screen.getByRole('button', { name: 'Desligamento seguro' })).toBeInTheDocument();
    expect(screen.queryByText(/Encerrar \(ACPI\)/)).toBeNull();
  });

  it('explica e pede confirmação antes de forçar o desligamento', async () => {
    const { api } = await import('../src/api.js');
    render(wrap());
    await screen.findByText('c1');
    await userEvent.click(screen.getByRole('button', { name: 'Forçar desligamento' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/perda ou corrupção de dados/i)).toBeInTheDocument();
    expect(api.action).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Forçar desligamento' }));
    expect(api.action).toHaveBeenCalledWith(101, 'stop');
  });

  it('cancelar não dispara a ação e fecha o diálogo', async () => {
    const { api } = await import('../src/api.js');
    render(wrap());
    await screen.findByText('c1');
    await userEvent.click(screen.getByRole('button', { name: 'Reiniciar' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancelar' }));
    expect(api.action).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('mostra o total de espaço em disco somando todos os discos', async () => {
    render(wrap());
    await screen.findByText('c1');
    expect(await screen.findByText('212 GB')).toBeInTheDocument();
    expect(screen.getByText('(2 discos)')).toBeInTheDocument();
  });
});
