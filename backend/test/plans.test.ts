import { describe, it, expect } from 'vitest';
import { parsePlans, stripPlansBlock } from '../src/vms/plans.js';

const NOTES = `# Residente NHW

Chat corporativo pronto para uso.

<!-- o4p-plans
padrao=cores:4,memoryMB:8192,homeGB:80
extendido=cores:8,memoryMB:16384,homeGB:180
-->`;

describe('parsePlans', () => {
  it('extrai os planos do bloco o4p-plans no Notes', () => {
    expect(parsePlans(NOTES)).toEqual({
      padrao: { cores: 4, memoryMB: 8192, homeGB: 80 },
      extendido: { cores: 8, memoryMB: 16384, homeGB: 180 },
    });
  });

  it('sem bloco → {}', () => {
    expect(parsePlans('# só descrição, sem planos')).toEqual({});
  });

  it('undefined/vazio → {}', () => {
    expect(parsePlans(undefined)).toEqual({});
    expect(parsePlans('')).toEqual({});
  });

  it('ignora linhas malformadas ou incompletas', () => {
    const n = `<!-- o4p-plans
bom=cores:2,memoryMB:2048,homeGB:40
faltando=cores:2,memoryMB:2048
lixo sem igual
# comentario=cores:9,memoryMB:9,homeGB:9
-->`;
    expect(parsePlans(n)).toEqual({ bom: { cores: 2, memoryMB: 2048, homeGB: 40 } });
  });
});

describe('stripPlansBlock', () => {
  it('remove o bloco o4p-plans, deixando só a descrição humana', () => {
    const out = stripPlansBlock(NOTES);
    expect(out).not.toContain('o4p-plans');
    expect(out).not.toContain('cores:4');
    expect(out).toContain('Chat corporativo pronto para uso.');
    expect(out).toContain('# Residente NHW');
  });

  it('sem bloco → devolve a descrição intacta (trim)', () => {
    expect(stripPlansBlock('# só descrição')).toBe('# só descrição');
  });

  it('undefined → string vazia', () => {
    expect(stripPlansBlock(undefined)).toBe('');
  });
});
