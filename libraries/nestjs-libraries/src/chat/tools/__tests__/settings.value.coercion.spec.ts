import 'reflect-metadata';
import { PinterestSettingsDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/pinterest.dto';
import {
  coerceSettingValue,
  stringKeysOf,
  tryParseJson,
} from '../settings.value.coercion';

describe('tryParseJson', () => {
  it('reidrata JSON e mantem strings cruas', () => {
    expect(tryParseJson('true')).toBe(true);
    expect(tryParseJson('[1,2]')).toEqual([1, 2]);
    expect(tryParseJson('{"a":1}')).toEqual({ a: 1 });
    expect(tryParseJson('42')).toBe(42);
    expect(tryParseJson('video-id-xyz')).toBe('video-id-xyz');
    expect(tryParseJson('')).toBe('');
  });
});

describe('coerceSettingValue', () => {
  it('mantem crua a chave declarada como string no DTO (board do Pinterest)', () => {
    const keys = stringKeysOf(PinterestSettingsDto);
    expect(keys.has('board')).toBe(true);
    expect(coerceSettingValue(keys, 'board', '549755885175')).toBe('549755885175');
    expect(coerceSettingValue(keys, 'board', '9007199254740993')).toBe('9007199254740993');
  });

  it('continua reidratando chaves sem contrato de string', () => {
    const keys = stringKeysOf(PinterestSettingsDto);
    expect(coerceSettingValue(keys, 'outro', '42')).toBe(42);
    expect(coerceSettingValue(new Set(), 'qualquer', 'true')).toBe(true);
  });
});
