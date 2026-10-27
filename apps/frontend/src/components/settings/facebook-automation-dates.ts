import { fallbackLng } from '../../../../../libraries/react-shared-libraries/src/translation/i18n.config';

/** These options are only for text rendered by React, which escapes the result. */
export function facebookSetupDateOptions(value: string, language?: string) {
  const date = new Date(value);
  const resolved = language || fallbackLng;
  const locale = resolved === 'pt' ? 'pt-BR' : resolved.replace('_', '-');
  return {
    time: Number.isNaN(date.getTime())
      ? '—'
      : new Intl.DateTimeFormat(locale, {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }).format(date),
    interpolation: { escapeValue: false },
  };
}
