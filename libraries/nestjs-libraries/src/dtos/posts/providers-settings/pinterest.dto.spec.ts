import 'reflect-metadata';
import { validate } from 'class-validator';
import { PinterestSettingsDto } from './pinterest.dto';

const dto = (board: unknown) =>
  Object.assign(new PinterestSettingsDto(), { board });

// Porte do upstream #2129: o board e o id numerico, nunca o nome.
describe('PinterestSettingsDto.board', () => {
  it('aceita o id numerico do board', async () => {
    await expect(validate(dto('549755885175'))).resolves.toHaveLength(0);
  });

  it('rejeita o nome do board com a orientacao de usar o id', async () => {
    const [error] = await validate(dto('Minhas receitas'));
    expect(error.property).toBe('board');
    expect(Object.values(error.constraints ?? {})[0]).toMatch(
      /numeric board id/
    );
  });

  it('board vazio continua dizendo que o board e obrigatorio (primeira mensagem, a que o Select exibe)', async () => {
    const [error] = await validate(dto(''));
    expect(Object.values(error.constraints ?? {})[0]).toBe('Board is required');
  });
});
