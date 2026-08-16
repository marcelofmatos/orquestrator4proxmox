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
    growFilesystem: vi.fn().mockResolvedValue({ grown: true, key: 'scsi0', mountpoint: '/var', beforeGB: 32, afterGB: 64 }),
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

  it('com o checkbox ligado, expande o filesystem após redimensionar', async () => {
    const { api } = await import('../src/api.js');
    render(wrap());
    await screen.findByText('scsi0');
    await userEvent.click(screen.getAllByRole('button', { name: /redimensionar/i })[0]);
    await screen.findByText(/usados no storage/i);
    const input = screen.getByLabelText(/aumentar em/i);
    await userEvent.clear(input);
    await userEvent.type(input, '32');
    await userEvent.click(screen.getByRole('button', { name: /confirmar/i }));
    expect(api.resizeDisk).toHaveBeenCalledWith(101, 'scsi0', 64);
    expect(api.growFilesystem).toHaveBeenCalledWith(101, 'scsi0');
  });

  it('com o checkbox desligado, NÃO expande o filesystem', async () => {
    const { api } = await import('../src/api.js');
    (api.growFilesystem as any).mockClear();
    render(wrap());
    await screen.findByText('scsi0');
    await userEvent.click(screen.getAllByRole('button', { name: /redimensionar/i })[0]);
    await screen.findByText(/usados no storage/i);
    await userEvent.click(screen.getByLabelText(/expandir o filesystem/i)); // desmarca
    const input = screen.getByLabelText(/aumentar em/i);
    await userEvent.clear(input);
    await userEvent.type(input, '32');
    await userEvent.click(screen.getByRole('button', { name: /confirmar/i }));
    expect(api.resizeDisk).toHaveBeenCalled();
    expect(api.growFilesystem).not.toHaveBeenCalled();
  });

  it('mostra "Expandir FS" quando o disco tem sobra e chama growFilesystem', async () => {
    const { api } = await import('../src/api.js');
    (api.growFilesystem as any).mockClear();
    (api.disks as any).mockResolvedValueOnce([{ key: 'scsi2', interface: 'scsi', sizeGB: 80, storage: 'local-zfs' }]);
    (api.disksUsage as any).mockResolvedValueOnce([{ key: 'scsi2', usedGB: 7, fsTotalGB: 40, usedPct: 18, mounts: ['/home'] }]);
    render(wrap());
    await screen.findByText('scsi2');
    const btn = await screen.findByRole('button', { name: /expandir fs/i });
    await userEvent.click(btn);
    expect(api.growFilesystem).toHaveBeenCalledWith(101, 'scsi2');
  });

  it('não mostra "Expandir FS" quando o FS já preenche o disco', async () => {
    const { api } = await import('../src/api.js');
    (api.disks as any).mockResolvedValueOnce([{ key: 'scsi0', interface: 'scsi', sizeGB: 40, storage: 'local-zfs' }]);
    (api.disksUsage as any).mockResolvedValueOnce([{ key: 'scsi0', usedGB: 10, fsTotalGB: 40, usedPct: 25, mounts: ['/'] }]);
    render(wrap());
    await screen.findByText('scsi0');
    expect(screen.queryByRole('button', { name: /expandir fs/i })).not.toBeInTheDocument();
  });

  it('Expandir FS que falha mostra o motivo ao usuário', async () => {
    const { api } = await import('../src/api.js');
    (api.growFilesystem as any).mockResolvedValueOnce({ grown: false, key: 'scsi2', reason: 'particionado ou LVM' });
    (api.disks as any).mockResolvedValueOnce([{ key: 'scsi2', interface: 'scsi', sizeGB: 80, storage: 'local-zfs' }]);
    (api.disksUsage as any).mockResolvedValueOnce([{ key: 'scsi2', usedGB: 7, fsTotalGB: 40, usedPct: 18, mounts: ['/home'] }]);
    render(wrap());
    await screen.findByText('scsi2');
    await userEvent.click(await screen.findByRole('button', { name: /expandir fs/i }));
    expect(await screen.findByText(/particionado ou LVM/i)).toBeInTheDocument();
  });
});
