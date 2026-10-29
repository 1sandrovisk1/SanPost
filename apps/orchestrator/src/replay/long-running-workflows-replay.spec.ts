import { execFile } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

// Replay REAL pelo SDK (bundle de producao + core do Temporal) de historicos
// sinteticos no formato de `temporal workflow show --output json`. Os
// historicos reproduzem execucoes iniciadas ANTES dos patches do upstream
// 185044d5/1f5f24e5 — o que estara rodando em producao no deploy. Sem o
// patched(), o replay de 30 ciclos falharia no 24o (continueAsNew onde o
// historico tem a proxima activity).

const RUN_ID = '00000000-0000-4000-8000-000000000001';
const b64 = (value: string) => Buffer.from(value).toString('base64');
const jsonPayload = (value: unknown) => ({
  metadata: { encoding: b64('json/plain') },
  data: b64(JSON.stringify(value)),
});
const queue = (name: string) => ({ name, kind: 'TASK_QUEUE_KIND_NORMAL' });

class HistoryBuilder {
  private readonly events: Array<Record<string, unknown>> = [];
  private time = Date.parse('2026-10-01T00:00:00.000Z');
  private lastTaskCompleted = 0;
  private activitySeq = 0;
  private timerSeq = 0;

  private push(type: string, attributes: Record<string, unknown>) {
    this.time += 1_000;
    const eventId = this.events.length + 1;
    const key = type
      .toLowerCase()
      .replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
    this.events.push({
      eventId: String(eventId),
      eventTime: new Date(this.time).toISOString(),
      eventType: `EVENT_TYPE_${type}`,
      [`${key}EventAttributes`]: attributes,
    });
    return String(eventId);
  }

  started(workflowType: string, input: unknown[] = []) {
    this.push('WORKFLOW_EXECUTION_STARTED', {
      workflowType: { name: workflowType },
      taskQueue: queue('main'),
      input: { payloads: input.map(jsonPayload) },
      workflowExecutionTimeout: '0s',
      workflowRunTimeout: '0s',
      workflowTaskTimeout: '10s',
      originalExecutionRunId: RUN_ID,
      firstExecutionRunId: RUN_ID,
      attempt: 1,
      identity: 'replay-spec',
    });
    return this;
  }

  workflowTask() {
    const scheduledEventId = this.push('WORKFLOW_TASK_SCHEDULED', {
      taskQueue: queue('main'),
      startToCloseTimeout: '10s',
      attempt: 1,
    });
    const startedEventId = this.push('WORKFLOW_TASK_STARTED', {
      scheduledEventId,
      identity: 'replay-spec',
      requestId: `wft-${scheduledEventId}`,
    });
    this.lastTaskCompleted = Number(
      this.push('WORKFLOW_TASK_COMPLETED', {
        scheduledEventId,
        startedEventId,
        identity: 'replay-spec',
      })
    );
    return this;
  }

  // activity agendada, executada e concluida (sem retorno)
  activity(name: string, taskQueue = 'main') {
    const seq = ++this.activitySeq;
    const scheduledEventId = this.push('ACTIVITY_TASK_SCHEDULED', {
      activityId: String(seq),
      activityType: { name },
      taskQueue: queue(taskQueue),
      input: { payloads: [] },
      scheduleToCloseTimeout: '0s',
      scheduleToStartTimeout: '0s',
      startToCloseTimeout: '600s',
      heartbeatTimeout: '0s',
      workflowTaskCompletedEventId: String(this.lastTaskCompleted),
    });
    const startedEventId = this.push('ACTIVITY_TASK_STARTED', {
      scheduledEventId,
      identity: 'replay-spec',
      requestId: `activity-${seq}`,
      attempt: 1,
    });
    this.push('ACTIVITY_TASK_COMPLETED', {
      scheduledEventId,
      startedEventId,
      identity: 'replay-spec',
    });
    return this;
  }

  startTimer(duration: string) {
    const seq = ++this.timerSeq;
    this.push('TIMER_STARTED', {
      timerId: String(seq),
      startToFireTimeout: duration,
      workflowTaskCompletedEventId: String(this.lastTaskCompleted),
    });
    return this;
  }

  fireTimer() {
    const timerId = String(this.timerSeq);
    const started = this.events.find(
      (event) =>
        event.eventType === 'EVENT_TYPE_TIMER_STARTED' &&
        (event.timerStartedEventAttributes as { timerId: string }).timerId ===
          timerId
    );
    this.push('TIMER_FIRED', {
      timerId,
      startedEventId: started?.eventId,
    });
    return this;
  }

  signal(signalName: string, input: unknown[]) {
    this.push('WORKFLOW_EXECUTION_SIGNALED', {
      signalName,
      input: { payloads: input.map(jsonPayload) },
      identity: 'replay-spec',
    });
    return this;
  }

  patch(id: string) {
    this.push('MARKER_RECORDED', {
      markerName: 'core_patch',
      details: {
        'patch-data': { payloads: [jsonPayload({ id, deprecated: false })] },
      },
      workflowTaskCompletedEventId: String(this.lastTaskCompleted),
    });
    return this;
  }

  completed() {
    this.push('WORKFLOW_EXECUTION_COMPLETED', {
      workflowTaskCompletedEventId: String(this.lastTaskCompleted),
    });
    return this;
  }

  build() {
    return { events: this.events };
  }
}

const LOOPS = 30;

// autoPost(immediately) -> sleep(1h) em loop; termina dormindo no 30o ciclo
const autopostBeforePatch = () => {
  const history = new HistoryBuilder()
    .started('autoPostWorkflow', [{ id: 'auto-1', immediately: true }])
    .workflowTask();
  for (let cycle = 1; cycle <= LOOPS; cycle++) {
    history.activity('autoPost').workflowTask().startTimer('3600s');
    if (cycle < LOOPS) {
      history.fireTimer().workflowTask();
    }
  }
  return history.build();
};

// busca inicial -> sleep(1h) -> busca, em loop; termina dormindo
const missingPostBeforePatch = () => {
  const history = new HistoryBuilder()
    .started('missingPostWorkflow')
    .workflowTask()
    .activity('searchForMissingThreeHoursPosts')
    .workflowTask();
  for (let cycle = 1; cycle <= LOOPS; cycle++) {
    history
      .startTimer('3600s')
      .fireTimer()
      .workflowTask()
      .activity('searchForMissingThreeHoursPosts')
      .workflowTask();
  }
  return history.startTimer('3600s').build();
};

// Historicos com marcador ja persistido: replay a cada reinicio do worker.
const autopostAfterPatch = () => {
  const history = new HistoryBuilder()
    .started('autoPostWorkflow', [{ id: 'auto-1', immediately: true }])
    .workflowTask()
    .activity('autoPost')
    .workflowTask()
    .startTimer('3600s')
    .fireTimer()
    .workflowTask()
    .patch('autopost-continue-as-new');
  return history
    .activity('autoPost')
    .workflowTask()
    .startTimer('3600s')
    .build();
};
const missingPostAfterPatch = () =>
  new HistoryBuilder()
    .started('missingPostWorkflow')
    .workflowTask()
    .activity('searchForMissingThreeHoursPosts')
    .workflowTask()
    .startTimer('3600s')
    .fireTimer()
    .workflowTask()
    .patch('missing-post-continue-as-new')
    .activity('searchForMissingThreeHoursPosts')
    .workflowTask()
    .startTimer('3600s')
    .build();

const email = {
  to: 'to@example.com',
  subject: 'Assunto',
  html: '<p>oi</p>',
  addTo: 'top',
  lang: 'pt',
};

// singleton `send_email` iniciado antes da troca: recebe um sinal, envia,
// espera 700ms e volta a aguardar a fila
const sendEmailSingletonRunning = () =>
  new HistoryBuilder()
    .started('sendEmailWorkflow', [{ queue: [] }])
    .workflowTask()
    .signal('sendEmail', [email])
    .workflowTask()
    .activity('sendEmail')
    .workflowTask()
    .startTimer('0.700s')
    .fireTimer()
    .workflowTask()
    .build();

// novo envio por e-mail, na fila email-bulk
const sendSingleEmail = () =>
  new HistoryBuilder()
    .started('sendSingleEmailWorkflow', [{ ...email, addTo: 'bottom' }])
    .workflowTask()
    .activity('sendEmail', 'email-bulk')
    .workflowTask()
    .completed()
    .build();

const REPLAY_SCRIPT = [
  "const { Worker, bundleWorkflowCode } = require('@temporalio/worker');",
  "const { readFileSync } = require('node:fs');",
  "const { resolve } = require('node:path');",
  '(async () => {',
  "  const histories = JSON.parse(readFileSync(process.argv[1], 'utf8'));",
  '  const { code } = await bundleWorkflowCode({',
  "    workflowsPath: resolve('apps/orchestrator/src/workflows/index.ts'),",
  '  });',
  '  const results = {};',
  '  for await (const result of Worker.runReplayHistories(',
  '    { workflowBundle: { code } },',
  '    histories',
  '  )) {',
  '    results[result.workflowId] = result.error',
  '      ? `${result.error.name}: ${result.error.message}`',
  '      : null;',
  '  }',
  "  process.stdout.write('REPLAY_RESULT' + JSON.stringify(results));",
  '})().catch((error) => {',
  '  process.stderr.write(String((error && error.stack) || error));',
  '  process.exit(1);',
  '});',
].join('\n');

describe('replay real dos workflows de longa duracao (bundle de producao)', () => {
  let directory: string;

  beforeAll(() => {
    directory = mkdtempSync(join(tmpdir(), 'robo-replay-'));
  });

  afterAll(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  it('execucoes iniciadas antes dos patches seguem deterministicas com o codigo novo', async () => {
    const historiesPath = join(directory, 'histories.json');
    writeFileSync(
      historiesPath,
      JSON.stringify([
        { workflowId: 'autopost-auto-1', history: autopostBeforePatch() },
        { workflowId: 'autopost-patched', history: autopostAfterPatch() },
        { workflowId: 'missing-patched', history: missingPostAfterPatch() },
        {
          workflowId: 'missing-post-workflow',
          history: missingPostBeforePatch(),
        },
        { workflowId: 'send_email', history: sendEmailSingletonRunning() },
        { workflowId: 'send_email_single', history: sendSingleEmail() },
      ])
    );

    const { stdout } = await promisify(execFile)(
      process.execPath,
      ['-e', REPLAY_SCRIPT, historiesPath],
      {
        cwd: resolve(__dirname, '../../../..'),
        maxBuffer: 20 * 1024 * 1024,
      }
    );
    const results = JSON.parse(stdout.split('REPLAY_RESULT').pop() || '{}');

    expect(results).toEqual({
      'autopost-auto-1': null,
      'autopost-patched': null,
      'missing-patched': null,
      'missing-post-workflow': null,
      send_email: null,
      send_email_single: null,
    });
  }, 300_000);
});
