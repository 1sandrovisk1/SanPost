import { z } from 'zod';
import { createTool } from '@mastra/core/tools';
import { checkAuth } from '../auth.context';
import { readRequestContext } from './tool.context.helper';
import { AutomationManagementService, automationErrorCode } from '../../integrations/automations/automation-management.service';
import type { FlowScope } from '../../dtos/flows/flow-v2.dto';
export function automationTool<T extends z.ZodTypeAny>(service: Pick<AutomationManagementService, 'scope'>, id: string, description: string, inputSchema: T, execute: (scope: FlowScope, input: z.infer<T>) => unknown | Promise<unknown>) {
  return createTool({ id, description, inputSchema,
    execute: async (raw: unknown, options: unknown) => {
      try {
        checkAuth(raw, options);
        const input = inputSchema.safeParse(raw);
        if (!input.success) return { errors: JSON.stringify([{ error: 'INVALID_TOOL_INPUT', fields: input.error.issues.map(i => i.path.join('.')) }]) };
        const context = readRequestContext(options);
        let organization: { id?: string };
        try { organization = JSON.parse(String(context.get('organization') || 'null')); } catch { organization = null; }
        if (!organization?.id) return { errors: JSON.stringify([{ error: 'ORGANIZATION_REQUIRED' }]) };
        const scope = await service.scope(organization.id, context.get('profileId') as string | undefined);
        return { output: await execute(scope, input.data) };
      } catch (error) { return { errors: JSON.stringify([{ error: automationErrorCode(error) }]) }; }
    },
  });
}
