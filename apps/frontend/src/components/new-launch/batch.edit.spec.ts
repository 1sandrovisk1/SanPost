import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import { describe, expect, it } from 'vitest';
import {
  channelDateForSave,
  channelsNeedingRepublishChoice,
  isLiveOnPlatform,
  siblingsMovedToPast,
  splitBatchRequests,
  updateOnlyChannels,
} from './batch.edit';

dayjs.extend(utc);

const now = dayjs.utc('2026-11-10T12:00:00Z');
const ch = (
  integration: string,
  state: string,
  publishDate: string,
  releaseId: string | null = null
) => ({
  integration,
  group: `g-${integration}`,
  posts: [{ state, publishDate, releaseId }],
});
const base = (over: any = {}) => ({
  type: 'schedule' as const,
  anchor: ch('a', 'QUEUE', '2026-11-20T10:00:00Z'),
  siblings: [] as any[],
  chosenDates: {},
  anchorDate: dayjs.utc('2026-11-20T10:00:00Z'),
  now,
  ...over,
});

describe('editor do lote (agendamento por grupo)', () => {
  it('no ar: publicado ou erro com id na plataforma', () => {
    expect(isLiveOnPlatform({ state: 'PUBLISHED' })).toBe(true);
    expect(isLiveOnPlatform({ state: 'ERROR', releaseId: 'vid' })).toBe(true);
    expect(isLiveOnPlatform({ state: 'ERROR', releaseId: 'missing' })).toBe(
      false
    );
    expect(isLiveOnPlatform({ state: 'QUEUE' })).toBe(false);
  });

  it('pergunta republicar para canais no ar ou saindo pela data guardada', () => {
    const input = base({
      siblings: [
        ch('b', 'PUBLISHED', '2026-11-01T10:00:00Z'),
        ch('c', 'QUEUE', '2026-11-10T11:00:00Z'),
        ch('d', 'QUEUE', '2026-11-25T10:00:00Z'),
      ],
    });
    expect(
      channelsNeedingRepublishChoice(input).map((c) => c.integration)
    ).toEqual(['b', 'c']);
    expect(channelsNeedingRepublishChoice({ ...input, type: 'draft' })).toEqual(
      []
    );
  });

  it('so atualizar vale para os no ar e os saindo; os futuros seguem agendados', () => {
    const input = base({
      siblings: [
        ch('b', 'PUBLISHED', '2026-11-01T10:00:00Z'),
        ch('c', 'QUEUE', '2026-11-10T11:00:00Z'),
        ch('d', 'QUEUE', '2026-11-25T10:00:00Z'),
      ],
    });
    expect(updateOnlyChannels(input, 'update').sort()).toEqual(['b', 'c']);
    // republicar: o publicado volta a sair; o que ja esta saindo tambem
    expect(updateOnlyChannels(input, 'republish')).toEqual([]);
    // sem pergunta (nada no ar), o irmao saindo nao e reagendado
    expect(
      updateOnlyChannels(
        base({ siblings: [ch('c', 'QUEUE', '2026-11-10T11:00:00Z')] }),
        undefined
      )
    ).toEqual(['c']);
  });

  it('rascunho deixa no ar o que ja esta no ar e leva o resto', () => {
    const input = base({
      type: 'draft',
      siblings: [
        ch('b', 'PUBLISHED', '2026-11-01T10:00:00Z'),
        ch('c', 'ERROR', '2026-11-01T10:00:00Z', 'vid'),
        ch('d', 'QUEUE', '2026-11-25T10:00:00Z'),
      ],
    });
    expect(updateOnlyChannels(input, undefined).sort()).toEqual(['b', 'c']);
  });

  it('recusa irmao fora do ar movido para o passado so ao agendar (mesma data guardada passa)', () => {
    const input = base({
      siblings: [
        ch('d', 'QUEUE', '2026-11-25T10:00:00Z'),
        ch('e', 'QUEUE', '2026-11-09T10:00:00Z'),
        ch('f', 'PUBLISHED', '2026-11-01T10:00:00Z'),
      ],
      chosenDates: {
        d: dayjs.utc('2026-11-09T09:00:00Z'),
        e: dayjs.utc('2026-11-09T10:00:00Z'),
        f: dayjs.utc('2026-11-02T10:00:00Z'),
      },
    });
    expect(siblingsMovedToPast(input).map((c) => c.integration)).toEqual(['d']);
    expect(siblingsMovedToPast({ ...input, type: 'draft' })).toEqual([]);
    expect(siblingsMovedToPast({ ...input, type: 'now' })).toEqual([]);
  });

  it('canal aberto: publicado ou na fila com a data escolhida vencida pede a escolha', () => {
    expect(
      channelsNeedingRepublishChoice(
        base({ anchor: ch('a', 'PUBLISHED', '2026-11-01T10:00:00Z') })
      ).map((c) => c.integration)
    ).toEqual(['a']);
    expect(
      channelsNeedingRepublishChoice(
        base({ anchorDate: dayjs.utc('2026-11-09T10:00:00Z') })
      ).map((c) => c.integration)
    ).toEqual(['a']);
    expect(channelsNeedingRepublishChoice(base({ type: 'now' }))).toEqual([]);
  });

  it('rascunho de um post de um canal so segue o comportamento antigo', () => {
    expect(
      updateOnlyChannels(
        base({
          type: 'draft',
          anchor: ch('a', 'PUBLISHED', '2026-11-01T10:00:00Z'),
        }),
        undefined
      )
    ).toEqual([]);
  });

  it('so o canal que esta saindo e so atualiza envia a data guardada', () => {
    const going = ch('c', 'QUEUE', '2026-11-10T11:00:00Z');
    const live = ch('b', 'PUBLISHED', '2026-11-01T10:00:00Z');
    const chosen = dayjs.utc('2026-12-01T10:00:00Z');
    expect(channelDateForSave(going, ['c'], chosen, now)).toBe(
      '2026-11-10T11:00:00'
    );
    expect(channelDateForSave(live, ['b'], chosen, now)).toBe(
      '2026-12-01T10:00:00'
    );
    expect(channelDateForSave(going, [], chosen, now)).toBe(
      '2026-12-01T10:00:00'
    );
    expect(channelDateForSave(undefined, [], undefined, now)).toBeUndefined();
  });

  it('divide em duas requisicoes, primeiro os que so atualizam', () => {
    const posts = [{ integration: { id: 'a' } }, { integration: { id: 'b' } }];
    expect(splitBatchRequests(posts, ['b'], 'schedule')).toEqual([
      { type: 'update', posts: [{ integration: { id: 'b' } }] },
      { type: 'schedule', posts: [{ integration: { id: 'a' } }] },
    ]);
    expect(splitBatchRequests(posts, [], 'draft')).toEqual([
      { type: 'draft', posts },
    ]);
  });
});
