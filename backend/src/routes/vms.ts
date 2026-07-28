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
}
