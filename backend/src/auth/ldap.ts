import { Client } from 'ldapts';
import { AuthError, ForbiddenError, LdapDownError } from '../errors.js';

export interface LdapConfig {
  url: string; baseDn: string; bindDn: string; bindPassword: string;
  userBase: string; userAttr: string; groupBase: string; requiredGroup?: string;
}
export interface LdapDeps { config: LdapConfig; createClient: () => Client; }
export interface AuthedUser { username: string; dn: string; groups: string[]; }

export function defaultDeps(config: LdapConfig): LdapDeps {
  return { config, createClient: () => new Client({ url: config.url }) };
}

function isInvalidCreds(err: unknown): boolean {
  return err instanceof Error && err.name === 'InvalidCredentialsError';
}

/** Escapa valores interpolados em filtros LDAP (RFC 4515) — evita LDAP injection. */
export function escapeLdapValue(v: string): string {
  return v
    .replace(/\\/g, '\\5c')
    .replace(/\*/g, '\\2a')
    .replace(/\(/g, '\\28')
    .replace(/\)/g, '\\29')
    .replace(/\0/g, '\\00');
}

export async function authenticate(deps: LdapDeps, username: string, password: string): Promise<AuthedUser> {
  const { config } = deps;
  // Guard contra "unauthenticated bind": um bind com senha vazia é aceito por muitos
  // servidores LDAP como sucesso (RFC 4513), o que seria bypass de login. Também
  // rejeita usuário vazio. Senha/usuário em branco nunca chegam ao bind.
  if (!username || !password) throw new AuthError('usuário ou senha inválidos');

  const admin = deps.createClient();
  try {
    try {
      await admin.bind(config.bindDn, config.bindPassword);
    } catch (err) {
      // Não vazar detalhes internos do diretório ao cliente — só log no servidor.
      console.error('[ldap] falha no bind admin:', (err as Error).message);
      throw new LdapDownError('diretório indisponível');
    }

    const { searchEntries } = await admin.search(`${config.userBase},${config.baseDn}`, {
      scope: 'sub', filter: `(${config.userAttr}=${escapeLdapValue(username)})`, attributes: ['dn'],
    });
    if (searchEntries.length === 0) throw new AuthError('usuário ou senha inválidos');
    const userDn = String(searchEntries[0].dn);
    if (!userDn) throw new AuthError('usuário ou senha inválidos');

    // 1) Autenticação: valida a senha fazendo bind como o próprio usuário.
    const userClient = deps.createClient();
    try {
      await userClient.bind(userDn, password);
    } catch (err) {
      if (isInvalidCreds(err)) throw new AuthError('usuário ou senha inválidos');
      console.error('[ldap] erro no bind do usuário:', (err as Error).message);
      throw new LdapDownError('diretório indisponível');
    } finally {
      await userClient.unbind().catch(() => {});
    }

    // 2) Autorização: só depois de autenticado, checa o grupo exigido (se houver).
    // Fazer isto antes do bind do usuário permitiria enumerar usuários/grupos sem senha.
    let groups: string[] = [];
    if (config.requiredGroup) {
      const g = await admin.search(`${config.groupBase},${config.baseDn}`, {
        scope: 'sub',
        filter: `(&(cn=${escapeLdapValue(config.requiredGroup)})(member=${escapeLdapValue(userDn)}))`,
        attributes: ['cn'],
      });
      groups = g.searchEntries.map((e) => String(e.cn));
      if (groups.length === 0) throw new ForbiddenError('sem permissão de acesso');
    }
    return { username, dn: userDn, groups };
  } finally {
    await admin.unbind().catch(() => {});
  }
}
