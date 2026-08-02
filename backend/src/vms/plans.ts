// Planos de hardware SEM banco de dados: vivem no próprio Proxmox, no campo
// Notes/description do template, num bloco em comentário HTML (invisível no card
// markdown). O operador edita os planos direto na UI do Proxmox (Notes do template).
//
//   <!-- o4p-plans
//   padrao=cores:4,memoryMB:8192,homeGB:80
//   extendido=cores:8,memoryMB:16384,homeGB:180
//   -->
//
// Cada linha é `nome=chave:valor,chave:valor` com as chaves cores/memoryMB/homeGB.

export interface Plan {
  cores: number;
  memoryMB: number;
  homeGB: number;
}

const BLOCK = /<!--\s*o4p-plans\b([\s\S]*?)-->/i;

/** Extrai os planos do Notes/description do template. Sem bloco → {} (sem planos). */
export function parsePlans(description: string | undefined | null): Record<string, Plan> {
  if (!description) return {};
  const m = BLOCK.exec(description);
  if (!m) return {};

  const plans: Record<string, Plan> = {};
  for (const raw of m[1].split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const name = line.slice(0, eq).trim();
    if (!name) continue;

    const kv: Record<string, number> = {};
    for (const pair of line.slice(eq + 1).split(',')) {
      const [k, v] = pair.split(':').map((s) => s.trim());
      const n = Number(v);
      if (k && Number.isFinite(n) && n > 0) kv[k] = n;
    }
    if (kv.cores && kv.memoryMB && kv.homeGB) {
      plans[name] = { cores: kv.cores, memoryMB: kv.memoryMB, homeGB: kv.homeGB };
    }
  }
  return plans;
}
