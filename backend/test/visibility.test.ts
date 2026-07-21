import { describe, it, expect } from 'vitest';
import { parseTags, isClientVisible, filterVisible, type TagPolicy } from '../src/vms/visibility.js';

const policy: TagPolicy = { clientTag: 'cliente', hiddenTags: ['mgmt', 'infra'] };

describe('parseTags', () => {
  it('separa por ; e por ,', () => {
    expect(parseTags('infra;mgmt')).toEqual(['infra', 'mgmt']);
    expect(parseTags('a, b')).toEqual(['a', 'b']);
    expect(parseTags(undefined)).toEqual([]);
    expect(parseTags('')).toEqual([]);
  });
});

describe('isClientVisible', () => {
  it('mostra VM só-cliente', () => {
    expect(isClientVisible({ tags: 'cliente', template: 0 }, policy)).toBe(true);
  });
  it('esconde VM cliente que também tem tag oculta', () => {
    expect(isClientVisible({ tags: 'cliente;mgmt', template: 0 }, policy)).toBe(false);
  });
  it('esconde VM de gestão', () => {
    expect(isClientVisible({ tags: 'infra;mgmt', template: 0 }, policy)).toBe(false);
  });
  it('esconde VM sem a tag cliente', () => {
    expect(isClientVisible({ tags: 'residente', template: 0 }, policy)).toBe(false);
  });
  it('esconde template mesmo com tag cliente', () => {
    expect(isClientVisible({ tags: 'cliente', template: 1 }, policy)).toBe(false);
  });
});

describe('filterVisible', () => {
  it('retorna só as visíveis', () => {
    const vms = [
      { vmid: 100, tags: 'infra;mgmt', template: 0 },
      { vmid: 101, tags: 'cliente', template: 0 },
      { vmid: 998, tags: 'template', template: 1 },
    ];
    expect(filterVisible(vms, policy).map((v) => v.vmid)).toEqual([101]);
  });
});
