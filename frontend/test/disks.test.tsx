import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { Disks } from '../src/pages/Disks.js';

vi.mock('../src/api.js', () => ({
  api: {
    disks: vi.fn().mockResolvedValue([
      { key: 'scsi0', interface: 'scsi', sizeGB: 32, storage: 'local-zfs' },
      { key: 'scsi2', interface: 'scsi', sizeGB: 180, storage: 'local-zfs' },
    ]),
    resizeDisk: vi.fn().mockResolvedValue({ ok: true }),
    addDisk: vi.fn().mockResolvedValue({ key: 'scsi1', interface: 'scsi', sizeGB: 50, storage: 'local-zfs' }),
    diskStorage: vi.fn().mockResolvedValue({ storage: 'local-zfs', totalGB: 500, usedGB: 230, availGB: 270 }),
    vmStorage: vi.fn().mockResolvedValue({ storage: 'local-zfs', totalGB: 500, usedGB: 230, availGB: 270 }),
  },
}));

function wrap() {
  return (
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={['/vms/101/discos']}>
        <Routes><Route path="/vms/:id/discos" element={<Disks />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('Disks', () => {
  it('lista os discos da VM', async () => {
    render(wrap());
    expect(await screen.findByText('scsi0')).toBeInTheDocument();
    expect(screen.getByText('scsi2')).toBeInTheDocument();
  });

  it('redimensiona um disco somando o incremento ao tamanho atual, com preview em tempo real', async () => {
    const { api } = await import('../src/api.js');
    render(wrap());
    await screen.findByText('scsi0');
    await userEvent.click(screen.getAllByRole('button', { name: /redimensionar/i })[0]);
    await screen.findByText(/usados no storage/i);
    const input = screen.getByLabelText(/aumentar em/i);
    await userEvent.clear(input);
    await userEvent.type(input, '32');
    expect(await screen.findByText((_, el) => el?.tagName === 'B' && el.textContent === '64 GB')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /confirmar/i }));
    expect(api.resizeDisk).toHaveBeenCalledWith(101, 'scsi0', 64);
  });

  it('mostra uma sombra na barra de storage refletindo o incremento pendente', async () => {
    const { container } = render(wrap());
    await screen.findByText('scsi0');
    await userEvent.click(screen.getAllByRole('button', { name: /redimensionar/i })[0]);
    await screen.findByText(/usados no storage/i);
    expect(container.querySelectorAll('.gauge .gauge-fill')).toHaveLength(1);
    const input = screen.getByLabelText(/aumentar em/i);
    await userEvent.clear(input);
    await userEvent.type(input, '32');
    expect(container.querySelectorAll('.gauge .gauge-fill')).toHaveLength(2);
  });

  it('anexa um disco novo com o tamanho total informado, mostrando a barra de storage', async () => {
    const { api } = await import('../src/api.js');
    render(wrap());
    await screen.findByText('scsi0');
    await userEvent.click(screen.getByRole('button', { name: /novo disco/i }));
    await screen.findByText(/usados no storage/i);
    const input = screen.getByLabelText(/tamanho \(gb\)/i);
    await userEvent.clear(input);
    await userEvent.type(input, '50');
    await userEvent.click(screen.getByRole('button', { name: /adicionar disco/i }));
    expect(api.addDisk).toHaveBeenCalledWith(101, 50);
  });
});
