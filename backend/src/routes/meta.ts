import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { VmService } from '../vms/service.js';
import { makeAuthHook } from '../auth/middleware.js';

const taskQuery = z.object({ node: z.string().min(1) });

export async function registerMetaRoutes(app: FastifyInstance, jwtSecret: string, vms: VmService) {
  app.addHook('preHandler', makeAuthHook(jwtSecret));
  app.get('/api/templates', async () => vms.listTemplates());
  app.get('/api/meta', async () => vms.meta());
  app.get('/api/dashboard', async () => vms.dashboard());
  app.get('/api/tasks/:upid', async (req) => {
    const { upid } = req.params as { upid: string };
    const { node } = taskQuery.parse(req.query);
    return vms.taskStatus(node, upid);
  });
}
