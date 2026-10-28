import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';

dayjs.extend(utc);

// Regras do editor de um post criado para varios canais (agendamento por grupo,
// upstream a194e3f4), puras para testar sem o modal.

export interface ExistingChannel {
  integration: string;
  group?: string;
  posts: Array<{
    state?: string;
    releaseId?: string | null;
    publishDate?: string | Date;
  }>;
}

// no ar na plataforma: publicado, ou com erro depois de publicar
// (PublishedWithError guarda o releaseId)
export const isLiveOnPlatform = (post?: ExistingChannel['posts'][number]) =>
  post?.state === 'PUBLISHED' ||
  (post?.state === 'ERROR' && !!post.releaseId && post.releaseId !== 'missing');

// na fila com a data GUARDADA ja vencida: o workflow dorme ate a data lida no
// inicio, entao esse post esta saindo agora
export const isGoingOut = (
  post: ExistingChannel['posts'][number] | undefined,
  now: dayjs.Dayjs
) =>
  post?.state === 'QUEUE' &&
  !!post.publishDate &&
  dayjs.utc(post.publishDate).isBefore(now);

export interface BatchPlanInput {
  type: 'draft' | 'now' | 'schedule' | 'update';
  anchor: ExistingChannel;
  siblings: ExistingChannel[];
  // data escolhida no editor para cada canal irmao (so os que mudaram)
  chosenDates: Record<string, dayjs.Dayjs>;
  // data escolhida para o canal aberto
  anchorDate: dayjs.Dayjs;
  now: dayjs.Dayjs;
}

// Canais que pedem a pergunta "so atualizar / republicar" em agendar/agora
export const channelsNeedingRepublishChoice = ({
  type,
  anchor,
  siblings,
  anchorDate,
  now,
}: BatchPlanInput) => {
  if (type !== 'now' && type !== 'schedule') {
    return [];
  }
  const anchorOut =
    isLiveOnPlatform(anchor.posts[0]) ||
    (anchor.posts[0]?.state === 'QUEUE' && now.isAfter(anchorDate));
  return [
    ...(anchorOut ? [anchor] : []),
    ...siblings.filter(
      (s) => isLiveOnPlatform(s.posts[0]) || isGoingOut(s.posts[0], now)
    ),
  ];
};

// Irmao fora do ar cuja data foi MUDADA para o passado ao agendar: o backend
// publicaria na hora — o editor recusa (rascunho nao publica; "agora" ignora a
// data por canal)
export const siblingsMovedToPast = ({
  type,
  siblings,
  chosenDates,
  now,
}: BatchPlanInput) =>
  type !== 'schedule'
    ? []
    : siblings.filter((s) => {
        const chosen = chosenDates[s.integration];
        const stored = s.posts[0]?.publishDate;
        if (!chosen || !stored || isLiveOnPlatform(s.posts[0])) {
          return false;
        }
        return (
          chosen.isBefore(now) && !chosen.isSame(dayjs.utc(stored), 'minute')
        );
      });

// Canais salvos so com "update" (mantem estado e data guardada), o resto vai
// com o tipo escolhido
export const updateOnlyChannels = (
  input: BatchPlanInput,
  republishChoice: 'update' | 'republish' | undefined
) => {
  const { type, anchor, siblings, now } = input;
  const asking = channelsNeedingRepublishChoice(input);
  const updateOnly = new Set<string>();

  if (republishChoice === 'update') {
    asking.forEach((c) => updateOnly.add(c.integration));
  }

  if (type === 'schedule') {
    // irmao que ja esta saindo nao e agendado de novo
    siblings
      .filter((s) => isGoingOut(s.posts[0], now))
      .forEach((s) => {
        if (republishChoice !== 'republish') {
          updateOnly.add(s.integration);
        }
      });
  }

  // rascunho num lote nao leva para rascunho o que ja esta no ar (post de um
  // canal so segue o comportamento antigo)
  if (type === 'draft' && siblings.length) {
    [anchor, ...siblings]
      .filter((c) => isLiveOnPlatform(c.posts[0]))
      .forEach((c) => updateOnly.add(c.integration));
  }

  return [...updateOnly];
};

// Data de cada canal no envio: o que esta saindo e so atualiza vai com a data
// guardada (o workflow ja leu a data e nao a relê); os demais — inclusive
// publicados — com a escolhida no editor
export const channelDateForSave = (
  channel: ExistingChannel | undefined,
  updateOnly: string[],
  chosen: dayjs.Dayjs | undefined,
  now: dayjs.Dayjs
) => {
  if (
    channel &&
    updateOnly.includes(channel.integration) &&
    isGoingOut(channel.posts[0], now)
  ) {
    return dayjs
      .utc(channel.posts[0].publishDate)
      .format('YYYY-MM-DDTHH:mm:ss');
  }
  return chosen ? chosen.utc().format('YYYY-MM-DDTHH:mm:ss') : undefined;
};

// Duas requisicoes: primeiro os canais que so atualizam, depois o resto
export const splitBatchRequests = <T extends { integration: { id: string } }>(
  posts: T[],
  updateOnly: string[],
  type: string
) =>
  [
    {
      type: 'update',
      posts: posts.filter((p) => updateOnly.includes(p.integration.id)),
    },
    {
      type,
      posts: posts.filter((p) => !updateOnly.includes(p.integration.id)),
    },
  ].filter((request) => request.posts.length);
