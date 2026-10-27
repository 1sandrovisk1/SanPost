import { vi } from 'vitest';

// JSDOM has no layout engine. Keep the real tooltip events and dismissal logic
// while supplying the browser APIs its positioning library expects.
vi.stubGlobal('CSS', {});
vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
);
