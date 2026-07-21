import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { CreateSimple } from '../src/pages/CreateSimple.js';

vi.mock('../src/api.js', () => ({
  api: {
    templates: vi.fn().mockResolvedValue([
      { vmid: 900, name: 'template-vm-v5', node: 'n1', description: '**Base Debian** com docker\n\n- inclui docker\n- 4 GB RAM' },
      { vmid: 901, name: 'residente-nhw-v3', node: 'n1', description: '' },
    ]),
    create: vi.fn().mockResolvedValue({ vmid: 103, node: 'n1' }),
  },
}));

function wrap(ui: React.ReactNode) {
  return <QueryClientProvider client={new QueryClient()}><MemoryRouter>{ui}</MemoryRouter></QueryClientProvider>;
}

describe('CreateSimple', () => {
  it('mostra os templates como cards com a descrição (notes) do Proxmox', async () => {
    render(wrap(<CreateSimple />));
    expect(await screen.findByText('template-vm-v5')).toBeInTheDocument();
    expect(screen.getByText(/Sem descrição/)).toBeInTheDocument();
  });

  it('renderiza as notes do Proxmox como markdown (não texto cru)', async () => {
    render(wrap(<CreateSimple />));
    const bold = await screen.findByText('Base Debian');
    expect(bold.tagName).toBe('STRONG');
    expect(screen.getByText('inclui docker').tagName).toBe('LI');
    expect(screen.queryByText(/\*\*Base Debian\*\*/)).toBeNull();
  });

  it('cria a VM com o template escolhido no card', async () => {
    const { api } = await import('../src/api.js');
    render(wrap(<CreateSimple />));
    await screen.findByText('template-vm-v5');
    await userEvent.click(screen.getByText('residente-nhw-v3'));
    await userEvent.type(screen.getByLabelText('Nome da VM'), 'clienteX');
    await userEvent.click(screen.getByRole('button', { name: /criar vm/i }));
    expect(api.create).toHaveBeenCalledWith(expect.objectContaining({ templateId: 901, name: 'clienteX', start: true }));
  });
});
