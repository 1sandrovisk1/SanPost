import 'reflect-metadata';

const mockBot = {
  sendMessage: jest.fn(),
  sendPhoto: jest.fn(),
  sendVideo: jest.fn(),
  sendDocument: jest.fn(),
  sendMediaGroup: jest.fn(),
  getUpdates: jest.fn(),
  getMe: jest.fn(),
  getChat: jest.fn(),
  getChatMember: jest.fn(),
  getFileLink: jest.fn(),
  deleteMessage: jest.fn(),
};
jest.mock('@gitroom/nestjs-libraries/redis/redis.service', () => ({
  ioRedis: { get: jest.fn(), set: jest.fn(), del: jest.fn() },
}));
jest.mock('node-telegram-bot-api', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => mockBot),
}));

import { TelegramProvider } from './telegram.provider';
import { ioRedis } from '@gitroom/nestjs-libraries/redis/redis.service';
import { BadBody } from '@gitroom/nestjs-libraries/integrations/social.abstract';

const telegramError = (error_code: number, description: string) => ({
  code: 'ETELEGRAM',
  response: { body: { ok: false, error_code, description } },
});

// Lote de providers out/2026 — porte do PR upstream #2140: um 400 do Telegram
// e rejeicao permanente (legenda longa, midia que o Telegram nao baixa).
describe('TelegramProvider.sendMessage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('400 "failed to get HTTP URL content" vira BadBody orientando sobre a midia', async () => {
    mockBot.sendMessage.mockRejectedValue(telegramError(400, 'Bad Request: failed to get HTTP URL content'));
    const posting = (new TelegramProvider() as any).sendMessage('chat-1', { message: 'oi', media: [] });
    await expect(posting).rejects.toBeInstanceOf(BadBody);
    await expect(posting).rejects.toThrow(/could not download your media/);
  });

  it('outros 400 viram BadBody com a descricao sem o prefixo', async () => {
    mockBot.sendMessage.mockRejectedValue(telegramError(400, 'Bad Request: chat not found'));
    await expect(
      (new TelegramProvider() as any).sendMessage('chat-1', { message: 'oi', media: [] })
    ).rejects.toThrow(/Telegram rejected the post: chat not found/);
  });

  it('erros que nao sao 400 continuam propagando', async () => {
    mockBot.sendMessage.mockRejectedValue(telegramError(403, 'Forbidden: bot was blocked'));
    let thrown: any;
    try {
      await (new TelegramProvider() as any).sendMessage('chat-1', { message: 'oi', media: [] });
    } catch (err) {
      thrown = err;
    }
    expect(thrown).not.toBeInstanceOf(BadBody);
    expect(thrown?.code).toBe('ETELEGRAM');
  });

  it('sucesso devolve o message_id', async () => {
    mockBot.sendMessage.mockResolvedValue({ message_id: 77 });
    await expect(
      (new TelegramProvider() as any).sendMessage('chat-1', { message: 'oi', media: [] })
    ).resolves.toBe(77);
  });
});

// Handshake /connect: o chat id nunca sai do servidor. getBotId devolve um
// nonce de uso unico (Redis, 10 min) e authenticate so aceita esse nonce —
// antes qualquer chamador vinculava qualquer chat em que o bot estivesse.
describe('TelegramProvider handshake /connect', () => {
  const CHAT = -100123;
  const BOT = 999;
  const groupUpdate = (fromId: number, extra: Record<string, unknown> = {}) => ({
    update_id: 10,
    message: {
      message_id: 5,
      text: '/connect AbCd1234',
      chat: { id: CHAT },
      from: { id: fromId },
      ...extra,
    },
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockBot.getMe.mockResolvedValue({ id: BOT });
    // bot sem permissao de apagar: caminho sem setTimeout
    mockBot.getChatMember.mockImplementation(async (_chat: number, user: number) =>
      user === BOT ? { status: 'member' } : user === 1 ? { status: 'administrator' } : { status: 'member' }
    );
    mockBot.sendMessage.mockResolvedValue({ message_id: 1 });
    (ioRedis.set as jest.Mock).mockResolvedValue('OK');
  });

  it('admin do grupo: grava o chat sob um nonce e devolve so o nonce', async () => {
    mockBot.getUpdates.mockResolvedValue([groupUpdate(1)]);

    const result = await new TelegramProvider().getBotId({ word: 'AbCd1234' });

    expect(result.chatId).toEqual(expect.stringMatching(/^[A-Za-z0-9]{32}$/));
    expect(String(result.chatId)).not.toContain(String(CHAT));
    expect(ioRedis.set).toHaveBeenCalledWith(
      `telegram:connect:${result.chatId}`,
      String(CHAT),
      'EX',
      600
    );
  });

  it('a mesma mensagem /connect so gera um codigo (sem replay apos o TTL)', async () => {
    mockBot.getUpdates.mockResolvedValue([groupUpdate(1)]);
    (ioRedis.set as jest.Mock)
      .mockResolvedValueOnce('OK') // marca a mensagem como usada
      .mockResolvedValueOnce('OK') // nonce
      .mockResolvedValueOnce(null); // segunda tentativa: NX falha

    const provider = new TelegramProvider();
    expect((await provider.getBotId({ word: 'AbCd1234' })).chatId).toBeDefined();
    const second = await provider.getBotId({ word: 'AbCd1234' });

    expect(second.chatId).toBeUndefined();
    expect(ioRedis.set).toHaveBeenCalledWith(
      `telegram:connect-used:${CHAT}:5`,
      '1',
      'EX',
      86400,
      'NX'
    );
  });

  it('membro comum do grupo nao conecta o chat', async () => {
    mockBot.getUpdates.mockResolvedValue([groupUpdate(2)]);

    const result = await new TelegramProvider().getBotId({ word: 'AbCd1234' });

    expect(result.chatId).toBeUndefined();
    const keys = (ioRedis.set as jest.Mock).mock.calls.map((c) => c[0]);
    expect(keys.some((k: string) => /^telegram:connect:/.test(k))).toBe(false);
    expect(mockBot.sendMessage).toHaveBeenCalledWith(CHAT, expect.stringMatching(/administrator/i));
  });

  it('admin anonimo (postando como o grupo) e post de canal conectam', async () => {
    mockBot.getUpdates.mockResolvedValue([
      groupUpdate(1087968824, { sender_chat: { id: CHAT } }),
    ]);
    expect((await new TelegramProvider().getBotId({ word: 'AbCd1234' })).chatId).toBeDefined();

    mockBot.getUpdates.mockResolvedValue([
      { update_id: 11, channel_post: { message_id: 6, text: '/connect AbCd1234', chat: { id: CHAT } } },
    ]);
    expect((await new TelegramProvider().getBotId({ word: 'AbCd1234' })).chatId).toBeDefined();
  });

  it('dois authenticate concorrentes com o mesmo nonce: so quem apaga a chave vence', async () => {
    (ioRedis.get as jest.Mock).mockResolvedValue(String(CHAT));
    (ioRedis.del as jest.Mock).mockResolvedValue(0);

    await expect(
      new TelegramProvider().authenticate({ code: 'N'.repeat(32), codeVerifier: '' })
    ).resolves.toBe('Invalid credentials');
    expect(mockBot.getChat).not.toHaveBeenCalled();
  });

  it('authenticate aceita so o nonce e o consome', async () => {
    (ioRedis.get as jest.Mock).mockResolvedValue(String(CHAT));
    (ioRedis.del as jest.Mock).mockResolvedValue(1);
    mockBot.getChat.mockResolvedValue({ id: CHAT, title: 'Grupo', username: 'grupo' });
    const nonce = 'N'.repeat(32);

    const result = await new TelegramProvider().authenticate({ code: nonce, codeVerifier: '' });

    expect(ioRedis.get).toHaveBeenCalledWith(`telegram:connect:${nonce}`);
    expect(ioRedis.del).toHaveBeenCalledWith(`telegram:connect:${nonce}`);
    expect(mockBot.getChat).toHaveBeenCalledWith(String(CHAT));
    expect(result).toMatchObject({ accessToken: String(CHAT) });
  });

  it('authenticate com chat id cru ou nonce desconhecido devolve Invalid credentials', async () => {
    (ioRedis.get as jest.Mock).mockResolvedValue(null);
    const provider = new TelegramProvider();

    await expect(provider.authenticate({ code: String(CHAT), codeVerifier: '' })).resolves.toBe(
      'Invalid credentials'
    );
    await expect(provider.authenticate({ code: 'N'.repeat(32), codeVerifier: '' })).resolves.toBe(
      'Invalid credentials'
    );
    expect(mockBot.getChat).not.toHaveBeenCalled();
  });
});

describe('TelegramProvider.botIsAdmin', () => {
  it('erro da API nao e despejado no console (a URI da Bot API leva o token)', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockBot.getChatMember.mockRejectedValue(
      Object.assign(new Error('ETELEGRAM: 400'), {
        response: { request: { uri: { href: 'https://api.telegram.org/botSECRET/getChatMember' } } },
      })
    );
    try {
      await expect(new TelegramProvider().botIsAdmin(1, 2)).resolves.toBe(false);
      expect(consoleError).not.toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
    }
  });
});
