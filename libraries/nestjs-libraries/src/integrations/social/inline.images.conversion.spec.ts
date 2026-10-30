import 'reflect-metadata';

jest.mock('@gitroom/nestjs-libraries/redis/redis.service', () => ({
  ioRedis: { get: jest.fn(), set: jest.fn(), del: jest.fn() },
}));
jest.mock('node-telegram-bot-api', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({})),
}));

import { stripHtmlValidation } from '@gitroom/helpers/utils/strip.html.validation';
import { SocialProvider } from './social.integrations.interface';
import { XProvider } from './x.provider';
import { WordpressProvider } from './wordpress.provider';
import { ListmonkProvider } from './listmonk.provider';
import { TelegramProvider } from './telegram.provider';
import { HashnodeProvider } from './hashnode.provider';

// Mesma conversao que PostActivity faz antes de chamar provider.post()
// (upstream 2aae02fe): so quem declara inlineImages recebe <img>; os outros
// seguem com o texto limpo do editor deles.
const convert = (provider: SocialProvider, content: string, settings = {}) =>
  stripHtmlValidation(
    provider.editor,
    content,
    true,
    false,
    !/<\/?[a-z][\s\S]*>/i.test(content),
    provider.mentionFormat,
    !!provider.inlineImages?.(settings)
  );

describe('conversao do conteudo com imagem inline por provider', () => {
  const env = {
    FRONTEND_URL: process.env.FRONTEND_URL,
    CLOUDFLARE_BUCKET_URL: process.env.CLOUDFLARE_BUCKET_URL,
  };
  const own = 'https://app.exemplo.com/uploads/2026/10/28/abc.png';
  const content = `<p>Titulo</p><img src="${own}" alt="capa"><p>Corpo</p>`;

  beforeEach(() => {
    process.env.FRONTEND_URL = 'https://app.exemplo.com';
    delete process.env.CLOUDFLARE_BUCKET_URL;
  });

  afterAll(() => {
    for (const [key, value] of Object.entries(env)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it.each([
    ['WordPress', new WordpressProvider()],
    ['ListMonk', new ListmonkProvider()],
  ])('%s recebe a imagem no lugar', (_nome, provider) => {
    expect(convert(provider, content)).toBe(
      `<p>Titulo</p><img src="${own}" alt="capa"><p>Corpo</p>`
    );
  });

  it('WordPress/ListMonk nao recebem imagem de fora da instancia', () => {
    const foreign =
      '<p>a</p><img src="https://rastreio.exemplo.net/p.gif" onerror="x()">';
    expect(convert(new WordpressProvider(), foreign)).toBe('<p>a</p>');
    expect(convert(new ListmonkProvider(), foreign)).toBe('<p>a</p>');
  });

  it.each([undefined, {}, { post_type: 'post' }])(
    'X normal remove a imagem e preserva HTML para conversao no sink (%j)',
    (settings) => {
      const x: SocialProvider = new XProvider();
      expect(x.editor).toBe('html');
      expect(x.inlineImages?.(settings)).toBe(false);
      expect(convert(x, content, settings)).toBe('<p>Titulo</p><p>Corpo</p>');
    }
  );

  it('X article preserva a imagem propria no lugar e a formatacao', () => {
    const x: SocialProvider = new XProvider();
    const settings = { post_type: 'article' };
    expect(x.editor).toBe('html');
    expect(x.inlineImages?.(settings)).toBe(true);
    expect(convert(x, content, settings)).toBe(content);
  });

  it('X article remove imagem externa sem perder imagem propria nem texto', () => {
    const mixed = `${content}<img src="https://rastreio.exemplo.net/p.gif" onerror="x()"><p>Final</p>`;

    expect(convert(new XProvider(), mixed, { post_type: 'article' })).toBe(
      `${content}<p>Final</p>`
    );
  });

  it('Telegram (editor html sem inlineImages) perde a imagem', () => {
    expect(convert(new TelegramProvider(), content)).toBe(
      '<p>Titulo</p><p>Corpo</p>'
    );
  });

  it('Hashnode (markdown) perde a imagem', () => {
    const out = convert(new HashnodeProvider(), content);
    expect(out).not.toContain('<img');
    expect(out).toContain('Titulo');
    expect(out).toContain('Corpo');
  });
});
