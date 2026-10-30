import {
  continueAsNew,
  patched,
  proxyActivities,
  sleep,
  workflowInfo,
} from '@temporalio/workflow';
import { PostActivity } from '@gitroom/orchestrator/activities/post.activity';

const { searchForMissingThreeHoursPosts } = proxyActivities<PostActivity>({
  startToCloseTimeout: '10 minute',
  retry: {
    maximumAttempts: 3,
    backoffCoefficient: 1,
    initialInterval: '2 minutes',
  },
});

// Ciclos (1 por hora) antes de reciclar o historico via continueAsNew.
const MISSING_POST_CYCLES_BEFORE_CONTINUE = 24;
// Teto de eventos: a execucao singleton antiga (sem o patch) passa dele e
// recicla no primeiro ciclo ao vivo depois do deploy.
const MISSING_POST_MAX_HISTORY_LENGTH = 1000;

export async function missingPostWorkflow() {
  let loops = 0;
  await searchForMissingThreeHoursPosts();
  while (true) {
    await sleep('1 hour');

    // Mantem o historico pequeno (pitfall #9 do orchestrator); a nova execucao
    // busca logo ao iniciar, entao a cadencia horaria se mantem. O patched()
    // devolve false no replay da execucao iniciada antes deste codigo
    // (upstream 185044d5).
    if (
      patched('missing-post-continue-as-new') &&
      (++loops >= MISSING_POST_CYCLES_BEFORE_CONTINUE ||
        workflowInfo().historyLength > MISSING_POST_MAX_HISTORY_LENGTH)
    ) {
      return await continueAsNew<typeof missingPostWorkflow>();
    }

    await searchForMissingThreeHoursPosts();
  }
}
