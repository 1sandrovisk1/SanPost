import {
  normalizeDefinition,
  planCommentActions,
  simpleDefinition,
} from './flow-definition';
import { messengerRule, selectMessengerWinner } from './messenger-keywords';

const graph = (priority = 10, keywords = ['link']) =>
  simpleDefinition({
    triggerType: 'messenger_message',
    priority,
    keywords,
    message: 'Aqui esta o link',
  });
describe('palavras chave do Messenger', () => {
  it('exige palavras chave e prioridade inteira limitada', () => {
    expect(() => normalizeDefinition(graph(10, []))).toThrow(
      'MESSENGER_KEYWORDS_REQUIRED'
    );
    for (const priority of [0, 1.5, 1001, NaN])
      expect(() => normalizeDefinition(graph(priority))).toThrow(
        'INVALID_PRIORITY'
      );
  });
  it('planeja uma resposta Messenger e recusa comentarios publicos', () => {
    expect(planCommentActions(graph(), { text: 'Quero LINK' })).toEqual([
      {
        key: 'messenger_reply',
        kind: 'messenger_reply',
        text: 'Aqui esta o link',
        delaySeconds: 0,
      },
    ]);
    expect(() =>
      normalizeDefinition(
        simpleDefinition({
          triggerType: 'messenger_message',
          priority: 10,
          keywords: ['link'],
          message: 'Oi',
          reply: 'Oi',
        })
      )
    ).toThrow('MESSENGER_PUBLIC_REPLY_UNSUPPORTED');
  });
  it('recusa espera de 24 horas no Messenger e preserva o limite dos comentarios', () => {
    const dm = graph();
    dm.nodes.push({
      id: 'delay',
      type: 'DELAY',
      data: '{"duration":86400,"unit":"seconds"}',
      positionX: 0,
      positionY: 0,
    });
    dm.edges = [
      { id: 'a', sourceNodeId: 'trigger', targetNodeId: 'delay' },
      { id: 'b', sourceNodeId: 'delay', targetNodeId: 'dm' },
    ];
    expect(() => normalizeDefinition(dm)).toThrow('MESSENGER_DELAY_TOO_LONG');
    dm.nodes[0].data = '{"triggerType":"comment_on_post"}';
    expect(() => normalizeDefinition(dm)).not.toThrow();
  });
  it('usa a mesma normalizacao na comparacao de regras e no gatilho', () => {
    expect(
      messengerRule(graph(10, [' LINK ', 'preco', 'link'])).fingerprint
    ).toBe(messengerRule(graph(20, ['PRECO', 'link'])).fingerprint);
  });
  it('escolhe a menor prioridade sem depender da ordem e registra perdedores', () => {
    const candidates = [
      { id: 'b', definition: graph(20) },
      { id: 'a', definition: graph(10) },
    ];
    expect(selectMessengerWinner(candidates, 'LINK')).toEqual({
      winner: 'a',
      skipped: ['b'],
    });
    expect(selectMessengerWinner(candidates.reverse(), 'LINK').winner).toBe(
      'a'
    );
    expect(selectMessengerWinner(candidates, 'oi')).toEqual({ skipped: [] });
  });
  it('empate falha fechado e a escolha ocorre antes das condicoes', () => {
    expect(() =>
      selectMessengerWinner(
        [
          { id: 'a', definition: graph() },
          { id: 'b', definition: graph() },
        ],
        'link'
      )
    ).toThrow('MESSENGER_PRIORITY_CONFLICT');
    const noAction = graph(1);
    noAction.nodes.push({
      id: 'condition',
      type: 'CONDITION',
      data: '{"keywords":["outro"]}',
      positionX: 0,
      positionY: 0,
    });
    noAction.edges = [
      { id: 'one', sourceNodeId: 'trigger', targetNodeId: 'condition' },
      {
        id: 'two',
        sourceNodeId: 'condition',
        targetNodeId: 'dm',
        sourceHandle: 'match',
      },
    ];
    expect(planCommentActions(noAction, { text: 'link' })).toEqual([]);
    expect(
      selectMessengerWinner(
        [
          { id: 'a', definition: noAction },
          { id: 'b', definition: graph() },
        ],
        'link'
      ).winner
    ).toBe('a');
  });
});
