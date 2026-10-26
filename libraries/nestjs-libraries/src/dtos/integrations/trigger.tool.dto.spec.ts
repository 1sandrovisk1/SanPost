import 'reflect-metadata';
import { validate } from 'class-validator';
import { TriggerToolDto } from './trigger.tool.dto';

const dto = (overrides: Record<string, unknown>) =>
  Object.assign(new TriggerToolDto(), { methodName: 'search', data: {} }, overrides);

describe('TriggerToolDto', () => {
  it('aceita methodName curto e data objeto', async () => {
    await expect(validate(dto({ data: { query: 'x' } }))).resolves.toHaveLength(0);
  });

  it.each([
    { methodName: 123 },
    { methodName: 'm'.repeat(101) },
    { data: 'string' },
    { data: null },
  ])('rejeita %p', async (overrides) => {
    await expect(validate(dto(overrides))).resolves.not.toHaveLength(0);
  });
});
