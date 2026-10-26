import 'reflect-metadata';

const mockBot = {
  sendMessage: jest.fn(),
  sendPhoto: jest.fn(),
  sendVideo: jest.fn(),
  sendDocument: jest.fn(),
  sendMediaGroup: jest.fn(),
  getUpdates: jest.fn(),
  getMe: jest.fn(),
};
jest.mock('node-telegram-bot-api', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => mockBot),
}));

import { TelegramProvider } from './telegram.provider';
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
