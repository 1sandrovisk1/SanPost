import { describe, expect, it } from 'vitest';
import { buildPreviewJourney } from './shared-preview-journey';
const content = {
  message: 'Entrega configurada',
  buttonText: 'Ver link',
  buttonUrl: 'https://example.com',
  openingMessage: 'Abertura',
  openingButton: 'Receber',
  gateMessage: 'Siga a conta',
  gateButton: 'Já segui',
  exhaustedMessage: 'Limite atingido',
};
describe('previa fiel a jornada configurada', () => {
  it('entrega direta nao inventa resposta do destinatario ou segundo envio', () => {
    expect(buildPreviewJourney(content)).toEqual([
      {
        role: 'page',
        text: content.message,
        button: {
          kind: 'link',
          text: content.buttonText,
          url: content.buttonUrl,
        },
      },
    ]);
  });
  it('Messenger mostra mensagem recebida antes da resposta, sem atribuir Story', () => {
    expect(
      buildPreviewJourney({ ...content, incomingMessage: 'preço' }).map((m) => [
        m.role,
        m.text,
      ])
    ).toEqual([
      ['user', 'preço'],
      ['page', content.message],
    ]);
  });
  it('abertura nao confunde botao postback com link de site', () => {
    const result = buildPreviewJourney({
      ...content,
      followGate: true,
      stage: 'opening',
    });
    expect(result).toEqual([
      {
        role: 'page',
        text: 'Abertura',
        button: { kind: 'reply', text: 'Receber' },
      },
    ]);
  });
  it('mostra clique antes da verificacao e o botao correto', () => {
    const result = buildPreviewJourney({
      ...content,
      followGate: true,
      stage: 'gate',
    });
    expect(result.map((m) => m.text)).toEqual([
      'Abertura',
      'Receber',
      'Siga a conta',
    ]);
    expect(result[2].button).toEqual({ kind: 'reply', text: 'Já segui' });
  });
  it('quem segue recebe conteudo somente depois do clique na ilustracao', () => {
    expect(
      buildPreviewJourney({
        ...content,
        followGate: true,
        stage: 'delivery',
      }).map((m) => m.text)
    ).toEqual(['Abertura', 'Receber', 'Entrega configurada']);
  });
  it('tentativas esgotadas nao exibem entrega final', () => {
    const result = buildPreviewJourney({
      ...content,
      followGate: true,
      stage: 'exhausted',
    });
    expect(result.map((m) => m.text)).toEqual([
      'Abertura',
      'Receber',
      'Siga a conta',
      'Já segui',
      'Limite atingido',
    ]);
    expect(result.some((m) => m.button?.kind === 'link')).toBe(false);
  });
  it('Story verifica seguidor sem abertura ou clique inicial inventado', () => {
    expect(
      buildPreviewJourney({
        ...content,
        followGate: true,
        story: true,
        stage: 'gate',
      })
    ).toEqual([{ role: 'page', text: 'Siga a conta' }]);
    expect(
      buildPreviewJourney({
        ...content,
        followGate: true,
        story: true,
        stage: 'delivery',
      })
    ).toHaveLength(1);
  });
});
