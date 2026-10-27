import 'reflect-metadata';
import Redis from 'ioredis';
import { randomUUID } from 'node:crypto';
import { FacebookAutomationSetupRepository } from './facebook-automation-setup.repository';
import type { MessengerObservation } from './facebook-messenger-probe';

const describeRedis =
  process.env.MESSENGER_PROBE_REDIS_TEST === 'true' ? describe : describe.skip;
describeRedis(
  'diagnostico Messenger no Redis isolado por prefixo aleatorio',
  () => {
    let redis: Redis;
    let repo: FacebookAutomationSetupRepository;
    let connection: any;
    let arm: any;
    let armKey: string;
    let recordsKey: string;
    let fullKey: string;
    const observation: MessengerObservation = {
      receivedAt: '2026-10-26T00:00:00Z',
      occurredAt: null,
      messageHash: null,
      hasText: true,
      isEcho: false,
      isUnsupported: false,
      fields: { 'message.text': 'string' },
      attachmentTypes: [],
      unknownFieldCount: 0,
      truncated: false,
    };
    beforeEach(async () => {
      redis = new Redis(process.env.REDIS_URL!, {
        lazyConnect: true,
        maxRetriesPerRequest: 0,
      });
      await redis.connect();
      connection = {
        organizationId: `probe-test-${randomUUID()}`,
        profileId: 'test',
        integrationId: 'test',
        appId: '456',
        pageId: '123',
        pageToken: 'TEST',
        appSecret: 'TEST',
      };
      repo = new FacebookAutomationSetupRepository({} as any, {} as any, redis);
      const now = Date.now();
      arm = {
        organizationId: connection.organizationId,
        profileId: 'test',
        integrationId: 'test',
        appId: '456',
        pageId: '123',
        issuedAt: now,
        expiresAt: now + 60000,
        nonce: 'a'.repeat(32),
      };
      const suffix = `${connection.organizationId}:test:test:456:123`;
      armKey = `fbauto:messenger-probe:${suffix}`;
      recordsKey = `fbauto:messenger-probe-records:${suffix}`;
      fullKey = `fbauto:messenger-full-records:${suffix}:${arm.nonce}`;
      await redis.set(armKey, JSON.stringify(arm), 'PXAT', arm.expiresAt);
    });
    afterEach(async () => {
      if (redis) {
        await redis.del(armKey, recordsKey, fullKey);
        await redis.quit();
      }
    });
    it('limita concorrencia de consultas a vinte por Pagina e aplica TTL', async () => {
      const target = {
        appId: String(Date.now()),
        pageId: String(Math.floor(Math.random() * 1000000) + 1),
      };
      const appKey = `fbauto:post-lookup:{${target.appId}}:app`;
      const pageKey = `fbauto:post-lookup:{${target.appId}}:page:${target.pageId}`;
      try {
        const results = await Promise.allSettled(
          Array.from({ length: 40 }, () => repo.consumePostLookupBudget(target))
        );
        expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(
          20
        );
        expect(await redis.ttl(pageKey)).toBeGreaterThan(0);
        expect(await redis.ttl(appKey)).toBeLessThanOrEqual(60);
        await redis.set(appKey, '120', 'EX', 60);
        await expect(
          repo.consumePostLookupBudget({
            ...target,
            pageId: `${target.pageId}9`,
          })
        ).rejects.toThrow('POST_LOOKUP_RATE_LIMITED');
      } finally {
        await redis.del(appKey, pageKey);
      }
    });
    it('inscricoes feed e messages concorrentes preservam campos com retry explicito', async () => {
      const scopedConnection = {
        ...connection,
        pageId:
          String(Date.now()) + String(Math.floor(Math.random() * 1000000)),
      };
      const lockKey = `fbauto:subscription-lock:${scopedConnection.appId}:${scopedConnection.pageId}`;
      let fields = ['message_reads'];
      let release!: () => void;
      let entered!: () => void;
      const start = new Promise<void>((resolve) => {
        entered = resolve;
      });
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      try {
        const first = repo.withPageSubscriptionLock(
          scopedConnection,
          async (assertLease) => {
            const old = [...fields];
            entered();
            await gate;
            await assertLease();
            fields = [...old, 'feed'];
          }
        );
        await start;
        await expect(
          repo.withPageSubscriptionLock(scopedConnection, async () => {
            fields.push('messages');
          })
        ).rejects.toThrow('SUBSCRIPTION_UPDATE_BUSY');
        release();
        await first;
        await repo.withPageSubscriptionLock(
          scopedConnection,
          async (assertLease) => {
            await assertLease();
            fields = [...fields, 'messages'];
          }
        );
        expect(fields).toEqual(['message_reads', 'feed', 'messages']);
        expect(await redis.exists(lockKey)).toBe(0);
        await expect(
          repo.withPageSubscriptionLock(scopedConnection, async () => {
            throw new Error('HTTP_UNKNOWN');
          })
        ).rejects.toThrow('HTTP_UNKNOWN');
        expect(await redis.pttl(lockKey)).toBeGreaterThan(30000);
      } finally {
        release?.();
        await redis.del(lockKey);
      }
    });
    it('limita concorrencia a vinte registros e nao renova armamento nem retencao', async () => {
      await repo.saveMessengerObservation(connection, arm, observation);
      await redis.pexpire(recordsKey, 5000);
      const before = await redis.pttl(armKey);
      await Promise.all(
        Array.from({ length: 30 }, () =>
          repo.saveMessengerObservation(connection, arm, observation)
        )
      );
      expect(await redis.llen(recordsKey)).toBe(20);
      expect(await redis.pttl(recordsKey)).toBeLessThanOrEqual(5000);
      expect(await redis.pttl(armKey)).toBeLessThanOrEqual(before);
    });
    it('captura completa deduplica e limita quatro lotes com vencimento absoluto e desarme', async () => {
      arm.mode = 'full-json';
      arm.testTexts = [
        'Teste Story MultiPost a1b2c3',
        'Teste DM MultiPost a1b2c3',
      ];
      await redis.set(armKey, JSON.stringify(arm), 'PXAT', arm.expiresAt);
      const cipher = {
        encryptJson: (value: unknown) =>
          Buffer.from(JSON.stringify(value)).toString('base64'),
      };
      const receiver = new FacebookAutomationSetupRepository(
        {} as any,
        cipher as any,
        redis
      );
      const oldKey = process.env.ENCRYPTION_KEY;
      process.env.ENCRYPTION_KEY = 'isolated-test';
      const captured = {
        status: 'captured' as const,
        receivedAt: new Date().toISOString(),
        bodyHash: 'a'.repeat(64),
        testIndexes: [0],
        rawJson: '{"test":true}',
      };
      try {
        await Promise.all(
          Array.from({ length: 8 }, () =>
            receiver.saveMessengerFullCapture(connection, arm, captured)
          )
        );
        expect(await redis.llen(fullKey)).toBe(1);
        await Promise.all(
          Array.from({ length: 8 }, (_, i) =>
            receiver.saveMessengerFullCapture(connection, arm, {
              ...captured,
              bodyHash: String(i).repeat(64),
            })
          )
        );
        expect(await redis.llen(fullKey)).toBe(4);
        expect(await redis.pttl(fullKey)).toBeLessThanOrEqual(
          arm.expiresAt - Date.now() + 20
        );
        await redis.del(fullKey, armKey);
        await receiver.saveMessengerFullCapture(connection, arm, captured);
        expect(await redis.exists(fullKey)).toBe(0);
      } finally {
        if (oldKey === undefined) delete process.env.ENCRYPTION_KEY;
        else process.env.ENCRYPTION_KEY = oldKey;
      }
    });
    it('prazo da captura completa vence durante a escrita mesmo com TTL maior', async () => {
      const oldKey = process.env.ENCRYPTION_KEY;
      process.env.ENCRYPTION_KEY = 'isolated-test';
      arm.mode = 'full-json';
      arm.testTexts = [
        'Teste Story MultiPost a1b2c3',
        'Teste DM MultiPost a1b2c3',
      ];
      arm.issuedAt = Date.now() - 1000;
      arm.expiresAt = Date.now() + 30;
      await redis.set(armKey, JSON.stringify(arm), 'PX', 60000);
      const receiver = new FacebookAutomationSetupRepository(
        {} as any,
        { encryptJson: () => 'CIPHER' } as any,
        {
          status: 'ready',
          eval: async (...args: any[]) => {
            await new Promise((resolve) => setTimeout(resolve, 50));
            return (redis.eval as any)(...args);
          },
        } as any
      );
      try {
        await receiver.saveMessengerFullCapture(connection, arm, {
          receivedAt: new Date().toISOString(),
          status: 'captured',
          bodyHash: 'b'.repeat(64),
          testIndexes: [0],
          rawJson: '{"test":true}',
        });
        expect(await redis.exists(fullKey)).toBe(0);
      } finally {
        if (oldKey === undefined) delete process.env.ENCRYPTION_KEY;
        else process.env.ENCRYPTION_KEY = oldKey;
      }
    });

    it('desarmar entre leitura e escrita impede armazenamento', async () => {
      const saved = await repo.getMessengerProbe(connection);
      await redis.del(armKey);
      await repo.saveMessengerObservation(connection, saved!, observation);
      expect(await redis.exists(recordsKey)).toBe(0);
    });
    it('prazo absoluto e revalidado no Lua mesmo com TTL incorretamente maior', async () => {
      arm.issuedAt = Date.now() - 1000;
      arm.expiresAt = Date.now() + 30;
      await redis.set(armKey, JSON.stringify(arm), 'PX', 60000);
      const delayed = {
        status: 'ready',
        eval: async (...args: any[]) => {
          await new Promise((resolve) => setTimeout(resolve, 50));
          return (redis.eval as any)(...args);
        },
      };
      const receiver = new FacebookAutomationSetupRepository(
        {} as any,
        {} as any,
        delayed as any
      );
      await receiver.saveMessengerObservation(connection, arm, observation);
      expect(await redis.exists(recordsKey)).toBe(0);
    });
  }
);
