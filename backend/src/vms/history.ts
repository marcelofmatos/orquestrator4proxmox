import type { ProxmoxTask } from '../proxmox/types.js';

/** Item normalizado da linha do tempo, pronto para o frontend. */
export interface HistoryEntry {
  upid: string;
  type: string;
  label: string;
  status: string;
  running: boolean;
  ok: boolean;
  user: string;
  starttime: number;
  endtime: number | null;
  durationSec: number | null;
}

/** Mapa tipo-de-tarefa (Proxmox) → rótulo amigável PT-BR. */
const TASK_LABELS: Record<string, string> = {
  qmstart: 'Ligou',
  qmshutdown: 'Desligamento seguro',
  qmstop: 'Forçou desligamento',
  qmreboot: 'Reiniciou',
  qmreset: 'Reset',
  qmsnapshot: 'Criou snapshot',
  qmrollback: 'Restaurou snapshot',
  qmdelsnapshot: 'Removeu snapshot',
  vzdump: 'Backup',
  qmigrate: 'Migrou',
  qmclone: 'Clonou',
  qmtemplate: 'Virou template',
  qmcreate: 'Criou VM',
  qmdestroy: 'Excluiu VM',
  qmconfig: 'Alterou config',
  resize: 'Redimensionou disco',
  qmmove: 'Moveu disco',
};

/** Rótulo PT-BR de um tipo de tarefa; fallback para o próprio tipo se desconhecido. */
export function taskLabel(type: string): string {
  return TASK_LABELS[type] ?? type;
}

function normalizeTask(t: ProxmoxTask): HistoryEntry {
  const running = t.endtime == null;
  const status = t.status ?? (running ? 'running' : 'OK');
  const ok = !running && status === 'OK';
  const durationSec = t.endtime != null ? Math.max(0, t.endtime - t.starttime) : null;
  return {
    upid: t.upid,
    type: t.type,
    label: taskLabel(t.type),
    status,
    running,
    ok,
    user: t.user ?? '',
    starttime: t.starttime,
    endtime: t.endtime ?? null,
    durationSec,
  };
}

/** Normaliza a lista crua do task log, mais recente primeiro. */
export function normalizeHistory(tasks: ProxmoxTask[]): HistoryEntry[] {
  return tasks.map(normalizeTask).sort((a, b) => b.starttime - a.starttime);
}
