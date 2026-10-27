import 'reflect-metadata';
import { Body, Controller, INestApplication, Post } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { FacebookAutomationsWebhookController } from './facebook-automations.controller';
import { FacebookAutomationSetupService } from '@gitroom/nestjs-libraries/integrations/automations/facebook-automation-setup.service';
import { facebookAutomationBodyParser } from '@gitroom/nestjs-libraries/integrations/automations/facebook-automation-body-parser';

@Controller('/echo')
class EchoController {
  @Post() echo(@Body() body: unknown) {
    return body;
  }
}

describe('Facebook webhook HTTP', () => {
  let app: INestApplication;
  let base: string;
  const receive = jest.fn().mockResolvedValue({ received: true });
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [FacebookAutomationsWebhookController, EchoController],
      providers: [
        { provide: FacebookAutomationSetupService, useValue: { receive } },
      ],
    }).compile();
    app = module.createNestApplication({ rawBody: true, logger: false });
    app.use('/public/facebook-automations', facebookAutomationBodyParser);
    await app.listen(0, '127.0.0.1');
    base = await app.getUrl();
  });
  afterAll(async () => {
    await app?.close();
  });
  beforeEach(() => receive.mockClear());
  it('preserva corpo bruto acima de 100 KiB e ate 1 MiB', async () => {
    const body =
      '{ "object": "page", "padding": "' + 'x'.repeat(200000) + '" }';
    const result = await fetch(`${base}/public/facebook-automations/123`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-hub-signature-256': 'signature',
      },
      body,
    });
    expect(result.status).toBe(200);
    expect(receive).toHaveBeenCalledWith('123', Buffer.from(body), 'signature');
  });
  it('rejeita mais de 1 MiB antes de chamar o servico', async () => {
    const result = await fetch(`${base}/public/facebook-automations/123`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ padding: 'x'.repeat(1024 * 1024) }),
    });
    expect(result.status).toBe(413);
    expect(receive).not.toHaveBeenCalled();
  });
  it('mantem o parser JSON das demais rotas', async () => {
    const result = await fetch(`${base}/echo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hello: 'world' }),
    });
    expect(await result.json()).toEqual({ hello: 'world' });
  });
});
