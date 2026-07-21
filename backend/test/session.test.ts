import { describe, it, expect } from 'vitest';
import { signSession, verifySession } from '../src/auth/session.js';

describe('session jwt', () => {
  it('assina e verifica ida e volta', () => {
    const token = signSession({ username: 'alice', groups: ['ops'] }, 'segredo', '1h');
    const s = verifySession(token, 'segredo');
    expect(s.username).toBe('alice');
    expect(s.groups).toEqual(['ops']);
  });
  it('rejeita token com segredo errado', () => {
    const token = signSession({ username: 'alice', groups: [] }, 'segredo', '1h');
    expect(() => verifySession(token, 'outro')).toThrow();
  });
});
