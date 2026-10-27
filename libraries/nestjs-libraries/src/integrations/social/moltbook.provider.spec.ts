import 'reflect-metadata';
import { MoltbookProvider } from './moltbook.provider';
import { MoltbookDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/moltbook.dto';

// Upstream #1880: o DTO passa a ser ligado ao provider (validacao no MCP/API).
describe('MoltbookProvider', () => {
  it('expoe o MoltbookDto como contrato de settings', () => {
    expect(new MoltbookProvider().dto).toBe(MoltbookDto);
  });
});
