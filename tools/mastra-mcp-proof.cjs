// Local protocol proof: synthetic services, no database access or paid inference.
process.env.DATABASE_URL = 'postgresql://qa:qa@127.0.0.1:1/unused_proof';
process.env.ENABLE_KNOWLEDGE_BASE = 'false';
const requireRoot = require('node:module').createRequire(
  process.cwd() + '/package.json'
);
requireRoot('ts-node').register({
  transpileOnly: true,
  project: process.cwd() + '/apps/backend/tsconfig.json',
});
requireRoot('tsconfig-paths/register');
const assert = requireRoot('node:assert/strict');
const express = requireRoot('express');
const { Agent } = requireRoot('@mastra/core/agent');
const { createTool } = requireRoot('@mastra/core/tools');
const { z } = requireRoot('zod');
const { getContext } = requireRoot(
  process.cwd() + '/libraries/nestjs-libraries/src/chat/async.storage.ts'
);
const whoami = createTool({
  id: 'whoami',
  description: 'Identidade de teste sem efeitos',
  inputSchema: z.object({}),
  outputSchema: z.object({
    organization: z.string(),
    profileId: z.string().nullable(),
  }),
  execute: async () => {
    const c = getContext();
    return { organization: c.auth.id, profileId: c.profileId || null };
  },
});
const agent = new Agent({
  id: 'postiz',
  name: 'QA',
  description: 'Agent de teste sem inferencia',
  instructions: 'fixture',
  model: {
    specificationVersion: 'v2',
    provider: 'qa',
    modelId: 'qa',
    supportedUrls: {},
    doGenerate: async () => {
      throw Error('No inference permitted');
    },
  },
  tools: { whoami },
});
const profiles = {
  keyA: { id: 'profileA', organization: { id: 'orgA' } },
  keyB: { id: 'profileB', organization: { id: 'orgB' } },
};
const providers = {
  MastraService: { mastra: async () => ({ getAgent: () => agent }) },
  OrganizationService: {
    getOrgByApiKey: async (key) =>
      key === 'orgKey' ? { id: 'orgOnly' } : null,
  },
  OAuthService: {
    getOrgByOAuthToken: async (token) =>
      token === 'pos_qa'
        ? { organization: { id: 'oauthOrg' }, profileId: 'oauthProfile' }
        : null,
  },
  ProfileService: { getProfileByApiKey: async (key) => profiles[key] || null },
};
(async () => {
  const { startMcp } = requireRoot(
    process.cwd() + '/libraries/nestjs-libraries/src/chat/start.mcp.ts'
  );
  const api = express();
  const http = api.listen(0, '127.0.0.1');
  await new Promise((r) => http.once('listening', r));
  const base = 'http://127.0.0.1:' + http.address().port;
  process.env.NEXT_PUBLIC_BACKEND_URL = base;
  process.env.FRONTEND_URL = base;
  await startMcp({
    get: (token) => providers[token.name],
    use: api.use.bind(api),
  });
  api.use(express.json());
  async function rpc(path, key, version, id, method, params = {}) {
    const res = await fetch(base + path, {
      method: 'POST',
      headers: {
        authorization: 'Bearer ' + key,
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        'mcp-protocol-version': version,
      },
      body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
    });
    const body = await res.text();
    assert.equal(res.status, 200, body);
    let data;
    try {
      data = JSON.parse(body);
    } catch {
      data = JSON.parse(
        body
          .split('\n')
          .find((l) => l.startsWith('data: '))
          .slice(6)
      );
    }
    if (data.error) throw Error(JSON.stringify(data.error));
    return data.result;
  }
  try {
    for (const v of ['2025-03-26', '2025-11-25']) {
      const init = await rpc('/mcp', 'keyA', v, 1, 'initialize', {
        protocolVersion: v,
        capabilities: {},
        clientInfo: { name: 'qa', version: '1' },
      });
      const list = await rpc('/mcp', 'keyA', v, 2, 'tools/list');
      assert(list.tools.some((t) => t.name === 'whoami'));
      const results = await Promise.all([
        rpc('/mcp', 'keyA', v, 3, 'tools/call', {
          name: 'whoami',
          arguments: {},
        }),
        rpc('/mcp', 'keyB', v, 4, 'tools/call', {
          name: 'whoami',
          arguments: {},
        }),
      ]);
      const values = results.map(
        (r) => r.structuredContent || JSON.parse(r.content[0].text)
      );
      assert.deepEqual(values, [
        { organization: 'orgA', profileId: 'profileA' },
        { organization: 'orgB', profileId: 'profileB' },
      ]);
      console.log(
        'protocol',
        v,
        'negotiated',
        init.protocolVersion,
        'isolated contexts OK'
      );
    }
    const { Client, StreamableHTTPClientTransport } = requireRoot(
      '@modelcontextprotocol/client'
    );
    const client = new Client(
      { name: 'qa-modern', version: '1' },
      { versionNegotiation: { mode: { pin: '2026-07-28' } } }
    );
    await client.connect(
      new StreamableHTTPClientTransport(new URL(base + '/mcp'), {
        requestInit: { headers: { authorization: 'Bearer keyB' } },
      })
    );
    const modernTools = await client.listTools();
    assert(modernTools.tools.some((t) => t.name === 'whoami'));
    const modernResult = await client.callTool({
      name: 'whoami',
      arguments: {},
    });
    const identity =
      modernResult.structuredContent ||
      JSON.parse(modernResult.content[0].text);
    assert.deepEqual(identity, { organization: 'orgB', profileId: 'profileB' });
    await client.close();
    console.log('modern 2026-07-28 real client tools/context OK');
    const bad = await fetch(base + '/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    assert.equal(bad.status, 401);
    console.log('unauthenticated rejected');
  } finally {
    http.closeAllConnections();
    await new Promise((r) => http.close(r));
  }
  process.exit(0);
})().catch((e) => {
  console.error(e.stack);
  process.exit(1);
});
