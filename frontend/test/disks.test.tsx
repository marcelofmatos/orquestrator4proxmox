import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { Disks } from '../src/pages/Disks.js';

vi.mock('../src/api.js', () => ({
  api: {
    vm: vi.fn().mockResolvedValue({ vmid: 101, name: 'alemartiadv', node: 'sp1-sd-nhw-1', status: { status: 'running' } }),
    disks: vi.fn().mockResolvedValue([
      { key: 'scsi0', interface: 'scsi', sizeGB: 32, storage: 'local-zfs' },
      { key: 'scsi2', interface: 'scsi', sizeGB: 180, storage: 'local-zfs' },
    ]),
    disksUsage: vi.fn().mockResolvedValue([
      { key: 'scsi0', usedGB: 4.7, fsTotalGB: 9.2, usedPct: 51, mounts: ['/'] },
      { key: 'scsi2', usedGB: 7.4, fsTotalGB: 100, usedPct: 7, mounts: ['/home'] },
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

  it('mostra o nome do host no título e o uso real por disco', async () => {
    render(wrap());
    // título traz o nome do host, não só o VMID
    expect(await screen.findByRole('heading', { name: /alemartiadv/i })).toBeInTheDocument();
    // uso por disco do guest agent (used/total · %)
    expect(await screen.findByText((t) => t.includes('5 GB') && t.includes('9 GB'))).toBeInTheDocument();
    expect(screen.getByText('51%')).toBeInTheDocument();
  });

  it('sinaliza quando o guest agent não devolve uso para um disco', async () => {
    const { api } = await import('../src/api.js');
    (api.disksUsage as any).mockResolvedValueOnce([
      { key: 'scsi0', usedGB: 4.7, fsTotalGB: 9.2, usedPct: 51, mounts: ['/'] },
      // scsi2 ausente → deve aparecer o aviso de agente indisponível para esse disco
    ]);
    render(wrap());
    await screen.findByText('scsi2');
    expect(await screen.findByText(/sem dados do agente/i)).toBeInTheDocument();
  });

  it('mostra "VM desligada" no uso quando a VM está parada', async () => {
    const { api } = await import('../src/api.js');
    (api.vm as any).mockResolvedValueOnce({ vmid: 101, name: 'alemartiadv', node: 'sp1-sd-nhw-1', status: { status: 'stopped' } });
    (api.disksUsage as any).mockResolvedValueOnce([]); // VM parada → agent não responde
    render(wrap());
    await screen.findByText('scsi0');
    expect(await screen.findAllByText(/vm desligada/i)).not.toHaveLength(0);
    expect(screen.queryByText(/sem dados do agente/i)).not.toBeInTheDocument();
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
    // escopo no overlay: a tabela também tem gauges (uso por disco), fora do modal
    expect(container.querySelectorAll('.overlay .gauge .gauge-fill')).toHaveLength(1);
    const input = screen.getByLabelText(/aumentar em/i);
    await userEvent.clear(input);
    await userEvent.type(input, '32');
    expect(container.querySelectorAll('.overlay .gauge .gauge-fill')).toHaveLength(2);
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
