describe('fallback Redis', () => {
  it('NX e exclusao preservam uso unico mesmo com duas chamadas', async () => {
    const old = process.env.REDIS_URL;
    delete process.env.REDIS_URL;
    jest.resetModules();
    try {
      const {ioRedis} = await import('./redis.service');
      expect(await Promise.all([ioRedis.set('claim', '1', 'EX', 900, 'NX'), ioRedis.set('claim', '1', 'EX', 900, 'NX')])).toEqual(['OK', null]);
      expect(await ioRedis.del('claim')).toBe(1);
      expect(await ioRedis.del('claim')).toBe(0);
    } finally { if (old !== undefined) process.env.REDIS_URL = old; }
  });
});
