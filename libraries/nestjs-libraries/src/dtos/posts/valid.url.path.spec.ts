import {
  isAllowedUploadPath,
  ValidUrlPath,
} from '@gitroom/helpers/utils/valid.url.path';

// upstream 2aae02fe: a regra do RESTRICT_UPLOAD_DOMAINS sai do validador do
// DTO para tambem valer na imagem inline (inline.images.ts).
describe('isAllowedUploadPath', () => {
  const restrict = process.env.RESTRICT_UPLOAD_DOMAINS;

  afterEach(() => {
    if (restrict === undefined) {
      delete process.env.RESTRICT_UPLOAD_DOMAINS;
    } else {
      process.env.RESTRICT_UPLOAD_DOMAINS = restrict;
    }
  });

  it('sem RESTRICT_UPLOAD_DOMAINS tudo passa', () => {
    delete process.env.RESTRICT_UPLOAD_DOMAINS;
    expect(isAllowedUploadPath('https://qualquer.exemplo.com/a.png')).toBe(true);
  });

  it('com RESTRICT_UPLOAD_DOMAINS exige o dominio', () => {
    process.env.RESTRICT_UPLOAD_DOMAINS = 'midia.exemplo.com';
    expect(isAllowedUploadPath('https://midia.exemplo.com/a.png')).toBe(true);
    expect(isAllowedUploadPath('https://outro.exemplo.com/a.png')).toBe(false);
    expect(isAllowedUploadPath('')).toBe(false);
  });

  it('ValidUrlPath delega para a mesma regra', () => {
    process.env.RESTRICT_UPLOAD_DOMAINS = 'midia.exemplo.com';
    const validator = new ValidUrlPath();
    expect(
      validator.validate('https://midia.exemplo.com/a.png', {} as any)
    ).toBe(true);
    expect(validator.validate('https://outro.exemplo.com/a.png', {} as any)).toBe(
      false
    );
  });
});
