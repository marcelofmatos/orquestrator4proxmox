import { z } from 'zod';

const csv = (def: string) =>
  z.string().default(def).transform((s) => s.split(',').map((t) => t.trim()).filter(Boolean));

const schema = z.object({
  PROXMOX_URL: z.string().url(),
  PROXMOX_TOKEN_ID: z.string().min(1),
  PROXMOX_TOKEN_SECRET: z.string().min(1),
  PROXMOX_TLS_INSECURE: z.string().optional().transform((v) => v === 'true'),
  PROXMOX_CLIENT_TAG: z.string().default('cliente'),
  PROXMOX_HIDDEN_TAGS: csv('mgmt,infra'),
  PROXMOX_TARGET_STORAGE: z.string().default('local-zfs'),
  LDAP_URL: z.string().min(1),
  LDAP_BASE_DN: z.string().min(1),
  LDAP_BIND_DN: z.string().min(1),
  LDAP_BIND_PASSWORD: z.string().min(1),
  LDAP_USER_BASE: z.string().default('ou=people'),
  LDAP_USER_ATTR: z.string().default('uid'),
  LDAP_GROUP_BASE: z.string().default('ou=groups'),
  LDAP_REQUIRED_GROUP: z.string().optional(),
  JWT_SECRET: z.string().min(1),
  SESSION_TTL: z.string().default('8h'),
  PORT: z.string().default('8080').transform((s) => parseInt(s, 10)),
});

export type Config = ReturnType<typeof loadConfig>;

export function loadConfig(env: Record<string, string | undefined> = process.env) {
  const p = schema.parse(env);
  return {
    port: p.PORT,
    proxmox: {
      url: p.PROXMOX_URL.replace(/\/+$/, ''),
      tokenId: p.PROXMOX_TOKEN_ID,
      tokenSecret: p.PROXMOX_TOKEN_SECRET,
      tlsInsecure: p.PROXMOX_TLS_INSECURE ?? false,
      clientTag: p.PROXMOX_CLIENT_TAG,
      hiddenTags: p.PROXMOX_HIDDEN_TAGS,
      targetStorage: p.PROXMOX_TARGET_STORAGE,
    },
    ldap: {
      url: p.LDAP_URL, baseDn: p.LDAP_BASE_DN, bindDn: p.LDAP_BIND_DN,
      bindPassword: p.LDAP_BIND_PASSWORD, userBase: p.LDAP_USER_BASE,
      userAttr: p.LDAP_USER_ATTR, groupBase: p.LDAP_GROUP_BASE,
      requiredGroup: p.LDAP_REQUIRED_GROUP,
    },
    jwtSecret: p.JWT_SECRET,
    sessionTtl: p.SESSION_TTL,
  };
}
