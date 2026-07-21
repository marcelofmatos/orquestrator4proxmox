import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { CreateWizard } from '../src/pages/CreateWizard.js';

vi.mock('../src/api.js', () => ({
  api: {
    templates: vi.fn().mockResolvedValue([{ vmid: 998, name: 'template-vm-v2', node: 'n1' }]),
    create: vi.fn().mockResolvedValue({ vmid: 103, node: 'n1' }),
  },
}));

function wrap(ui: React.ReactNode) {
  return <QueryClientProvider client={new QueryClient()}><MemoryRouter>{ui}</MemoryRouter></QueryClientProvider>;
}

describe('CreateWizard', () => {
  it('cria VM com template e nome', async () => {
    const { api } = await import('../src/api.js');
    render(wrap(<CreateWizard />));
    await screen.findByText('template-vm-v2');
    await userEvent.type(screen.getByLabelText('Nome'), 'clienteX');
    await userEvent.click(screen.getByRole('button', { name: /criar/i }));
    expect(api.create).toHaveBeenCalledWith(expect.objectContaining({ templateId: 998, name: 'clienteX' }));
  });
});
