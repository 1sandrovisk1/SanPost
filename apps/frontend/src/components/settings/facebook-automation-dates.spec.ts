import { beforeAll, describe, expect, it } from 'vitest';
import { createInstance } from 'i18next';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import pt from '../../../../../libraries/react-shared-libraries/src/translation/locales/pt/translation.json';
import en from '../../../../../libraries/react-shared-libraries/src/translation/locales/en/translation.json';
import { facebookSetupDateOptions } from './facebook-automation-dates';

const i18n = createInstance();
// A local wall-clock fixture keeps the assertions independent of the runner's TZ.
// The API still supplies an ISO instant, which the helper renders in that local TZ.
const instant = new Date(2026, 9, 22, 14, 29, 57).toISOString();

beforeAll(async () => {
  await i18n.init({
    resources: { pt: { translation: pt }, en: { translation: en } },
    fallbackLng: 'pt',
  });
});

describe('datas do diagnostico Facebook', () => {
  it('mostra a verificacao em portugues sem entidades HTML e no fuso local', () => {
    const text = i18n.getFixedT('pt')(
      'fb_auto_checked_at',
      facebookSetupDateOptions(instant, 'pt')
    );
    expect(text).toBe('Verificado em 22/10/2026, 14:29:57');
    expect(renderToStaticMarkup(createElement('p', null, text))).toContain(
      '22/10/2026'
    );
    expect(text).not.toContain('&#');
  });

  it('respeita o idioma ingles sem usar o locale padrao do computador', () => {
    const text = i18n.getFixedT('en')(
      'fb_auto_checked_at',
      facebookSetupDateOptions(instant, 'en')
    );
    expect(text).toContain('10/22/2026, 02:29:57 PM');
    expect(text).not.toContain('&#');
  });

  it('formata o recebimento e preserva o escape do React para os outros valores', () => {
    const text = i18n.getFixedT('pt')('fb_auto_received', {
      ...facebookSetupDateOptions(instant, 'pt'),
      postId: '123_456',
      commentId: '<img src=x onerror=alert(1)>',
    });
    expect(text).toContain('22/10/2026, 14:29:57');
    const html = renderToStaticMarkup(createElement('p', null, text));
    expect(html).toContain('&lt;img');
    expect(html).not.toContain('<img');
  });

  it('nao altera o escape global e tolera uma data invalida', () => {
    expect(facebookSetupDateOptions('invalid', 'pt').time).toBe('—');
    expect(
      i18n.getFixedT('pt')('fb_auto_checked_at', { time: '22/10/2026' })
    ).toContain('&#x2F;');
  });
});
