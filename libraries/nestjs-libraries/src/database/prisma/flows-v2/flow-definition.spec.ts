import {
  normalizeDefinition,
  planCommentActions,
  simpleDefinition,
} from './flow-definition';

describe('definicao compartilhada', () => {
  it('seleciona uma variacao por no no caminho executado e interpola depois', () => {
    const graph = simpleDefinition({
      message: 'Link',
      replyMessages: ['Oi {{comment_name}}', 'Confira {{comment_id}}'],
    });
    const choose = jest.fn().mockReturnValue(1);
    expect(
      planCommentActions(graph, { text: '', commentId: '123' }, choose).map(
        (a) => a.text
      )
    ).toEqual(['Confira 123', 'Link']);
    expect(choose).toHaveBeenCalledTimes(1);
    expect(choose).toHaveBeenCalledWith(2);
    expect(
      planCommentActions(graph, { text: '', actorName: 'Ana' }, () => 0)[0].text
    ).toBe('Oi Ana');
    graph.nodes[0].data = '{"keywords":["quero"]}';
    choose.mockClear();
    expect(planCommentActions(graph, { text: 'nao' }, choose)).toEqual([]);
    expect(choose).not.toHaveBeenCalled();
  });
  it('preserva resposta unica e prioriza lista sem enviar todas as alternativas', () => {
    const graph = simpleDefinition({
      message: 'Link',
      reply: 'Antiga',
      replyMessages: ['A', 'B'],
    });
    graph.nodes[1].data = '{"message":"Antiga","messages":["A","B"]}';
    expect(
      planCommentActions(graph, { text: '' }, () => 1).map((a) => a.text)
    ).toEqual(['B', 'Link']);
    const choose = jest.fn();
    expect(
      planCommentActions(
        simpleDefinition({ message: 'Link', reply: 'Unica' }),
        { text: '' },
        choose
      )[0].text
    ).toBe('Unica');
    expect(choose).not.toHaveBeenCalled();
  });
  it.each([[''], ['A', '   '], Array(11).fill('A'), ['A', 'x'.repeat(2201)]])(
    'recusa lista invalida de variacoes: %j',
    (...messages) => {
      expect(() =>
        normalizeDefinition(
          simpleDefinition({
            message: 'Link',
            replyMessages: messages as string[],
          })
        )
      ).toThrow('INVALID_MESSAGE');
    }
  );
  it('aceita dez variacoes e valida tamanho apos interpolacao da selecionada', () => {
    const graph = simpleDefinition({
      message: 'Link',
      replyMessages: Array(10).fill('{{comment_text}}'),
    });
    expect(() => normalizeDefinition(graph)).not.toThrow();
    expect(() =>
      planCommentActions(graph, { text: 'x'.repeat(2201) }, () => 9)
    ).toThrow('MESSAGE_TOO_LONG');
  });
  it('recusa mensagem vazia antes de ativar um fluxo sem efeito', () => {
    expect(() =>
      normalizeDefinition(simpleDefinition({ message: '   ' }))
    ).toThrow('INVALID_MESSAGE');
  });
  it('reutiliza gatilho e mensagem em ambos os destinos', () => {
    const graph = simpleDefinition({
      keywords: ['link'],
      message: 'Ola {{comment_name}}: https://example.com',
    });
    expect(
      planCommentActions(graph, { text: 'Quero LINK', actorName: 'Ana' })
    ).toEqual([
      {
        key: 'private_reply',
        kind: 'private_reply',
        text: 'Ola Ana: https://example.com',
        delaySeconds: 0,
      },
    ]);
    expect(
      planCommentActions(graph, { text: 'outro', actorName: 'Ana' })
    ).toEqual([]);
  });
  it('rejeita capacidades exclusivas do Instagram e ciclos', () => {
    const graph = simpleDefinition({ message: 'Oi' });
    graph.nodes[0].data = JSON.stringify({ triggerType: 'story_reply' });
    expect(() => normalizeDefinition(graph)).toThrow('UNSUPPORTED_TRIGGER');
    graph.nodes[0].data = '{}';
    graph.edges.push({
      id: 'cycle',
      sourceNodeId: 'dm',
      targetNodeId: 'trigger',
    });
    expect(() => normalizeDefinition(graph)).toThrow('INVALID_GRAPH');
  });
  it('agrega DMs e preserva espera e resposta publica', () => {
    const graph = simpleDefinition({ message: 'A', reply: 'Enviado' });
    graph.nodes.push({
      id: 'later',
      type: 'SEND_DM',
      data: '{"message":"B"}',
      positionX: 0,
      positionY: 0,
    });
    graph.edges.push({ id: 'last', sourceNodeId: 'dm', targetNodeId: 'later' });
    expect(
      planCommentActions(graph, { text: '', actorName: '' }).map((a) => a.text)
    ).toEqual(['Enviado', 'A\n\nB']);
  });
  it('limita mensagem agregada e rejeita chaves desconhecidas em vez de perder dados', () => {
    const graph = simpleDefinition({ message: 'x'.repeat(2001) });
    expect(() => normalizeDefinition(graph)).toThrow('MESSAGE_TOO_LONG');
    graph.nodes[1].data = '{"message":"ok","openingDmEnabled":true}';
    expect(() => normalizeDefinition(graph)).toThrow('UNSUPPORTED_CONFIG');
  });
  it('avalia ramos sem duplicar uma resposta privada', () => {
    const graph = simpleDefinition({ message: 'sim' });
    graph.nodes.splice(1, 0, {
      id: 'filter',
      type: 'CONDITION',
      data: '{"keywords":["sim"],"matchMode":"exact"}',
      positionX: 0,
      positionY: 1,
    });
    graph.edges = [
      { id: 'a', sourceNodeId: 'trigger', targetNodeId: 'filter' },
      {
        id: 'b',
        sourceNodeId: 'filter',
        targetNodeId: 'dm',
        sourceHandle: 'match',
      },
    ];
    expect(planCommentActions(graph, { text: 'nao', actorName: '' })).toEqual(
      []
    );
    expect(
      planCommentActions(graph, { text: 'sim', actorName: '' })
    ).toHaveLength(1);
  });
  it('preserva privado antes da espera e resposta publica', () => {
    const graph = simpleDefinition({ message: 'Privado' });
    graph.nodes.push(
      {
        id: 'wait',
        type: 'DELAY',
        data: '{"duration":5,"unit":"seconds"}',
        positionX: 0,
        positionY: 0,
      },
      {
        id: 'public',
        type: 'REPLY_COMMENT',
        data: '{"message":"Publico"}',
        positionX: 0,
        positionY: 0,
      }
    );
    graph.edges.push(
      { id: 'b', sourceNodeId: 'dm', targetNodeId: 'wait' },
      { id: 'c', sourceNodeId: 'wait', targetNodeId: 'public' }
    );
    expect(
      planCommentActions(graph, { text: '' }).map((a) => [
        a.kind,
        a.delaySeconds,
      ])
    ).toEqual([
      ['private_reply', 0],
      ['public_reply', 5],
    ]);
  });
  it('valida DAG convergente em custo limitado', () => {
    const graph = simpleDefinition({ message: 'Oi' });
    graph.edges = [];
    let previous = 'trigger';
    for (let i = 0; i < 28; i++) {
      const id = `condition${i}`;
      graph.nodes.push({
        id,
        type: 'CONDITION',
        data: '{}',
        positionX: 0,
        positionY: 0,
      });
      graph.edges.push({
        id: `${i}m`,
        sourceNodeId: previous,
        targetNodeId: id,
      });
      if (i)
        graph.edges.push({
          id: `${i}n`,
          sourceNodeId: previous,
          targetNodeId: id,
          sourceHandle: 'no_match',
        });
      previous = id;
    }
    graph.edges.push(
      { id: 'lastm', sourceNodeId: previous, targetNodeId: 'dm' },
      {
        id: 'lastn',
        sourceNodeId: previous,
        targetNodeId: 'dm',
        sourceHandle: 'no_match',
      }
    );
    expect(normalizeDefinition(graph).nodes).toHaveLength(30);
  });
  it('rejeita segunda DM apos espera mesmo com condicao intermediaria', () => {
    const graph = simpleDefinition({ message: 'A' });
    graph.nodes.push(
      {
        id: 'wait',
        type: 'DELAY',
        data: '{"duration":1}',
        positionX: 0,
        positionY: 0,
      },
      {
        id: 'filter',
        type: 'CONDITION',
        data: '{}',
        positionX: 0,
        positionY: 0,
      },
      {
        id: 'last',
        type: 'SEND_DM',
        data: '{"message":"B"}',
        positionX: 0,
        positionY: 0,
      }
    );
    graph.edges.push(
      { id: 'a', sourceNodeId: 'dm', targetNodeId: 'wait' },
      { id: 'b', sourceNodeId: 'wait', targetNodeId: 'filter' },
      {
        id: 'c',
        sourceNodeId: 'filter',
        targetNodeId: 'last',
        sourceHandle: 'match',
      }
    );
    expect(() => normalizeDefinition(graph)).toThrow();
  });
  it('nao mistura limite do botao entre ramos mutuamente exclusivos', () => {
    const graph = simpleDefinition({ message: 'x'.repeat(1000) });
    graph.nodes.push(
      {
        id: 'filter',
        type: 'CONDITION',
        data: '{"keywords":["link"]}',
        positionX: 0,
        positionY: 0,
      },
      {
        id: 'button',
        type: 'SEND_DM',
        data: '{"message":"Botao","buttonText":"Abrir","buttonUrl":"https://example.com"}',
        positionX: 0,
        positionY: 0,
      },
      {
        id: 'end',
        type: 'REPLY_COMMENT',
        data: '{"message":"Enviado"}',
        positionX: 0,
        positionY: 0,
      }
    );
    graph.edges = [
      { id: 'a', sourceNodeId: 'trigger', targetNodeId: 'filter' },
      {
        id: 'b',
        sourceNodeId: 'filter',
        targetNodeId: 'dm',
        sourceHandle: 'match',
      },
      {
        id: 'c',
        sourceNodeId: 'filter',
        targetNodeId: 'button',
        sourceHandle: 'no_match',
      },
      { id: 'd', sourceNodeId: 'dm', targetNodeId: 'end' },
      { id: 'e', sourceNodeId: 'button', targetNodeId: 'end' },
    ];
    expect(() => normalizeDefinition(graph)).not.toThrow();
  });
});
describe('alternativas privadas', () => {
  it('escolhe uma unica alternativa antes de renderizar e mantem a chave de entrega', () => {
    const graph = simpleDefinition({
      message: '',
      dmMessages: ['Oi {{comment_name}}', 'Texto {{comment_text}}'],
    });
    expect(
      planCommentActions(graph, { text: 'quero', actorName: 'Ana' }, () => 1)
    ).toEqual([
      {
        key: 'private_reply',
        kind: 'private_reply',
        text: 'Texto quero',
        delaySeconds: 0,
      },
    ]);
  });
  it('valida a maior alternativa do caminho mesmo quando outra seria escolhida', () => {
    const graph = simpleDefinition({
      message: '',
      dmMessages: ['ok', 'x'.repeat(641)],
      buttonText: 'Link',
      buttonUrl: 'https://example.com',
    });
    expect(() => planCommentActions(graph, { text: '' }, () => 0)).toThrow(
      'MESSAGE_TOO_LONG'
    );
  });
  it.each([[[]], [['']], [Array(11).fill('a')], [['x'.repeat(2001)]]])(
    'recusa lista privada invalida %j',
    (messages) => {
      const graph = simpleDefinition({ message: 'base' });
      graph.nodes[1].data = JSON.stringify({ messages });
      expect(() => normalizeDefinition(graph)).toThrow();
    }
  );
});

describe('texto e CTA por alternativa privada', () => {
  const variants = [
    {
      message: 'Primeira',
      buttonText: 'Primeiro',
      buttonUrl: 'https://example.com/a',
    },
    {
      message: 'Segunda',
      buttonText: 'Segundo',
      buttonUrl: 'https://example.com/b',
    },
    { message: 'Sem botao' },
  ];
  const graph = (values = variants) => {
    const g = simpleDefinition({ message: 'old' });
    g.nodes[1].data = JSON.stringify({ variants: values });
    return g;
  };
  it('escolhe o par inteiro sem herdar CTA de outra alternativa', () => {
    for (const i of [0, 1, 2]) {
      const action = planCommentActions(graph(), { text: '' }, () => i)[0];
      expect(action.text).toBe(variants[i].message);
      expect(action.button).toEqual(
        i < 2
          ? { title: variants[i].buttonText, url: variants[i].buttonUrl }
          : undefined
      );
    }
  });
  it('mantem comprimento e botao correlacionados', () => {
    expect(() =>
      normalizeDefinition(
        graph([
          { message: 'x'.repeat(2000) },
          {
            message: 'x'.repeat(600),
            buttonText: 'Link',
            buttonUrl: 'https://example.com',
          },
        ])
      )
    ).not.toThrow();
    expect(() =>
      normalizeDefinition(
        graph([
          {
            message: 'x'.repeat(641),
            buttonText: 'Link',
            buttonUrl: 'https://example.com',
          },
        ])
      )
    ).toThrow();
  });
  it('rejeita representacoes ambiguas e CTA incompleto', () => {
    for (const config of [
      { variants, message: 'old' },
      { variants, messages: ['old'] },
      { variants, buttonText: 'old' },
      { variants: [{ message: 'A', buttonText: 'Link' }] },
      { variants: [{ message: 'A', surprise: true }] },
    ]) {
      const g = graph();
      g.nodes[1].data = JSON.stringify(config);
      expect(() => normalizeDefinition(g)).toThrow();
    }
  });
});
