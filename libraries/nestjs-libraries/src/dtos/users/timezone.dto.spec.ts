import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { TimezoneDto } from './timezone.dto';

describe('TimezoneDto', () => {
  it.each(['America/Sao_Paulo', 'Asia/Kolkata', 'UTC', null])(
    'aceita fuso IANA ou retorno ao navegador: %s',
    async (timezoneName) => {
      expect(
        await validate(plainToInstance(TimezoneDto, { timezoneName }))
      ).toHaveLength(0);
    }
  );

  it.each([
    {},
    { timezoneName: undefined },
    { timezoneName: '' },
    { timezoneName: 'Mars/Olympus' },
    { timezoneName: 'America/Sao_Paulo ' },
    { timezoneName: 3 },
    { timezoneName: 'x'.repeat(101) },
  ])('recusa payload invalido %j', async (body) => {
    expect(await validate(plainToInstance(TimezoneDto, body))).not.toHaveLength(
      0
    );
  });
});
