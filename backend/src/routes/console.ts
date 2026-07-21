import type { FastifyInstance } from 'fastify';
import websocket from '@fastify/websocket';
import WebSocket from 'ws';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Config } from '../config.js';
import type { ProxmoxClient } from '../proxmox/client.js';
import type { VmService } from '../vms/service.js';
import { makeAuthHook } from '../auth/middleware.js';
import { openConsole, type ConsoleTicket } from '../console/proxy.js';

const idParam = z.object({ id: z.coerce.number().int().positive() });
const wsQuery = z.object({ sid: z.string().uuid() });

export async function registerConsoleRoutes(app: FastifyInstance, cfg: Config, px: ProxmoxClient, vms: VmService) {
  await app.register(websocket);
  const authHook = makeAuthHook(cfg.jwtSecret);

  // Sessões de console de curta duração: UM único vncproxy é compartilhado entre a rota
  // HTTP (que entrega o ticket ao browser como senha do RFB) e a rota WS (que abre o
  // túnel). Sem isto, dois vncproxy geram dois tickets/portas diferentes e o RFB falha
  // com "Security negotiation failed ... password check failed".
  const sessions = new Map<string, ConsoleTicket & { exp: number }>();
  const TTL = 30_000;
  const prune = () => { const now = Date.now(); for (const [k, v] of sessions) if (v.exp < now) sessions.delete(k); };

  // 1) HTTP: cria o vncproxy uma vez, guarda a sessão e devolve o ticket (senha do RFB)
  app.get('/api/vms/:id/console', { preHandler: authHook }, async (req) => {
    const { id } = idParam.parse(req.params);
    const t = await openConsole(vms, px, id);
    prune();
    const sid = randomUUID();
    sessions.set(sid, { ...t, exp: Date.now() + TTL });
    return { wsPath: `/api/vms/${id}/console/ws?sid=${sid}`, password: t.ticket };
  });

  // 2) WS: usa a MESMA sessão (mesmo ticket/porta) para o túnel ao vncwebsocket do Proxmox
  app.get('/api/vms/:id/console/ws', { websocket: true, preHandler: authHook }, async (socket, req) => {
    const { id } = idParam.parse(req.params);
    const parsed = wsQuery.safeParse(req.query);
    const sess = parsed.success ? sessions.get(parsed.data.sid) : undefined;
    if (parsed.success) sessions.delete(parsed.data.sid); // uso único
    if (!sess || sess.vmid !== id || sess.exp < Date.now()) { socket.close(1008, 'sessão de console inválida'); return; }

    const base = cfg.proxmox.url.replace(/^https?:/, 'wss:');
    const upstreamUrl = `${base}/api2/json/nodes/${sess.node}/qemu/${id}/vncwebsocket`
      + `?port=${sess.port}&vncticket=${encodeURIComponent(sess.ticket)}`;
    const upstream = new WebSocket(upstreamUrl, {
      headers: { Authorization: `PVEAPIToken=${cfg.proxmox.tokenId}=${cfg.proxmox.tokenSecret}` },
      rejectUnauthorized: !cfg.proxmox.tlsInsecure,
    });

    upstream.on('message', (data) => socket.readyState === socket.OPEN && socket.send(data));
    socket.on('message', (data) => upstream.readyState === WebSocket.OPEN && upstream.send(data));
    const closeBoth = () => { try { socket.close(); } catch {} try { upstream.close(); } catch {} };
    upstream.on('close', closeBoth);
    socket.on('close', closeBoth);
    upstream.on('error', closeBoth);
    socket.on('error', closeBoth);
  });
}
