import 'reflect-metadata';
import { validate } from 'class-validator';
import { ZernioPinterestSettingsDto } from './zernio-pinterest.dto';

const dto = (board: unknown) =>
  Object.assign(new ZernioPinterestSettingsDto(), { board });

// O canal via Zernio mantem o contrato anterior (board obrigatorio, sem
// exigir id numerico): o Zernio ignora o valor e usa o primeiro board.
describe('ZernioPinterestSettingsDto.board', () => {
  it('aceita id numerico e nome de board', async () => {
    await expect(validate(dto('549755885175'))).resolves.toHaveLength(0);
    await expect(validate(dto('Minhas receitas'))).resolves.toHaveLength(0);
  });

  it('continua exigindo o board', async () => {
    const [error] = await validate(dto(''));
    expect(Object.values(error.constraints ?? {})[0]).toBe('Board is required');
  });
});
