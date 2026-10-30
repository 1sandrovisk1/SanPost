import { DiscordProvider } from './discord.provider';
describe('DiscordProvider.handleErrors', () => {
  it('token do bot recusado vira erro acionavel sem pedir reconexao', () => {
    expect(new DiscordProvider().handleErrors('401: Unauthorized')).toEqual({
      type: 'bad-body',
      value: expect.stringMatching(/bot token/i),
    });
  });
  it('mantem retentativa para limite de requisicoes', () => {
    expect(new DiscordProvider().handleErrors('20028')).toMatchObject({
      type: 'retry',
    });
  });
});
