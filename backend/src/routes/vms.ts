import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { VmService } from '../vms/service.js';
import { makeAuthHook } from '../auth/middleware.js';

const idParam = z.object({ id: z.coerce.number().int().positive() });
const createBody = z.object({
  templateId: z.number().int().positive(),
  // nome de host compatível com DNS (RFC 1123): minúsculas, dígitos e hífen,
  // sem espaços, sem começar/terminar com hífen, 1–63 caracteres.
  name: z.string().regex(
    /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/,
    'nome inválido: apenas minúsculas, números e hífen (sem espaços; não pode começar/terminar com hífen)',
  ),
  // nome do plano (definido no Notes do template). Determina cores/RAM/disco.
  plan: z.string().min(1).max(32).optional(),
  cores: z.number().int().positive().optional(),
  memoryMB: z.number().int().positive().optional(),
  diskGB: z.number().int().positive().optional(),
  net: z.discriminatedUnion('mode', [
    z.object({ mode: z.literal('dhcp') }),
    z.object({
      mode: z.literal('static'),
      // IPv4 ou IPv4/CIDR — o regex barra `,`/`=`/espaço, evitando injeção de campos
      // extras na string `ipconfig0` do cloud-init (ex.: "1.2.3.4/24,gw=...,foo=bar").
      ip: z.string().regex(/^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/, 'IP inválido (use IPv4 ou IPv4/CIDR)'),
      gateway: z.string().regex(/^(\d{1,3}\.){3}\d{1,3}$/, 'gateway inválido (IPv4)').optional(),
    }),
  ]).optional(),
  ciuser: z.string().optional(),
  cipassword: z.string().optional(),
  sshkey: z.string().optional(),
  start: z.boolean().default(true),
});
const lifecycle = ['start', 'stop', 'shutdown', 'reboot'] as const;
const diskKeyParam = z.object({
  id: z.coerce.number().int().positive(),
  key: z.string().regex(/^(scsi|virtio|sata|ide)([0-9]|[12][0-9]|30)$/),
});
const diskSizeBody = z.object({ sizeGB: z.number().int().positive() });
const historyQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  start: z.coerce.number().int().min(0).default(0),
});

export async function registerVmRoutes(app: FastifyInstance, jwtSecret: string, vms: VmService) {
  const authHook = makeAuthHook(jwtSecret);
  app.addHook('preHandler', authHook);

  app.get('/api/vms', async () => vms.listVisible());
  app.get('/api/vms/:id', async (req) => vms.get(idParam.parse(req.params).id));

  for (const action of lifecycle) {
    app.post(`/api/vms/:id/${action}`, async (req) => {
      const upid = await vms.lifecycle(idParam.parse(req.params).id, action);
      return { upid };
    });
  }

  app.delete('/api/vms/:id', async (req) => {
    const upid = await vms.remove(idParam.parse(req.params).id);
    return { upid };
  });

  app.post('/api/vms', async (req, reply) => {
    const result = await vms.create(createBody.parse(req.body));
    reply.code(201);
    return result;
  });

  app.get('/api/vms/:id/disks', async (req) => vms.listDisks(idParam.parse(req.params).id));

  app.get('/api/vms/:id/historico', async (req) => {
    const { id } = idParam.parse(req.params);
    const { limit, start } = historyQuery.parse(req.query);
    return vms.history(id, { limit, start });
  });

  // uso real por disco (guest agent) — para identificar qual disco precisa crescer
  app.get('/api/vms/:id/disks/usage', async (req) => vms.disksUsage(idParam.parse(req.params).id));

  app.post('/api/vms/:id/disks', async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const { sizeGB } = diskSizeBody.parse(req.body);
    const disk = await vms.addDisk(id, sizeGB);
    reply.code(201);
    return disk;
  });

  app.post('/api/vms/:id/disks/:key/resize', async (req) => {
    const { id, key } = diskKeyParam.parse(req.params);
    const { sizeGB } = diskSizeBody.parse(req.body);
    await vms.resizeDisk(id, key, sizeGB);
    return { ok: true };
  });

  app.post('/api/vms/:id/disks/:key/grow', async (req) => {
    const { id, key } = diskKeyParam.parse(req.params);
    return vms.growFilesystem(id, key);
  });

  app.get('/api/vms/:id/storage', async (req) => vms.storageStatus(idParam.parse(req.params).id));

  app.get('/api/vms/:id/disks/:key/storage', async (req) => {
    const { id, key } = diskKeyParam.parse(req.params);
    return vms.diskStorageStatus(id, key);
  });
}
