import { describe, it, expect } from 'vitest';
import { isValidHostname, normalizeHostname } from '../src/hostname.js';

describe('hostname (DNS / RFC 1123)', () => {
  it('aceita hostnames válidos', () => {
    for (const s of ['a', 'cliente', 'cliente-web-01', 'web01', '0abc']) {
      expect(isValidHostname(s), s).toBe(true);
    }
  });
  it('rejeita maiúscula, espaço, hífen nas pontas, underscore, vazio e >63', () => {
    for (const s of ['Cliente', 'cli ente', '-x', 'x-', '', 'cli_ente', 'a'.repeat(64)]) {
      expect(isValidHostname(s), s).toBe(false);
    }
  });
  it('normaliza: minúsculas e espaços viram hífen', () => {
    expect(normalizeHostname('Cliente Web 01')).toBe('cliente-web-01');
  });
});
