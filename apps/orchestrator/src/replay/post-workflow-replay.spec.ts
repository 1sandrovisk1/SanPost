import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { promisify } from 'node:util';

import {
  parseReplayArguments,
  replayPostWorkflowHistory,
  resolveReplayHistoryPath,
} from './post-workflow-replay';

const startedHistory = (workflowType = 'postWorkflowV102') => ({
  events: [
    {
      eventId: '1',
      eventType: 'EVENT_TYPE_WORKFLOW_EXECUTION_STARTED',
      workflowExecutionStartedEventAttributes: {
        workflowType: { name: workflowType },
      },
    },
  ],
});

describe('post workflow history replay', () => {
  const cwd = '/workspace';

  it('compila o bundle real sem depender do caminho da maquina upstream', async () => {
    const repoRoot = resolve(__dirname, '../../../..');
    const script = [
      "const { bundleWorkflowCode } = require('@temporalio/worker');",
      "const { resolve } = require('node:path');",
      'bundleWorkflowCode({',
      "workflowsPath: resolve('apps/orchestrator/src/workflows/index.ts'),",
      '}).then((bundle) => process.stdout.write(String(bundle.code.length)));',
    ].join('');

    await expect(
      promisify(execFile)(process.execPath, ['-e', script], { cwd: repoRoot })
    ).resolves.toEqual(
      expect.objectContaining({ stdout: expect.stringMatching(/^\d+$/) })
    );
  });

  it('reproduz V112 anterior sem o marcador de persistencia do aceite', async () => {
    const repoRoot = resolve(__dirname, '../../../..');
    const fixture = resolve(__dirname, 'fixtures/v112-before-accepted-reference.json');
    const workflows = resolve(__dirname, '../workflows/index.ts');
    const script = [
      "const { Worker, Runtime } = require('@temporalio/worker');",
      "const { temporal } = require('@temporalio/proto');",
      "const fs = require('node:fs');",
      `const history = temporal.api.history.v1.History.fromObject(JSON.parse(fs.readFileSync(${JSON.stringify(fixture)}, 'utf8')));`,
      `Worker.runReplayHistory({ workflowsPath: ${JSON.stringify(workflows)} }, history, 'fixture-before-marker').then(() => Runtime.instance().shutdown()).then(() => process.stdout.write('ok'));`,
    ].join('');
    await expect(promisify(execFile)(process.execPath, ['-e', script], { cwd: repoRoot })).resolves.toEqual(expect.objectContaining({ stdout: 'ok' }));
  }, 30000);

  it('remove o separador que o pnpm repassa ao script', () => {
    expect(
      parseReplayArguments(['--', 'tmp/temporal-replay/meta.json', 'post_1'])
    ).toEqual({
      historyPath: 'tmp/temporal-replay/meta.json',
      workflowId: 'post_1',
    });
  });

  it('aceita somente JSON dentro do diretorio temporario ignorado pelo Git', () => {
    expect(resolveReplayHistoryPath('tmp/temporal-replay/meta.json', cwd)).toBe(
      resolve(cwd, 'tmp/temporal-replay/meta.json')
    );

    expect(() =>
      resolveReplayHistoryPath('docs/meta-production.json', cwd)
    ).toThrow('tmp/temporal-replay');
    expect(() =>
      resolveReplayHistoryPath('tmp/temporal-replay/meta.txt', cwd)
    ).toThrow('arquivo .json');
  });

  it('recusa historico de workflow fora da lista de replay', async () => {
    const readFile = jest
      .fn()
      .mockResolvedValue(JSON.stringify(startedHistory('streakWorkflow')));
    const runReplayHistory = jest.fn();

    await expect(
      replayPostWorkflowHistory('tmp/temporal-replay/streak.json', {
        cwd,
        readFile,
        runReplayHistory,
        workflowsPath: '/workspace/apps/orchestrator/src/workflows/index.ts',
      })
    ).rejects.toThrow('workflow suportado pelo replay');
    expect(runReplayHistory).not.toHaveBeenCalled();
  });

  it.each([
    'autoPostWorkflow',
    'missingPostWorkflow',
    'sendEmailWorkflow',
    'sendSingleEmailWorkflow',
  ])(
    'aceita %s, cujo codigo mudou com patched() ou fila nova',
    async (workflowType) => {
      const history = startedHistory(workflowType);
      const readFile = jest.fn().mockResolvedValue(JSON.stringify(history));
      const runReplayHistory = jest.fn().mockResolvedValue(undefined);

      await expect(
        replayPostWorkflowHistory('tmp/temporal-replay/loop.json', {
          cwd,
          readFile,
          runReplayHistory,
          workflowsPath: '/workspace/apps/orchestrator/src/workflows/index.ts',
        })
      ).resolves.toEqual(expect.objectContaining({ workflowType }));
      expect(runReplayHistory).toHaveBeenCalledTimes(1);
    }
  );

  it('executa o replay real pelo SDK sem registrar o conteudo do historico', async () => {
    const history = startedHistory();
    const readFile = jest.fn().mockResolvedValue(JSON.stringify(history));
    const runReplayHistory = jest.fn().mockResolvedValue(undefined);

    await expect(
      replayPostWorkflowHistory('tmp/temporal-replay/facebook.json', {
        cwd,
        readFile,
        runReplayHistory,
        workflowsPath: '/workspace/apps/orchestrator/src/workflows/index.ts',
        workflowId: 'post_test',
      })
    ).resolves.toEqual({
      historyPath: resolve(cwd, 'tmp/temporal-replay/facebook.json'),
      workflowType: 'postWorkflowV102',
    });

    expect(runReplayHistory).toHaveBeenCalledWith(
      {
        workflowsPath: '/workspace/apps/orchestrator/src/workflows/index.ts',
      },
      history,
      'post_test'
    );
  });
});
