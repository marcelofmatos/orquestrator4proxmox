import type { FastifyInstance } from 'fastify';
import websocket from '@fastify/websocket';
import WebSocket from 'ws';
import { z } from 'zod';
import type { Config } from '../config.js';
import type { ProxmoxClient } from '../proxmox/client.js';
import type { VmService } from '../vms/service.js';
import { makeAuthHook } from '../auth/middleware.js';
import { openConsole } from '../console/proxy.js';

const idParam = z.object({ id: z.coerce.number().int().positive() });

export async function registerConsoleRoutes(app: FastifyInstance, cfg: Config, px: ProxmoxClient, vms: VmService) {
  await app.register(websocket);
  const authHook = makeAuthHook(cfg.jwtSecret);

  // 1) HTTP: emite ticket + senha do RFB (o próprio vncticket)
  app.get('/api/vms/:id/console', { preHandler: authHook }, async (req) => {
    const { id } = idParam.parse(req.params);
    const t = await openConsole(vms, px, id);
    return { wsPath: `/api/vms/${id}/console/ws`, password: t.ticket };
  });

  // 2) WS: pipe browser <-> proxmox vncwebsocket (token só no servidor)
  app.get('/api/vms/:id/console/ws', { websocket: true, preHandler: authHook }, async (socket, req) => {
    const { id } = idParam.parse(req.params);
    let ticket: Awaited<ReturnType<typeof openConsole>>;
    try {
      ticket = await openConsole(vms, px, id);
    } catch {
      socket.close(1008, 'não autorizado');
      return;
    }
    const base = cfg.proxmox.url.replace(/^https?:/, 'wss:');
    const upstreamUrl = `${base}/api2/json/nodes/${ticket.node}/qemu/${id}/vncwebsocket`
      + `?port=${ticket.port}&vncticket=${encodeURIComponent(ticket.ticket)}`;
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
