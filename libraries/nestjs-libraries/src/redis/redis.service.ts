import { Redis } from 'ioredis';

// Create a mock Redis implementation for testing environments
class MockRedis {
  private data: Map<string, any> = new Map();

  private expires = new Map<string, number>();

  async get(key: string) {
    if ((this.expires.get(key) ?? Infinity) <= Date.now()) {
      this.data.delete(key);
      this.expires.delete(key);
    }
    return this.data.get(key);
  }

  async set(key: string, value: any, ...args: Array<string | number>) {
    // Checagem sincrona: NX precisa ser atomico tambem no fallback local.
    if ((this.expires.get(key) ?? Infinity) <= Date.now()) {
      this.data.delete(key);
      this.expires.delete(key);
    }
    if (args.includes('NX') && this.data.has(key)) return null;
    this.data.set(key, value);
    const ex = args.indexOf('EX');
    if (ex >= 0) this.expires.set(key, Date.now() + Number(args[ex + 1]) * 1000);
    else this.expires.delete(key);
    return 'OK';
  }

  async del(key: string) {
    await this.get(key);
    this.expires.delete(key);
    return this.data.delete(key) ? 1 : 0;
  }

  // Add other Redis methods as needed for your tests
}

// Use real Redis if REDIS_URL is defined, otherwise use MockRedis
export const ioRedis = process.env.REDIS_URL
  ? new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: null,
      connectTimeout: 10000,
    })
  : (new MockRedis() as unknown as Redis); // Type cast to Redis to maintain interface compatibility
