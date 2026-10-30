import { continueAsNew, proxyActivities, sleep } from '@temporalio/workflow';
import type { PostWorkflowMigrationActivity } from '../activities/post-workflow-migration.activity';

const { migratePostWorkflowBatch } =
  proxyActivities<PostWorkflowMigrationActivity>({
    taskQueue: 'main',
    startToCloseTimeout: '30 minutes',
    heartbeatTimeout: '1 minute',
    retry: { maximumAttempts: 3, initialInterval: '10 seconds' },
  });

// Singleton recorrente: pega tambem legados criados durante rolling updates.
// Um lote por execucao limita a history independentemente do tamanho da base.
export async function migratePostWorkflowsV112({
  cursor,
}: { cursor?: string } = {}) {
  let nextCursor = cursor;
  try {
    nextCursor = (await migratePostWorkflowBatch(cursor)).nextCursor;
  } catch {
    await sleep('5 minutes');
    // continueAsNew deve ficar fora do catch (desenrola por excecao interna).
    return await continueAsNew({ cursor });
  }
  if (!nextCursor) await sleep('5 minutes');
  return await continueAsNew(nextCursor ? { cursor: nextCursor } : {});
}
