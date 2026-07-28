// Nome de host compatível com DNS (RFC 1123, um label): minúsculas, dígitos e hífen,
// sem espaços, sem começar/terminar com hífen, de 1 a 63 caracteres.
export const HOSTNAME_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;
export const isValidHostname = (s: string): boolean => HOSTNAME_RE.test(s);
export const HOSTNAME_HINT =
  'apenas minúsculas, números e hífen — sem espaços; não pode começar/terminar com hífen';
// Normaliza o que o operador digita: minúsculas e sem espaços (vira hífen).
export const normalizeHostname = (s: string): string =>
  s.toLowerCase().replace(/\s+/g, '-');
