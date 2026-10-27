import 'reflect-metadata';
import { validate } from 'class-validator';
import { MoltbookDto } from './moltbook.dto';

// Porte do upstream #1880: o DTO passa a ser ligado ao provider (settings
// validados no MCP/API) e o submolt e opcional.
describe('MoltbookDto', () => {
  it('aceita sem submolt e com submolt string', async () => {
    await expect(validate(Object.assign(new MoltbookDto(), {}))).resolves.toHaveLength(0);
    await expect(validate(Object.assign(new MoltbookDto(), { submolt: 'geral' }))).resolves.toHaveLength(0);
  });

  it('rejeita submolt que nao e string', async () => {
    await expect(validate(Object.assign(new MoltbookDto(), { submolt: 1 }))).resolves.not.toHaveLength(0);
  });
});
