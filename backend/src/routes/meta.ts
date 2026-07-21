import type { FastifyInstance } from 'fastify';
import type { VmService } from '../vms/service.js';
import { makeAuthHook } from '../auth/middleware.js';

export async function registerMetaRoutes(app: FastifyInstance, jwtSecret: string, vms: VmService) {
  app.addHook('preHandler', makeAuthHook(jwtSecret));
  app.get('/api/templates', async () => vms.listTemplates());
  app.get('/api/meta', async () => vms.meta());
  app.get('/api/dashboard', async () => vms.dashboard());
  app.get('/api/tasks/:upid', async (req) => {
    const { upid } = req.params as { upid: string };
    // node e vmid saem do próprio UPID (guardado por visibilidade no service).
    return vms.taskStatus(upid);
  });
}
