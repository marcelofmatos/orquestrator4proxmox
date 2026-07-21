import { describe, it, expect, vi } from 'vitest';
import { authenticate, type LdapDeps } from '../src/auth/ldap.js';
import { AuthError, ForbiddenError, LdapDownError } from '../src/errors.js';

const ldapCfg = {
  url: 'ldap://lldap:3890', baseDn: 'dc=authelia,dc=mbm',
  bindDn: 'uid=admin,ou=people,dc=authelia,dc=mbm', bindPassword: 'adminpw',
  userBase: 'ou=people', userAttr: 'uid', groupBase: 'ou=groups', requiredGroup: undefined as string | undefined,
};

function makeDeps(opts: {
  userDn?: string; groups?: string[]; userBindOk?: boolean;
}): { deps: LdapDeps; unbind: ReturnType<typeof vi.fn>; search: ReturnType<typeof vi.fn> } {
  const unbind = vi.fn(async () => {});
  const search = vi.fn(async (base: string, options: { filter: string }) => {
    if (base === `${ldapCfg.userBase},${ldapCfg.baseDn}`) {
      return { searchEntries: opts.userDn ? [{ dn: opts.userDn }] : [] };
    }
    return { searchEntries: (opts.groups ?? []).map((cn) => ({ cn })) };
  });
  const client = {
    bind: vi.fn(async (dn: string) => {
      if (dn === ldapCfg.bindDn) return;                 // admin bind ok
      if (dn === opts.userDn && opts.userBindOk) return; // user bind ok
      const e = new Error('invalid'); e.name = 'InvalidCredentialsError'; throw e;
    }),
    search,
    unbind,
  };
  return { deps: { config: ldapCfg, createClient: () => client as any }, unbind, search };
}

describe('authenticate', () => {
  it('sucesso retorna usuário', async () => {
    const { deps } = makeDeps({ userDn: 'uid=alice,ou=people,dc=authelia,dc=mbm', userBindOk: true });
    const u = await authenticate(deps, 'alice', 'senha');
    expect(u.username).toBe('alice');
  });
  it('usuário inexistente lança AuthError', async () => {
    const { deps } = makeDeps({ userDn: undefined });
    await expect(authenticate(deps, 'ninguem', 'x')).rejects.toBeInstanceOf(AuthError);
  });
  it('senha errada lança AuthError', async () => {
    const { deps } = makeDeps({ userDn: 'uid=alice,ou=people,dc=authelia,dc=mbm', userBindOk: false });
    await expect(authenticate(deps, 'alice', 'errada')).rejects.toBeInstanceOf(AuthError);
  });
  it('sem grupo exigido lança ForbiddenError', async () => {
    const deps = makeDeps({ userDn: 'uid=alice,ou=people,dc=authelia,dc=mbm', userBindOk: true, groups: [] }).deps;
    deps.config = { ...ldapCfg, requiredGroup: 'proxmox_operators' };
    await expect(authenticate(deps, 'alice', 'senha')).rejects.toBeInstanceOf(ForbiddenError);
  });
  it('com grupo exigido presente autentica', async () => {
    const deps = makeDeps({ userDn: 'uid=alice,ou=people,dc=authelia,dc=mbm', userBindOk: true, groups: ['proxmox_operators'] }).deps;
    deps.config = { ...ldapCfg, requiredGroup: 'proxmox_operators' };
    const u = await authenticate(deps, 'alice', 'senha');
    expect(u.groups).toContain('proxmox_operators');
  });
  it('escapa valores especiais no filtro de busca (RFC 4515)', async () => {
    const { deps, search } = makeDeps({ userDn: undefined });
    await expect(authenticate(deps, '*', 'x')).rejects.toBeInstanceOf(AuthError);
    const userSearchCall = search.mock.calls.find(
      ([base]) => base === `${ldapCfg.userBase},${ldapCfg.baseDn}`,
    );
    expect(userSearchCall?.[1].filter).toBe('(uid=\\2a)');
  });

  it('rejeita senha vazia sem tentar bind (evita unauthenticated bind / bypass)', async () => {
    const { deps } = makeDeps({ userDn: 'uid=alice,ou=people,dc=authelia,dc=mbm', userBindOk: true });
    // O fake de bind ignora a senha; sem o guard, senha vazia "autenticaria".
    await expect(authenticate(deps, 'alice', '')).rejects.toBeInstanceOf(AuthError);
  });

  it('não vaza detalhe interno do diretório em erro de indisponibilidade', async () => {
    const badClient = {
      bind: vi.fn(async () => { throw new Error('ECONNREFUSED 10.0.0.5:3890 segredo-interno'); }),
      search: vi.fn(),
      unbind: vi.fn(async () => {}),
    };
    const deps: LdapDeps = { config: ldapCfg, createClient: () => badClient as any };
    const err = await authenticate(deps, 'alice', 'senha').catch((e) => e);
    expect(err).toBeInstanceOf(LdapDownError);
    expect(`${err.message} ${err.detail ?? ''}`).not.toContain('segredo-interno');
  });
});
