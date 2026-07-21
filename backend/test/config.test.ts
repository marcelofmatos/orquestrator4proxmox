import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/config.js';

const base = {
  PROXMOX_URL: 'https://pve:8006/',
  PROXMOX_TOKEN_ID: 'root@pam!x',
  PROXMOX_TOKEN_SECRET: 'secret',
  LDAP_URL: 'ldap://lldap:3890',
  LDAP_BASE_DN: 'dc=example,dc=com',
  LDAP_BIND_DN: 'uid=admin,ou=people,dc=example,dc=com',
  LDAP_BIND_PASSWORD: 'pw',
  JWT_SECRET: 'jwtsecret',
};

describe('loadConfig', () => {
  it('aplica defaults e normaliza a URL do proxmox sem barra final', () => {
    const c = loadConfig(base);
    expect(c.proxmox.url).toBe('https://pve:8006');
    expect(c.proxmox.clientTag).toBe('cliente');
    expect(c.proxmox.hiddenTags).toEqual(['mgmt', 'infra']);
    expect(c.proxmox.targetStorage).toBe('local-zfs');
    expect(c.ldap.userBase).toBe('ou=people');
    expect(c.ldap.userAttr).toBe('uid');
    expect(c.port).toBe(8080);
  });

  it('lança erro quando falta variável obrigatória', () => {
    expect(() => loadConfig({ ...base, JWT_SECRET: undefined })).toThrow();
  });

  it('parseia hiddenTags custom separadas por vírgula', () => {
    const c = loadConfig({ ...base, PROXMOX_HIDDEN_TAGS: 'mgmt, infra ,secret' });
    expect(c.proxmox.hiddenTags).toEqual(['mgmt', 'infra', 'secret']);
  });
});
