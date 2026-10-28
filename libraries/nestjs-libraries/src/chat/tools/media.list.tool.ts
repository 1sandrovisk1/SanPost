import { AgentToolInterface } from '@gitroom/nestjs-libraries/chat/agent.tool.interface';
import { createTool } from '@mastra/core/tools';
import { Injectable } from '@nestjs/common';
import { MediaService } from '@gitroom/nestjs-libraries/database/prisma/media/media.service';
import z from 'zod';
import { checkAuth } from '@gitroom/nestjs-libraries/chat/auth.context';
import { readRequestContext } from '@gitroom/nestjs-libraries/chat/tools/tool.context.helper';

// Porte do upstream #1926, com o escopo de perfil do fork: a sessao MCP so ve
// a midia do proprio perfil (e a sem perfil), como o dashboard.
@Injectable()
export class MediaListTool implements AgentToolInterface {
  constructor(private _mediaService: MediaService) {}
  name = 'mediaListTool';

  run() {
    return createTool({
      id: 'mediaListTool',
      description: `Lista a mídia (imagens e vídeos) já enviada à biblioteca, da mais recente para a mais antiga, 18 por página, com busca opcional pelo nome original do arquivo.
Use o path devolvido como mídia em schedulePostTool em vez de enviar o arquivo de novo.`,
      inputSchema: z.object({
        search: z
          .string()
          .max(200)
          .optional()
          .describe('Filtra pelo nome original do arquivo (contém, sem diferenciar maiúsculas)'),
        page: z
          .number()
          .int()
          .min(1)
          .max(1000)
          .optional()
          .describe('Número da página, começando em 1'),
      }),
      mcp: {
        annotations: {
          title: 'Listar mídia',
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      outputSchema: z.object({
        pages: z.number(),
        output: z.array(
          z.object({
            id: z.string(),
            name: z.string(),
            originalName: z.string().nullable(),
            path: z.string(),
            createdAt: z.string(),
          })
        ),
      }),
      execute: async (inputData, context) => {
        checkAuth(inputData, context);
        const requestContext = readRequestContext(context);
        const organizationId = JSON.parse(
          String(requestContext.get('organization') || 'null')
        )?.id;
        // sem org no contexto o Prisma ignora o filtro e listaria a midia de
        // todas as organizacoes: falha fechada, como as outras ferramentas
        if (typeof organizationId !== 'string' || !organizationId) {
          throw new Error('ORGANIZATION_REQUIRED');
        }
        const profileId =
          (requestContext.get('profileId') as string | undefined) || undefined;

        const { pages, results } = await this._mediaService.getMedia(
          organizationId,
          inputData.page || 1,
          profileId,
          inputData.search
        );

        return {
          pages,
          output: results.map((p: any) => ({
            id: p.id,
            name: p.name,
            originalName: p.originalName ?? null,
            path: p.path,
            createdAt: new Date(p.createdAt).toISOString(),
          })),
        };
      },
    });
  }
}
