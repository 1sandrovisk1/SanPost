import {
  continueAsNew,
  patched,
  proxyActivities,
  sleep,
  workflowInfo,
} from '@temporalio/workflow';
import { AutopostActivity } from '@gitroom/orchestrator/activities/autopost.activity';

const { autoPost } = proxyActivities<AutopostActivity>({
  startToCloseTimeout: '10 minute',
  taskQueue: 'main',
  retry: {
    maximumAttempts: 3,
    backoffCoefficient: 1,
    initialInterval: '2 minutes',
  },
});

// Ciclos (1 por hora) antes de reciclar o historico via continueAsNew.
const AUTOPOST_CYCLES_BEFORE_CONTINUE = 24;
// Teto de eventos: execucoes antigas (sem o patch) passam dele e reciclam no
// primeiro ciclo ao vivo depois do deploy.
const AUTOPOST_MAX_HISTORY_LENGTH = 1000;

export async function autoPostWorkflow({
  id,
  immediately,
}: {
  id: string;
  immediately: boolean;
}) {
  let loops = 0;
  while (true) {
    try {
      if (immediately) {
        await autoPost(id);
      }
    } catch (err) {}
    immediately = true;
    await sleep(3600000);

    // Mantem o historico pequeno (pitfall #9 do orchestrator). O patched()
    // devolve false no replay de execucoes iniciadas antes deste codigo, que
    // seguem o caminho antigo ate o primeiro ciclo ao vivo (upstream
    // 185044d5). continueAsNew fica FORA do try/catch: ele desenrola por um
    // throw de controle que o catch engoliria.
    if (
      patched('autopost-continue-as-new') &&
      (++loops >= AUTOPOST_CYCLES_BEFORE_CONTINUE ||
        workflowInfo().historyLength > AUTOPOST_MAX_HISTORY_LENGTH)
    ) {
      return await continueAsNew<typeof autoPostWorkflow>({
        id,
        immediately: true,
      });
    }
  }
}
