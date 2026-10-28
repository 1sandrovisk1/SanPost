import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { TriggerNode } from './nodes/trigger-node';
vi.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (key: string, fallback: unknown, options?: any) =>
    key + (options?.count !== undefined ? `:${options.count}` : ''),
}));
vi.mock('@xyflow/react', () => ({
  Handle: () => <span />,
  Position: { Bottom: 'bottom' },
}));
afterEach(cleanup);
describe('gatilho por canal preservando Instagram legado', () => {
  it.each(['facebook', 'instagram'])(
    'usa plataforma e selecao especifica para %s',
    (platform) => {
      render(
        <TriggerNode
          {...({
            data: {
              config: '{"keywords":[]}',
              channels: [
                {
                  platform,
                  name: 'Conta',
                  postMode: 'specific',
                  postIds: ['1', '2'],
                },
              ],
            },
          } as any)}
        />
      );
      expect(screen.getByText('history_trigger_comment_on_post')).toBeTruthy();
      expect(screen.queryByText('trigger_node_description')).toBeNull();
      expect(screen.getByText('Conta: shared_selected_count:2')).toBeTruthy();
      expect(screen.queryByText('trigger_posts_all')).toBeNull();
    }
  );
  it('resume ambos os canais com modos independentes', () => {
    render(
      <TriggerNode
        {...({
          data: {
            config: '{}',
            channels: [
              {
                platform: 'facebook',
                name: 'FB',
                postMode: 'all',
                postIds: [],
              },
              {
                platform: 'instagram',
                name: 'IG',
                postMode: 'next_publication',
                postIds: [],
              },
            ],
          },
        } as any)}
      />
    );
    expect(screen.getByText('history_trigger_comment_on_post')).toBeTruthy();
    expect(screen.getByText('FB: shared_all · IG: shared_next')).toBeTruthy();
  });
  it('mantem gatilho e selecao legados sem contexto V2', () => {
    render(
      <TriggerNode
        {...({ data: { config: '{"mode":"next_publication"}' } } as any)}
      />
    );
    expect(screen.getByText('history_trigger_comment_on_post')).toBeTruthy();
    expect(screen.getByText('summary_next_publication')).toBeTruthy();
  });
});
