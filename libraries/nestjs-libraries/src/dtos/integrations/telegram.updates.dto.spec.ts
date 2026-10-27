import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { TelegramUpdatesDto } from './telegram.updates.dto';

const errorsOf = async (query: Record<string, unknown>) => {
  const dto = plainToInstance(TelegramUpdatesDto, query);
  return { dto, props: (await validate(dto)).map((e) => e.property) };
};

// Query de GET /integrations/telegram/updates: o ValidationPipe global usa
// transform sem conversao implicita, entao `id` chega como string.
describe('TelegramUpdatesDto', () => {
  it('converte id numerico vindo da query', async () => {
    const { dto, props } = await errorsOf({ word: 'AbCd1234', id: '123' });
    expect(props).toEqual([]);
    expect(dto.id).toBe(123);
  });

  it('aceita a palavra antiga de 4 caracteres e a nova de 8', async () => {
    expect((await errorsOf({ word: 'AbC1' })).props).toEqual([]);
    expect((await errorsOf({ word: 'AbCd1234' })).props).toEqual([]);
  });

  it.each([
    [{ word: 'ab' }, 'word'],
    [{ word: 'a b c d' }, 'word'],
    [{ word: 'x'.repeat(33) }, 'word'],
    [{ word: 'AbCd1234', id: '-1' }, 'id'],
    [{ word: 'AbCd1234', id: 'abc' }, 'id'],
    [{}, 'word'],
  ])('rejeita %j', async (query, prop) => {
    expect((await errorsOf(query)).props).toContain(prop);
  });
});
