import { getMetadataStorage } from 'class-validator';

// Settings values chegam do agent sempre como string (schema compatibilidade
// com Gemini). Tentamos reidratar via JSON.parse — "true", "42", "[...]",
// "{...}" voltam ao tipo nativo; strings cruas ("video-id-xyz") ficam intactas.
export function tryParseJson(value: string): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (
    trimmed === '' ||
    (!/^[\[{]/.test(trimmed) &&
      !/^(true|false|null)$/i.test(trimmed) &&
      !/^-?\d/.test(trimmed))
  ) {
    return value;
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

// Chaves que o DTO do provider declara com @IsString (ex.: board do Pinterest,
// um id so de digitos) ficam cruas: o JSON.parse as transformaria em number —
// arredondando acima de 2^53 — e contrariaria o contrato validado antes.
export const stringKeysOf = (dto?: new () => object): Set<string> => {
  if (!dto) {
    return new Set();
  }
  return new Set(
    getMetadataStorage()
      .getTargetValidationMetadatas(dto, '', false, false)
      .filter((m) => m.name === 'isString')
      .map((m) => m.propertyName)
  );
};

export const coerceSettingValue = (
  stringKeys: Set<string>,
  key: string,
  value: string
): unknown => (stringKeys.has(key) ? value : tryParseJson(value));

// The managed contract also accepts JSON-encoded strings. Keep numeric string
// IDs exact, while retaining the legacy coercion rules for unquoted values.
export function coerceJsonSettingValue(stringKeys: Set<string>, key: string, value: string): unknown {
  if (stringKeys.has(key) && !value.trim().startsWith('"')) return coerceSettingValue(stringKeys, key, value);
  try { return JSON.parse(value); } catch { return coerceSettingValue(stringKeys, key, value); }
}
