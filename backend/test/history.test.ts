import { describe, it, expect } from 'vitest';
import { normalizeHistory, taskLabel } from '../src/vms/history.js';

describe('taskLabel', () => {
  it('mapeia tipos conhecidos para rótulo PT-BR', () => {
    expect(taskLabel('qmshutdown')).toBe('Desligamento seguro');
    expect(taskLabel('qmstart')).toBe('Ligou');
    expect(taskLabel('vzdump')).toBe('Backup');
  });
  it('usa o tipo cru como fallback para tipo desconhecido', () => {
    expect(taskLabel('qmfoobar')).toBe('qmfoobar');
  });
});

describe('normalizeHistory', () => {
  it('normaliza uma tarefa encerrada com sucesso', () => {
    const [e] = normalizeHistory([
      { upid: 'UPID:n1:1', type: 'qmshutdown', user: 'root@pam', status: 'OK', starttime: 1000, endtime: 1007 },
    ]);
    expect(e).toMatchObject({
      upid: 'UPID:n1:1', type: 'qmshutdown', label: 'Desligamento seguro',
      status: 'OK', running: false, ok: true, user: 'root@pam',
      starttime: 1000, endtime: 1007, durationSec: 7,
    });
  });
  it('marca running quando não há endtime, sem duração', () => {
    const [e] = normalizeHistory([
      { upid: 'UPID:n1:2', type: 'qmigrate', user: 'root@pam', status: 'running', starttime: 2000 },
    ]);
    expect(e).toMatchObject({ running: true, ok: false, endtime: null, durationSec: null });
  });
  it('marca erro quando a tarefa encerrou com status != OK', () => {
    const [e] = normalizeHistory([
      { upid: 'UPID:n1:3', type: 'qmstart', user: 'root@pam', status: 'no such disk', starttime: 3000, endtime: 3002 },
    ]);
    expect(e).toMatchObject({ running: false, ok: false, status: 'no such disk', durationSec: 2 });
  });
  it('ordena da mais recente para a mais antiga (starttime desc)', () => {
    const out = normalizeHistory([
      { upid: 'a', type: 'qmstart', starttime: 100, endtime: 101, status: 'OK' },
      { upid: 'b', type: 'qmstart', starttime: 300, endtime: 301, status: 'OK' },
      { upid: 'c', type: 'qmstart', starttime: 200, endtime: 201, status: 'OK' },
    ]);
    expect(out.map((e) => e.upid)).toEqual(['b', 'c', 'a']);
  });
});
