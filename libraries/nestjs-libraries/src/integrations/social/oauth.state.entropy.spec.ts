import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { makeSecureId } from '@gitroom/nestjs-libraries/services/make.secure.id';

// CVE-2026-94456: `makeId`/`Math.random` sao previsiveis (xorshift128+ com
// estado recuperavel a partir de poucas saidas). Valores que protegem o fluxo
// OAuth (state anti-CSRF, codeVerifier PKCE, nonce) precisam vir de CSPRNG.
describe('entropia de state/codeVerifier/nonce OAuth nos providers', () => {
  const providerFiles = readdirSync(__dirname).filter((file) =>
    file.endsWith('.provider.ts')
  );

  it('nenhum provider gera state, codeVerifier ou nonce com makeId ou Math.random', () => {
    const offenders = providerFiles.filter((file) => {
      const source = readFileSync(join(__dirname, file), 'utf8');
      return (
        /\b(state|nonce|codeVerifier)\s*[=:]\s*(makeId\(|Math\.random)/.test(
          source
        ) || /['"](state|nonce|code_verifier)['"],\s*(makeId\(|Math\.random)/.test(source)
      );
    });

    expect(providerFiles.length).toBeGreaterThan(20);
    expect(offenders).toEqual([]);
  });

  it('makeSecureId respeita o tamanho pedido e o alfabeto base62', () => {
    for (const length of [6, 7, 10, 17, 32]) {
      const value = makeSecureId(length);
      expect(value).toHaveLength(length);
      expect(value).toMatch(/^[A-Za-z0-9]+$/);
    }
  });
});
