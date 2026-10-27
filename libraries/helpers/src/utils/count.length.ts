// @ts-ignore
import twitter from 'twitter-text';

// Zernio publica nas mesmas redes: zernio-twitter conta como x e
// zernio-threads como threads.
const platformOf = (integrationType: string): string => {
  const base = integrationType.replace(/^zernio-/, '');
  return base === 'twitter' ? 'x' : base;
};

export const textSlicer = (
  integrationType: string,
  end: number,
  text: string
): { start: number; end: number } => {
  if (platformOf(integrationType) !== 'x') {
    return {
      start: 0,
      end,
    };
  }

  const { validRangeEnd, valid } = twitter.parseTweet(text, {
    version: 3,
    maxWeightedTweetLength: end,
    scale: 100,
    defaultWeight: 200,
    emojiParsingEnabled: true,
    transformedURLLength: 23,
    ranges: [
      { start: 0, end: 4351, weight: 100 },
      { start: 8192, end: 8205, weight: 100 },
      { start: 8208, end: 8223, weight: 100 },
      { start: 8242, end: 8247, weight: 100 },
    ],
  });

  return {
    start: 0,
    end: valid ? end : validRangeEnd,
  };
};

export const weightedLength = (text: string): number => {
  return twitter.parseTweet(text).weightedLength;
};

// Comprimento efetivo do texto para o limite de cada rede: X pesa pelo
// twitter-text; Threads limita em bytes UTF-8 (acentos e emoji contam mais);
// as demais contam caracteres.
export const countLength = (integrationType: string, text: string): number => {
  const platform = platformOf(integrationType);
  if (platform === 'x') {
    return weightedLength(text);
  }

  if (platform === 'threads') {
    return new TextEncoder().encode(text).length;
  }

  return text.length;
};

// Unidade do limite, para mensagens de erro: Threads limita em bytes UTF-8.
export const countLengthUnit = (
  integrationType: string
): 'bytes' | 'characters' =>
  platformOf(integrationType) === 'threads' ? 'bytes' : 'characters';
