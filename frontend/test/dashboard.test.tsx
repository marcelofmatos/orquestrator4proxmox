import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { Dashboard } from '../src/pages/Dashboard.js';

vi.mock('../src/api.js', () => ({
  api: {
    dashboard: vi.fn().mockResolvedValue({ total: 2, running: 1, stopped: 1, allocatedVcpu: 6, allocatedMemMB: 12288 }),
    vms: vi.fn().mockResolvedValue([
      { vmid: 101, name: 'c1', status: 'running', node: 'n1', maxcpu: 4, maxmem: 8589934592 },
      { vmid: 102, name: 'c2', status: 'stopped', node: 'n1', maxcpu: 2, maxmem: 4294967296 },
    ]),
  },
}));
vi.mock('../src/auth.js', () => ({ useAuth: () => ({ user: { username: 'alice', groups: [] }, logout: vi.fn() }) }));

function wrap(ui: React.ReactNode) {
  return <QueryClientProvider client={new QueryClient()}><MemoryRouter>{ui}</MemoryRouter></QueryClientProvider>;
}

describe('Dashboard', () => {
  it('renderiza contadores e a lista de VMs', async () => {
    render(wrap(<Dashboard />));
    expect(await screen.findByText('c1')).toBeInTheDocument();
    expect(screen.getByText('c2')).toBeInTheDocument();
    expect(screen.getByText('Total')).toBeInTheDocument();
  });
});
