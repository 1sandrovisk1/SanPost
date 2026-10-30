// Local protocol proof: synthetic services, no database access or paid inference.
process.env.DATABASE_URL = 'postgresql://qa:qa@127.0.0.1:1/unused_proof';
process.env.ENABLE_KNOWLEDGE_BASE = 'false';
process.env.COPILOTKIT_TELEMETRY_DISABLED = 'true';
process.env.DO_NOT_TRACK = '1';
const root = require('node:module').createRequire(
  process.cwd() + '/package.json'
);
root('ts-node').register({
  transpileOnly: true,
  project: process.cwd() + '/apps/backend/tsconfig.json',
});
root('tsconfig-paths/register');
const assert = require('node:assert/strict');
const express = root('express');
const { Agent } = root('@mastra/core/agent');
const { Mastra } = root('@mastra/core/mastra');
const calls = [];
const model = {
  specificationVersion: 'v2',
  provider: 'qa',
  modelId: 'qa',
  supportedUrls: {},
  doStream: async () => ({
    stream: new ReadableStream({
      start(c) {
        for (const event of [
          { type: 'stream-start', warnings: [] },
          { type: 'text-start', id: 'text' },
          { type: 'text-delta', id: 'text', delta: 'Resposta local de teste' },
          { type: 'text-end', id: 'text' },
          {
            type: 'finish',
            finishReason: 'stop',
            usage: { inputTokens: 1, outputTokens: 4, totalTokens: 5 },
          },
        ])
          c.enqueue(event);
        c.close();
      },
    }),
  }),
};
const agent = new Agent({
  id: 'postiz',
  name: 'QA',
  description: 'Teste sem servico externo',
  instructions: 'Responder a verificacao local',
  model: ({ requestContext }) => {
    calls.push({
      org: JSON.parse(requestContext.get('organization')).id,
      profile: requestContext.get('profileId'),
      channels: requestContext.get('integrations'),
      persona: requestContext.get('persona'),
    });
    return model;
  },
});
const mastra = new Mastra({ agents: { postiz: agent } });
const { CopilotController } = root(
  process.cwd() + '/apps/backend/src/api/routes/copilot.controller.ts'
);
let providerUrl = 'http://127.0.0.1:1';
const providerRequests = [];
const controller = new CopilotController(
  {},
  { mastra: async () => mastra },
  { getPersonaForAgent: async (id) => ({ tone: id }) },
  {
    buildOpenAiCompatibleClient: async (_org, profile) => {
      const custom = profile === 'qa-router';
      const baseURL = providerUrl + (custom ? '/router' : '');
      const model = custom ? 'configured/router-model' : 'qa';
      return {
        client: new (root('openai').default)({
          apiKey: 'qa-local',
          baseURL,
        }),
        model,
        languageModel: root('@ai-sdk/openai')
          .createOpenAI({ apiKey: 'qa-local', baseURL })
          .chat(model),
      };
    },
  }
);
(async () => {
  const app = express();
  app.use(express.json());
  app.post('/copilot/chat', (req, res, next) =>
    controller
      .chatAgent(
        req,
        res,
        { id: 'qa-org' },
        { id: req.headers['x-qa-profile'] || 'qa-profile' }
      )
      .catch(next)
  );
  app.use('/qa-provider', (req, res) => {
    providerRequests.push(req.path);
    if (!['/chat/completions', '/router/chat/completions'].includes(req.path))
      return res.status(404).json({
        error: {
          message: 'Only chat completions is supported',
          type: 'not_found',
        },
      });
    assert.equal(
      req.body.model,
      req.path.startsWith('/router') ? 'configured/router-model' : 'qa'
    );
    res.setHeader('content-type', 'text/event-stream');
    if (
      req.body.tools?.some((tool) => tool.function?.name === 'editorAction')
    ) {
      res.write(
        'data: ' +
          JSON.stringify({
            id: 'qa-tool',
            object: 'chat.completion.chunk',
            created: 1,
            model: 'qa',
            choices: [
              {
                index: 0,
                delta: {
                  role: 'assistant',
                  tool_calls: [
                    {
                      index: 0,
                      id: 'call-local',
                      type: 'function',
                      function: {
                        name: 'editorAction',
                        arguments: JSON.stringify({ content: 'Texto local' }),
                      },
                    },
                  ],
                },
                finish_reason: null,
              },
            ],
          }) +
          '\n\n'
      );
      res.write(
        'data: ' +
          JSON.stringify({
            id: 'qa-tool',
            object: 'chat.completion.chunk',
            created: 1,
            model: 'qa',
            choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }],
          }) +
          '\n\n'
      );
      return res.end('data: [DONE]\n\n');
    }

    for (const chunk of [
      {
        id: 'qa-chat',
        object: 'chat.completion.chunk',
        created: 1,
        model: 'qa',
        choices: [
          {
            index: 0,
            delta: {
              role: 'assistant',
              content: 'Resposta do chat compativel',
            },
            finish_reason: null,
          },
        ],
      },
      {
        id: 'qa-chat',
        object: 'chat.completion.chunk',
        created: 1,
        model: 'qa',
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
        usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 },
      },
    ])
      res.write('data: ' + JSON.stringify(chunk) + '\n\n');
    res.end('data: [DONE]\n\n');
  });
  app.post('/copilot/agent', (req, res, next) =>
    controller
      .agent(
        req,
        res,
        { id: req.headers['x-qa-org'] || 'qa-org' },
        { id: req.headers['x-qa-profile'] || 'qa-profile' }
      )
      .catch(next)
  );
  const http = app.listen(0, '127.0.0.1');
  await new Promise((r) => http.once('listening', r));
  const url = 'http://127.0.0.1:' + http.address().port + '/copilot/agent';
  providerUrl = 'http://127.0.0.1:' + http.address().port + '/qa-provider';
  async function post(data, org = 'qa-org', profile = 'qa-profile') {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-qa-org': org,
        'x-qa-profile': profile,
      },
      body: JSON.stringify(data),
    });
    const text = await res.text();
    assert.equal(res.status, 200, text);
    return text;
  }
  try {
    const chatRes = await fetch(url.replace('/agent', '/chat'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        method: 'agent/run',
        params: { agentId: 'default' },
        body: {
          threadId: 'qa-chat-thread',
          runId: 'chat-run',
          messages: [
            { id: 'chat-msg', role: 'user', content: 'Texto do editor' },
          ],
          tools: [],
          context: [],
          state: {},
        },
      }),
    });
    const chatText = await chatRes.text();
    assert.equal(chatRes.status, 200, chatText);
    assert(chatText.includes('Resposta do chat compativel'), chatText);
    assert.deepEqual(providerRequests, ['/chat/completions']);
    console.log(
      'Chat adapter uses local OpenAI-compatible chat completions OK'
    );
    const toolRes = await fetch(url.replace('/agent', '/chat'), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-qa-profile': 'qa-router',
      },
      body: JSON.stringify({
        method: 'agent/run',
        params: { agentId: 'default' },
        body: {
          threadId: 'qa-router-thread',
          runId: 'tool-run',
          messages: [
            { id: 'tool-msg', role: 'user', content: 'Usar ferramenta' },
          ],
          tools: [
            {
              name: 'editorAction',
              description: 'Fixture sem efeitos',
              parameters: {
                type: 'object',
                properties: { content: { type: 'string' } },
                required: ['content'],
              },
            },
          ],
          context: [],
          state: {},
        },
      }),
    });
    const toolText = await toolRes.text();
    assert.equal(toolRes.status, 200, toolText);
    assert(
      toolText.includes('TOOL_CALL_START') &&
        toolText.includes('editorAction') &&
        toolText.includes('Texto local'),
      toolText
    );
    assert(toolText.includes('RUN_FINISHED'), toolText);
    assert.equal(providerRequests.at(-1), '/router/chat/completions');
    console.log(
      'Custom baseURL + configured model + streamed client tool arguments OK'
    );
    const info = JSON.parse(await post({ method: 'info' }));
    assert(info.agents?.postiz, JSON.stringify(info));
    console.log('runtime info agent OK');
    const text = await post({
      method: 'agent/run',
      params: { agentId: 'postiz' },
      body: {
        threadId: 'qa-thread',
        runId: 'qa-run',
        state: {},
        messages: [{ id: 'qa-message', role: 'user', content: 'Teste local' }],
        tools: [],
        context: [],
        forwardedProps: { integrations: ['channel-qa'] },
      },
    });
    assert(text.includes('Resposta local de teste'), text);
    assert(text.includes('RUN_FINISHED'), text);
    assert(calls.length > 0);
    assert.deepEqual(calls.at(-1).channels, ['channel-qa']);
    const list = {
      method: 'resource/request',
      params: { path: '/threads?agentId=postiz', httpMethod: 'GET' },
    };
    assert.equal(
      JSON.parse(await post(list, 'other-org')).threads.length,
      0,
      'Cross-org runtime thread leak'
    );
    assert.equal(
      JSON.parse(await post(list, 'qa-org', 'other-profile')).threads.length,
      0,
      'Cross-profile runtime thread leak'
    );
    const owned = JSON.parse(await post(list)).threads;
    assert.equal(owned.length, 1);
    assert.equal(owned[0].id, 'qa-thread');
    for (const suffix of ['messages', 'events', 'state']) {
      const query = {
        method: 'resource/request',
        params: { path: '/threads/qa-thread/' + suffix, httpMethod: 'GET' },
      };
      const own = await post(query);
      const other = await post(query, 'other-org');
      if (suffix !== 'state')
        assert(
          own.includes('Teste local') || own.includes('Resposta local'),
          own
        );
      assert(
        !other.includes('Teste local') && !other.includes('Resposta local'),
        other
      );
    }
    const connect = {
      method: 'agent/connect',
      params: { agentId: 'postiz' },
      body: {
        threadId: 'qa-thread',
        runId: 'connect',
        messages: [],
        tools: [],
        context: [],
        state: {},
      },
    };
    assert((await post(connect)).includes('Resposta local'));
    assert(!(await post(connect, 'other-org')).includes('Resposta local'));
    for (const data of [
      { method: 'threads/clear' },
      {
        method: 'resource/request',
        params: { path: '/threads/clear', httpMethod: 'POST' },
      },
    ]) {
      const denied = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-qa-org': 'other-org',
        },
        body: JSON.stringify(data),
      });
      assert.equal(denied.status, 405);
    }
    assert.equal(
      JSON.parse(await post(list)).threads.length,
      1,
      'Unrelated clear modified own history'
    );
    console.log(
      'Scoped runtime list/messages/events/state/connect and refused clear OK'
    );
    const { ScopedCopilotRunner } = root(
      process.cwd() +
        '/libraries/nestjs-libraries/src/chat/scoped-copilot-runner.ts'
    );
    const { TelemetryAgentRunner } = root('@copilotkit/runtime');
    const { toArray, lastValueFrom } = root('rxjs');
    const runnerA = new ScopedCopilotRunner('qa-org', 'qa-profile', 'agent');
    const runnerB = new TelemetryAgentRunner({
      runner: new ScopedCopilotRunner('other-org', 'qa-profile', 'agent'),
      telemetry: { capture() {} },
    });
    const replay = await lastValueFrom(
      new TelemetryAgentRunner({ runner: runnerA, telemetry: { capture() {} } })
        .connect({ threadId: 'qa-thread' })
        .pipe(toArray())
    );
    assert(JSON.stringify(replay).includes('Resposta local'));
    assert.equal(
      (
        await lastValueFrom(
          runnerB.connect({ threadId: 'qa-thread' }).pipe(toArray())
        )
      ).length,
      0
    );
    let release;
    let aborted = 0;
    const held = new Promise((resolve) => {
      release = resolve;
    });
    const input = {
      threadId: 'active',
      runId: 'active-run',
      messages: [],
      tools: [],
      context: [],
      state: {},
    };
    const fakeAgent = {
      agentId: 'postiz',
      messages: [],
      async runAgent(value, handlers) {
        handlers.onEvent({
          event: {
            type: 'RUN_STARTED',
            threadId: value.threadId,
            runId: value.runId,
            input: value,
          },
        });
        await held;
      },
      abortRun() {
        aborted++;
        release();
      },
    };
    const completed = lastValueFrom(
      runnerA
        .run({ threadId: 'active', input, agent: fakeAgent })
        .pipe(toArray())
    );
    assert.equal(await runnerB.isRunning({ threadId: 'active' }), false);
    assert.equal(
      await runnerB.stop({ threadId: 'active', runId: 'active-run' }),
      false
    );
    assert.equal(aborted, 0);
    assert.equal(await runnerA.isRunning({ threadId: 'active' }), true);
    assert.equal(
      await runnerA.stop({ threadId: 'active', runId: 'active-run' }),
      true
    );
    await completed;
    assert.equal(aborted, 1);
    console.log(
      'Real telemetry wrapper replay + active-run cross-org stop refused; own stop succeeds'
    );
    console.log(
      'real controller + AG-UI + Mastra V2 model stream OK',
      JSON.stringify(calls)
    );
  } finally {
    http.closeAllConnections();
    await new Promise((r) => http.close(r));
  }
})().catch((e) => {
  console.error(e.stack);
  process.exit(1);
});
