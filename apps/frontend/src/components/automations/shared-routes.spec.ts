import { describe, it, expect } from 'vitest';
import { legacyAutomationDestination } from './shared-routes';
describe('rotas antigas', () => {
  it('distingue motores e preserva parametros repetidos', () => {
    expect(
      legacyAutomationDestination(['compartilhada', 'abc'], {
        view: 'history',
        tag: ['a b', 'c'],
      })
    ).toBe('/automations/abc?view=history&tag=a+b&tag=c');
    expect(
      legacyAutomationDestination(['abc', 'wizard'], { view: 'flow' })
    ).toBe('/automations/instagram/abc?view=flow');
    expect(legacyAutomationDestination(['nova'], { type: 'story' })).toBe(
      '/automations/instagram/new?type=story'
    );
    expect(legacyAutomationDestination(['repost', 'nova'], {})).toBe(
      '/automations/reposts/new'
    );
  });
});
