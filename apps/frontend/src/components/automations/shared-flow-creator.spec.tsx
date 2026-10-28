import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { SharedFlowCreator } from './shared-flow-creator.component';
import { simpleDefinition } from '@gitroom/nestjs-libraries/database/prisma/flows-v2/flow-definition';
const state = vi.hoisted(() => ({
  fetchApi: vi.fn(),
  replace: vi.fn(),
  toast: vi.fn(),
  flow: null as any,
  query: '',
  channels: [
    { id: 'fb', name: 'Page one', providerIdentifier: 'facebook' },
    { id: 'fb2', name: 'Page two', providerIdentifier: 'facebook' },
    { id: 'ig', name: 'IG one', providerIdentifier: 'instagram' },
  ],
  readiness: { ready: true },
  posts: { posts: [{ id: '123_456', caption: 'Post fixture' }] },
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: state.replace }),
  useSearchParams: () => new URLSearchParams(state.query),
}));
vi.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (key: string) => key,
  useTranslationSettings: () => ({ resolvedLanguage: 'pt' }),
}));
vi.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => state.fetchApi,
}));
vi.mock('@gitroom/react/toaster/toaster', () => ({
  useToaster: () => ({ show: state.toast }),
}));
vi.mock('@gitroom/frontend/hooks/use-current-profile.hook', () => ({
  useCurrentProfile: () => ({ profile: { id: 'profile' } }),
}));
vi.mock('./shared-flow-canvas.component', () => ({
  SharedFlowCanvas: () => <div>canvas</div>,
}));
vi.mock('./hooks/use-shared-flows', () => ({
  useSharedFlowData: (path: string) => ({
    data: path?.startsWith('/automation-scheduled-posts/')
      ? { posts: [] as any[], nextCursor: null as string | null }
      : path === '/flows-v2/channels'
      ? state.channels
      : path?.includes('readiness')
      ? state.readiness
      : path?.includes('posts')
      ? state.posts
      : path === '/flows-v2/flow'
      ? state.flow
      : undefined,
    mutate: vi.fn(),
  }),
}));
beforeEach(() => {
  state.flow = null;
  state.query = '';
  state.channels = [
    { id: 'fb', name: 'Page one', providerIdentifier: 'facebook' },
    { id: 'fb2', name: 'Page two', providerIdentifier: 'facebook' },
    { id: 'ig', name: 'IG one', providerIdentifier: 'instagram' },
  ];
  vi.clearAllMocks();
  state.fetchApi.mockResolvedValue({
    ok: true,
    json: async () => ({ id: 'created' }),
  });
});
afterEach(cleanup);
describe('criador compartilhado', () => {
  it('ordena palavras chave, resposta publica e privada como no Instagram sem mudar a definicao', async () => {
    state.flow = {
      id: 'flow',
      name: 'Ordem',
      status: 'PAUSED',
      revision: 3,
      definition: simpleDefinition({
        keywords: ['quero'],
        message: 'Link privado',
        replyMessages: ['Resposta A', 'Resposta B'],
      }),
      channels: [
        {
          integrationId: 'fb',
          platform: 'facebook',
          postMode: 'all',
          postIds: [],
        },
      ],
    };
    render(<SharedFlowCreator id="flow" />);
    const keywords = screen.getByLabelText('trigger_keywords');
    const toggle = screen.getByRole('switch', {
      name: 'shared_add_public_reply',
    });
    const reply = screen.getByLabelText('shared_public_reply');
    const message = screen.getByLabelText('shared_message');
    const precedes = (a: HTMLElement, b: HTMLElement) =>
      !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(precedes(keywords, toggle)).toBe(true);
    expect(precedes(toggle, reply)).toBe(true);
    expect(precedes(reply, message)).toBe(true);
    expect(
      screen.getAllByPlaceholderText('automation_public_reply_placeholder')
    ).toHaveLength(2);
    expect(
      screen.getByPlaceholderText('automation_private_message_placeholder')
    ).toBe(message);
    expect(screen.getByText('shared_reply_variations_hint')).toBeTruthy();
    fireEvent.change(message, { target: { value: 'Editada' } });
    fireEvent.click(
      screen.getByRole('button', {
        name: /^(save_flow|automation_save_draft|wizard_update)$/,
      })
    );
    await waitFor(() => expect(state.fetchApi).toHaveBeenCalled());
    const graph = JSON.parse(state.fetchApi.mock.calls[0][1].body).definition;
    expect(
      JSON.parse(graph.nodes.find((n: any) => n.type === 'REPLY_COMMENT').data)
    ).toEqual({ messages: ['Resposta A', 'Resposta B'] });
    expect(
      JSON.parse(graph.nodes.find((n: any) => n.type === 'SEND_DM').data)
        .message
    ).toBe('Editada');
  });
  it('abre Messenger diretamente e preserva o canal inicial sem posts', async () => {
    state.query = 'trigger=messenger_message&channel=fb';
    render(<SharedFlowCreator />);
    expect(
      (screen.getByLabelText('messenger_trigger_select') as HTMLSelectElement)
        .value
    ).toBe('messenger_message');
    expect((screen.getByLabelText('flow_name') as HTMLInputElement).value).toBe(
      'automation_name_message'
    );
    expect(screen.queryByLabelText('shared_posts')).toBeNull();
    fireEvent.change(screen.getByLabelText('trigger_keywords'), {
      target: { value: 'quero' },
    });
    fireEvent.blur(screen.getByLabelText('trigger_keywords'));
    fireEvent.change(screen.getByLabelText('shared_message'), {
      target: { value: 'Mensagem' },
    });
    fireEvent.click(
      screen.getByRole('button', {
        name: /^(save_flow|automation_save_draft|wizard_update)$/,
      })
    );
    await waitFor(() => expect(state.fetchApi).toHaveBeenCalled());
    expect(JSON.parse(state.fetchApi.mock.calls[0][1].body).channels).toEqual([
      { integrationId: 'fb', postMode: 'all', postIds: [] },
    ]);
  });
  it('Messenger exige palavra chave, oculta posts/resposta publica e salva prioridade nos dois editores', async () => {
    render(<SharedFlowCreator />);
    fireEvent.change(screen.getByLabelText('flow_name'), {
      target: { value: 'Messenger link' },
    });
    fireEvent.change(screen.getByLabelText('messenger_trigger_select'), {
      target: { value: 'messenger_message' },
    });
    fireEvent.change(screen.getByLabelText('facebook_automation_page'), {
      target: { value: 'fb' },
    });
    expect(screen.queryByLabelText('shared_posts')).toBeNull();
    expect(screen.queryByText('shared_add_public_reply')).toBeNull();
    expect(screen.queryByText('shared_link_hint')).toBeNull();
    fireEvent.click(
      screen.getByRole('button', { name: 'automation_link_help' })
    );
    expect(screen.getByText('messenger_message_hint')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('shared_message'), {
      target: { value: 'Link de teste' },
    });
    fireEvent.click(
      screen.getByRole('button', {
        name: /^(save_flow|automation_save_draft|wizard_update)$/,
      })
    );
    expect(
      screen.getByText('shared_error_messenger_keywords_required')
    ).toBeTruthy();
    expect(state.fetchApi).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('trigger_keywords'), {
      target: { value: 'quero, link' },
    });
    fireEvent.blur(screen.getByLabelText('trigger_keywords'));
    fireEvent.change(screen.getByLabelText('messenger_priority'), {
      target: { value: '25' },
    });
    fireEvent.click(
      screen.getByRole('tab', { name: 'automation_workspace_flow' })
    );
    await screen.findByText('canvas');
    fireEvent.click(
      screen.getByRole('tab', { name: 'automation_workspace_quick' })
    );
    await waitFor(() => expect(screen.queryByText('canvas')).toBeNull());
    fireEvent.click(
      screen.getByRole('button', {
        name: /^(save_flow|automation_save_draft|wizard_update)$/,
      })
    );
    await waitFor(() => expect(state.fetchApi).toHaveBeenCalled());
    const payload = JSON.parse(state.fetchApi.mock.calls[0][1].body);
    expect(payload.channels).toEqual([
      { integrationId: 'fb', postMode: 'all', postIds: [] },
    ]);
    expect(JSON.parse(payload.definition.nodes[0].data)).toMatchObject({
      triggerType: 'messenger_message',
      priority: 25,
      keywords: ['quero', 'link'],
    });
  });
  it('reabre configuracao com message e messages em qualquer ordem e preserva ao trocar editor', async () => {
    const definition = simpleDefinition({ message: 'Link', reply: 'Antiga' });
    definition.nodes[1].data = JSON.stringify({
      messages: ['Lista A', 'Lista B'],
      message: 'Antiga',
    });
    state.flow = {
      id: 'flow',
      name: 'Ambos',
      status: 'PAUSED',
      revision: 3,
      definition,
      channels: [
        {
          integrationId: 'fb',
          platform: 'facebook',
          postMode: 'all',
          postIds: [],
        },
      ],
    };
    render(<SharedFlowCreator id="flow" />);
    expect(screen.queryByText('canvas')).toBeNull();
    expect(
      (screen.getByLabelText('shared_public_reply') as HTMLTextAreaElement)
        .value
    ).toBe('Lista A');
    fireEvent.click(
      screen.getByRole('tab', { name: 'automation_workspace_flow' })
    );
    await screen.findByText('canvas');
    fireEvent.click(
      screen.getByRole('tab', { name: 'automation_workspace_quick' })
    );
    await waitFor(() => expect(screen.queryByText('canvas')).toBeNull());
    fireEvent.change(screen.getByLabelText('flow_name'), {
      target: { value: 'Ambos revisado' },
    });
    fireEvent.click(
      screen.getByRole('button', {
        name: /^(save_flow|automation_save_draft|wizard_update)$/,
      })
    );
    await waitFor(() => expect(state.fetchApi).toHaveBeenCalled());
    expect(
      JSON.parse(
        JSON.parse(state.fetchApi.mock.calls[0][1].body).definition.nodes[1]
          .data
      )
    ).toEqual({ messages: ['Lista A', 'Lista B'], message: 'Antiga' });
  });
  it('edita variacoes salvas sem abrir canvas nem perder alternativas ao salvar', async () => {
    const definition = simpleDefinition({ message: 'Link', reply: 'Antiga' });
    definition.nodes[1].data = JSON.stringify({
      messages: ['Primeira', 'Segunda'],
    });
    state.flow = {
      id: 'flow',
      name: 'Variacoes',
      status: 'PAUSED',
      revision: 3,
      definition,
      channels: [
        {
          integrationId: 'fb',
          platform: 'facebook',
          name: 'Page one',
          postMode: 'all',
          postIds: [],
        },
      ],
    };
    render(<SharedFlowCreator id="flow" />);
    expect(screen.queryByText('canvas')).toBeNull();
    fireEvent.change(screen.getByLabelText('shared_reply_variant 2'), {
      target: { value: 'Atualizada' },
    });
    fireEvent.click(
      screen.getAllByRole('button', { name: 'wizard_add_reply_variant' })[0]
    );
    fireEvent.change(screen.getByLabelText('shared_reply_variant 3'), {
      target: { value: 'Terceira' },
    });
    fireEvent.focus(screen.getByLabelText('shared_reply_variant 3'));
    expect(screen.queryByLabelText('shared_reply_preview')).toBeNull();
    expect(
      within(screen.getByRole('complementary')).getByText('Terceira')
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole('button', {
        name: /^(save_flow|automation_save_draft|wizard_update)$/,
      })
    );
    await waitFor(() => expect(state.fetchApi).toHaveBeenCalled());
    const body = JSON.parse(state.fetchApi.mock.calls[0][1].body);
    expect(JSON.parse(body.definition.nodes[1].data)).toEqual({
      messages: ['Primeira', 'Atualizada', 'Terceira'],
    });
  });
  it('recusa variacao vazia e desativar resposta publica remove a lista inteira', async () => {
    state.flow = {
      id: 'flow',
      name: 'Variacoes',
      status: 'PAUSED',
      revision: 3,
      definition: simpleDefinition({ message: 'Link', reply: 'Antiga' }),
      channels: [
        {
          integrationId: 'fb',
          platform: 'facebook',
          postMode: 'all',
          postIds: [],
        },
      ],
    };
    render(<SharedFlowCreator id="flow" />);
    fireEvent.click(
      screen.getAllByRole('button', { name: 'wizard_add_reply_variant' })[0]
    );
    fireEvent.click(
      screen.getByRole('button', {
        name: /^(save_flow|automation_save_draft|wizard_update)$/,
      })
    );
    expect(screen.getByText('shared_error_invalid_message')).toBeTruthy();
    expect(state.fetchApi).not.toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText('shared_add_public_reply'));
    fireEvent.click(
      screen.getByRole('button', {
        name: /^(save_flow|automation_save_draft|wizard_update)$/,
      })
    );
    await waitFor(() => expect(state.fetchApi).toHaveBeenCalled());
    expect(
      JSON.parse(state.fetchApi.mock.calls[0][1].body).definition.nodes.some(
        (n: any) => n.type === 'REPLY_COMMENT'
      )
    ).toBe(false);
  });
  it('cria somente Facebook e ignora pre-selecao Instagram no link', () => {
    state.query = 'channel=ig';
    render(<SharedFlowCreator />);
    expect(
      screen.queryByRole('heading', {
        name: 'facebook_automation_create_title',
      })
    ).toBeNull();
    expect(screen.queryByText('facebook_automation_creator_intro')).toBeNull();
    expect(screen.getByRole('switch', { name: 'activate_flow' })).toBeTruthy();
    expect(screen.queryByLabelText('IG one · Instagram')).toBeNull();
    expect(screen.queryByText('shared_channels_hint')).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'shared_remove_channel' })
    ).toBeNull();
    expect(state.fetchApi).not.toHaveBeenCalled();
  });
  it('pre-seleciona a Pagina do link sem loop e permite trocar', async () => {
    state.query = 'channel=fb';
    render(<SharedFlowCreator />);
    expect(
      (screen.getByLabelText('facebook_automation_page') as HTMLSelectElement)
        .value
    ).toBe('fb');
    fireEvent.change(screen.getByLabelText('facebook_automation_page'), {
      target: { value: '' },
    });
    fireEvent.change(screen.getByLabelText('facebook_automation_page'), {
      target: { value: 'fb2' },
    });
    expect(
      (screen.getByLabelText('facebook_automation_page') as HTMLSelectElement)
        .value
    ).toBe('fb2');
    expect(state.fetchApi).not.toHaveBeenCalled();
  });
  it('mostra falta de Paginas mesmo com Instagram conectado', () => {
    state.channels = [
      { id: 'ig', name: 'IG one', providerIdentifier: 'instagram' },
    ];
    render(<SharedFlowCreator />);
    expect(screen.getByText('facebook_automation_no_pages')).toBeTruthy();
    expect(screen.queryByLabelText('IG one · Instagram')).toBeNull();
  });
  it.each(['facebook', 'instagram'])(
    'mantem edicao V2 de %s na propria rede',
    async (platform) => {
      state.flow = {
        id: 'flow',
        name: 'Salva',
        status: 'PAUSED',
        revision: 4,
        definition: simpleDefinition({ message: 'Oi' }),
        channels: [
          {
            integrationId: platform === 'facebook' ? 'fb' : 'ig',
            platform,
            name: 'Conta',
            postMode: 'all',
            postIds: [],
          },
        ],
      };
      render(<SharedFlowCreator id="flow" />);
      const visible =
        platform === 'facebook'
          ? 'facebook_automation_page'
          : 'select_instagram_account';
      const hidden =
        platform === 'facebook'
          ? 'select_instagram_account'
          : 'facebook_automation_page';
      expect(screen.getByLabelText(visible)).toBeTruthy();
      expect(screen.queryByLabelText(hidden)).toBeNull();
      fireEvent.change(screen.getByLabelText(visible), {
        target: { value: '' },
      });
      expect(screen.queryByLabelText(hidden)).toBeNull();
    }
  );
  it('mantem configuracao e acoes na lateral e alterna previa sem mudar os dois canais', async () => {
    state.flow = {
      id: 'flow',
      name: 'Duas redes',
      status: 'PAUSED',
      revision: 4,
      definition: simpleDefinition({
        message: 'Seu link',
        reply: 'Confira sua mensagem',
      }),
      channels: [
        {
          integrationId: 'fb',
          name: 'Page one',
          platform: 'facebook',
          postMode: 'specific',
          postIds: ['123_456'],
        },
        {
          integrationId: 'ig',
          name: 'IG one',
          platform: 'instagram',
          postMode: 'specific',
          postIds: ['987654'],
        },
      ],
    };
    render(<SharedFlowCreator id="flow" />);
    const configuration = await screen.findByRole('region', {
      name: 'shared_configuration',
    });
    const preview = screen.getByRole('complementary', {
      name: 'shared_preview',
    });
    expect(screen.getByLabelText('flow_name')).toBeTruthy();
    expect(within(configuration).queryByLabelText('flow_name')).toBeNull();
    expect(
      within(configuration).getByLabelText('shared_public_reply')
    ).toBeTruthy();
    expect(
      within(preview).queryByRole('button', {
        name: /^(save_flow|automation_save_draft|wizard_update)$/,
      })
    ).toBeNull();
    fireEvent.change(within(preview).getByLabelText('shared_preview_channel'), {
      target: { value: 'ig' },
    });
    expect(state.fetchApi).not.toHaveBeenCalled();
    fireEvent.change(within(configuration).getByLabelText('shared_message'), {
      target: { value: 'Novo link' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'save_flow' }));
    await waitFor(() => expect(state.fetchApi).toHaveBeenCalled());
    const body = JSON.parse(state.fetchApi.mock.calls[0][1].body);
    expect(body.channels).toEqual(
      state.flow.channels.map(
        ({
          integrationId,
          postMode,
          postIds,
        }: {
          integrationId: string;
          postMode: string;
          postIds: string[];
        }) => ({
          integrationId,
          postMode,
          postIds,
        })
      )
    );
    expect(body.expectedRevision).toBe(4);
    expect(
      body.definition.nodes.find((n: any) => n.type === 'SEND_DM').data
    ).toContain('Novo link');
    expect(
      body.definition.nodes.find((n: any) => n.type === 'REPLY_COMMENT').data
    ).toContain('Confira sua mensagem');
  });
  it('trocar Facebook preserva o Instagram de um fluxo antigo e descarta somente posts da Pagina anterior', async () => {
    state.query = 'trigger=messenger_message';
    state.flow = {
      id: 'flow',
      name: 'Duas contas',
      status: 'PAUSED',
      revision: 6,
      definition: simpleDefinition({ message: 'Mensagem' }),
      channels: [
        {
          integrationId: 'fb',
          name: 'Page one',
          platform: 'facebook',
          postMode: 'specific',
          postIds: ['antigo'],
        },
        {
          integrationId: 'ig',
          name: 'IG one',
          platform: 'instagram',
          postMode: 'specific',
          postIds: ['instagram-original'],
        },
      ],
    };
    render(<SharedFlowCreator id="flow" />);
    fireEvent.change(screen.getByLabelText('facebook_automation_page'), {
      target: { value: 'fb2' },
    });
    fireEvent.click(screen.getAllByText('Post fixture')[1]);
    fireEvent.click(
      screen.getByRole('button', {
        name: /^(save_flow|automation_save_draft|wizard_update)$/,
      })
    );
    await waitFor(() => expect(state.fetchApi).toHaveBeenCalled());
    const body = JSON.parse(state.fetchApi.mock.calls[0][1].body);
    expect(body.channels).toEqual([
      {
        integrationId: 'ig',
        postMode: 'specific',
        postIds: ['instagram-original'],
      },
      { integrationId: 'fb2', postMode: 'specific', postIds: ['123_456'] },
    ]);
    expect(JSON.parse(body.definition.nodes[0].data).triggerType).not.toBe(
      'messenger_message'
    );
    expect(body.name).toBe('Duas contas');
  });
  it('salva selecao de canal e post sem levar credenciais ao corpo', async () => {
    render(<SharedFlowCreator />);
    fireEvent.change(screen.getByLabelText('facebook_automation_page'), {
      target: { value: 'fb' },
    });
    expect(
      (screen.getByLabelText('facebook_automation_page') as HTMLSelectElement)
        .multiple
    ).toBe(false);
    fireEvent.click(screen.getByText('Post fixture'));
    fireEvent.change(screen.getByLabelText('flow_name'), {
      target: { value: 'Teste' },
    });
    fireEvent.change(screen.getByLabelText('shared_message'), {
      target: { value: 'https://example.com' },
    });
    fireEvent.click(
      screen.getByRole('button', {
        name: /^(save_flow|automation_save_draft|wizard_update)$/,
      })
    );
    await waitFor(() =>
      expect(state.replace).toHaveBeenCalledWith('/automations/created')
    );
    const body = JSON.parse(state.fetchApi.mock.calls[0][1].body);
    expect(body.channels).toEqual([
      { integrationId: 'fb', postMode: 'specific', postIds: ['123_456'] },
    ]);
    expect(
      body.definition.nodes.find((node: any) => node.type === 'SEND_DM').data
    ).toContain('https://example.com');
    expect(Object.keys(body)).toEqual(['name', 'channels', 'definition']);
  });
  it('mostra validacao inline sem chamar API e permite canvas somente leitura ativo', async () => {
    const { unmount } = render(<SharedFlowCreator />);
    fireEvent.click(
      screen.getByRole('button', {
        name: /^(save_flow|automation_save_draft|wizard_update)$/,
      })
    );
    expect(screen.getByText('shared_error_channel_required')).toBeTruthy();
    expect(state.fetchApi).not.toHaveBeenCalled();
    unmount();
    state.flow = {
      id: 'flow',
      name: 'Ativa',
      status: 'ACTIVE',
      revision: 4,
      definition: simpleDefinition({ message: 'Oi' }),
      channels: [],
    };
    render(<SharedFlowCreator id="flow" />);
    const visual = screen.getByRole('tab', {
      name: 'automation_workspace_flow',
    });
    expect((visual as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(visual);
    await screen.findByText('canvas');
  });
  it('preserva conflito com Instagram legado ao ativar em vez de pedir apenas recarregamento', async () => {
    state.flow = {
      id: 'flow',
      name: 'Pausada',
      status: 'PAUSED',
      revision: 4,
      definition: simpleDefinition({ message: 'Oi' }),
      channels: [
        {
          integrationId: 'ig',
          platform: 'instagram',
          postMode: 'all',
          postIds: [],
        },
      ],
    };
    state.fetchApi.mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ message: 'LEGACY_COMMENT_FLOW_ACTIVE' }),
    });
    render(<SharedFlowCreator id="flow" />);
    fireEvent.click(screen.getByRole('switch', { name: 'activate_flow' }));
    expect(
      await screen.findByText('shared_error_legacy_comment_flow_active')
    ).toBeTruthy();
  });
  it('permite remover canal salvo indisponivel para reparar o fluxo', async () => {
    state.flow = {
      id: 'flow',
      name: 'Pausada',
      status: 'PAUSED',
      revision: 4,
      definition: simpleDefinition({ message: 'Oi' }),
      channels: [
        {
          integrationId: 'removed',
          name: 'Canal removido',
          platform: 'facebook',
          postMode: 'all',
          postIds: [],
        },
      ],
    };
    render(<SharedFlowCreator id="flow" />);
    expect(
      (screen.getByLabelText('facebook_automation_page') as HTMLSelectElement)
        .value
    ).toBe('removed');
    fireEvent.change(screen.getByLabelText('facebook_automation_page'), {
      target: { value: '' },
    });
    expect(
      (screen.getByLabelText('facebook_automation_page') as HTMLSelectElement)
        .value
    ).toBe('');
  });
  it('mantem fluxo personalizado no canvas e permite salvar revisao ativa', async () => {
    const graph = simpleDefinition({ message: 'Oi' });
    graph.nodes.push({
      id: 'wait',
      type: 'DELAY',
      data: '{"duration":1}',
      positionX: 0,
      positionY: 0,
    });
    state.flow = {
      id: 'flow',
      name: 'Ativa',
      status: 'ACTIVE',
      revision: 4,
      definition: graph,
      channels: [],
    };
    render(<SharedFlowCreator id="flow" />);
    await screen.findByText('canvas');
    expect(
      (
        screen.getByRole('tab', {
          name: 'automation_workspace_quick',
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true);
    expect(screen.queryByRole('button', { name: 'wizard_update' })).toBeNull();
    expect(
      (screen.getByRole('switch', { name: 'pause_flow' }) as HTMLButtonElement)
        .disabled
    ).toBe(false);
    expect(state.fetchApi).not.toHaveBeenCalled();
  });
});

describe('respostas e estado do Facebook', () => {
  it('mostra falha de status no historico sem depender do rodape', async () => {
    state.query = 'tab=history';
    state.flow = {
      id: 'flow',
      name: 'Historico',
      status: 'ACTIVE',
      revision: 4,
      definition: simpleDefinition({ message: 'Mensagem' }),
      channels: [],
    };
    state.fetchApi.mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ message: 'REVISION_CONFLICT' }),
    });
    render(<SharedFlowCreator id="flow" />);
    expect(screen.queryByLabelText('automation_editor_actions')).toBeNull();
    fireEvent.click(screen.getByRole('switch', { name: 'pause_flow' }));
    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'shared_error_revision_conflict'
    );
    expect(
      screen
        .getByRole('switch', { name: 'pause_flow' })
        .getAttribute('aria-checked')
    ).toBe('true');
    expect(state.fetchApi).toHaveBeenCalledTimes(1);
  });
  it('move resposta publica para Resposta e link direciona a previa para DM', () => {
    render(<SharedFlowCreator />);
    fireEvent.change(screen.getByLabelText('facebook_automation_page'), {
      target: { value: 'fb' },
    });
    const section = screen
      .getByRole('switch', { name: 'shared_add_public_reply' })
      .closest('section')!;
    fireEvent.click(
      within(section).getByRole('switch', { name: 'shared_add_public_reply' })
    );
    fireEvent.change(screen.getByLabelText('shared_public_reply'), {
      target: { value: 'Veja o Messenger' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'preview_tab_comments' })
    );
    fireEvent.click(screen.getByRole('button', { name: '+ story_add_link' }));
    expect(
      screen
        .getByRole('button', { name: 'preview_tab_dm' })
        .getAttribute('aria-pressed')
    ).toBe('true');
    expect(screen.queryByText('wizard_specific_post')).toBeNull();
    expect(screen.getByText('automation_facebook_specific_post')).toBeTruthy();
  });
  it('pausar preserva texto nao salvo e nao envia save antes da pausa', async () => {
    state.flow = {
      id: 'flow',
      name: 'Fixture',
      status: 'ACTIVE',
      revision: 3,
      definition: simpleDefinition({ message: 'Original' }),
      channels: [
        {
          integrationId: 'fb',
          platform: 'facebook',
          postMode: 'all',
          postIds: [],
        },
      ],
    };
    state.fetchApi.mockResolvedValue({
      ok: true,
      json: async () => ({ ...state.flow, status: 'PAUSED', revision: 4 }),
    });
    render(<SharedFlowCreator id="flow" />);
    fireEvent.change(screen.getByLabelText('shared_message'), {
      target: { value: 'Edicao local' },
    });
    fireEvent.click(screen.getByRole('switch', { name: 'pause_flow' }));
    await waitFor(() =>
      expect(state.fetchApi).toHaveBeenCalledWith(
        '/flows-v2/flow/status',
        expect.anything()
      )
    );
    expect(screen.getByLabelText('shared_message')).toHaveProperty(
      'value',
      'Edicao local'
    );
    expect(state.fetchApi).toHaveBeenCalledTimes(1);
  });
});

it('falha de ativacao apos salvar preserva origem do atalho e retry nao cria nem salva novamente', async () => {
  state.query = 'channel=fb';
  state.fetchApi.mockImplementation(async (path: string) =>
    path === '/flows-v2'
      ? {
          ok: true,
          json: async () => ({ id: 'saved', revision: 1, status: 'DRAFT' }),
        }
      : { ok: false, json: async () => ({ message: 'CHANNEL_NOT_READY' }) }
  );
  render(<SharedFlowCreator />);
  fireEvent.click(await screen.findByRole('button', { name: 'Post fixture' }));
  fireEvent.change(screen.getByLabelText('shared_message'), {
    target: { value: 'Mensagem' },
  });
  fireEvent.click(screen.getByRole('switch', { name: 'activate_flow' }));
  await screen.findByText(/automation_activation_failed_saved/);
  expect(state.replace).toHaveBeenCalledWith('/automations/saved');
  expect(
    screen
      .getByRole('button', { name: 'Post fixture' })
      .getAttribute('aria-pressed')
  ).toBe('true');
  fireEvent.click(screen.getByRole('switch', { name: 'activate_flow' }));
  await waitFor(() => expect(state.fetchApi).toHaveBeenCalledTimes(3));
  expect(state.fetchApi.mock.calls.map((c) => c[0])).toEqual([
    '/flows-v2',
    '/flows-v2/saved/status',
    '/flows-v2/saved/status',
  ]);
});

it('Facebook passa a publicacao selecionada para a previa e a navegacao ilustrativa nao grava', async () => {
  state.posts = {
    posts: [
      {
        id: '123_456',
        caption: 'Post fixture',
        thumbnailUrl: '/fb-preview.jpg',
      },
    ],
  } as any;
  state.flow = {
    id: 'flow',
    name: 'Previa',
    status: 'PAUSED',
    revision: 3,
    definition: simpleDefinition({ message: 'Oi' }),
    channels: [
      {
        integrationId: 'fb',
        platform: 'facebook',
        postMode: 'specific',
        postIds: ['123_456'],
      },
    ],
  };
  const { container } = render(<SharedFlowCreator id="flow" />);
  fireEvent.click(screen.getByRole('button', { name: 'preview_tab_post' }));
  await waitFor(() =>
    expect(container.querySelector('img[src="/fb-preview.jpg"]')).toBeTruthy()
  );
  expect(screen.queryByText('preview_no_post')).toBeNull();
  expect(state.fetchApi).not.toHaveBeenCalled();
});
