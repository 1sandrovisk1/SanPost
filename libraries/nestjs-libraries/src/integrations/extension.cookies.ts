import { AuthService } from '@gitroom/helpers/auth/auth.service';
import { SocialProvider } from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';

/**
 * Cookies capturados pela extensao Chrome chegam como JSON em base64 enviado
 * pelo cliente. Para guardar em `Integration.customInstanceDetails`:
 *
 * - so entram os cookies que o provider declarou em `extensionCookies`
 *   (qualquer outra chave do JSON e descartada);
 * - o resultado e cifrado em repouso com `AuthService.fixedEncryption` — o
 *   mesmo formato que `SkoolProvider.getCookies` le primeiro (com fallback de
 *   leitura para o legado em JWT, entao contas antigas seguem funcionando).
 *
 * Nunca assinar esse JSON com `JWT_SECRET`: um payload escolhido pelo cliente e
 * assinado com o segredo da instancia vira oraculo para forjar qualquer token
 * (sessao, enterprise, billing).
 */
export function pickExtensionCookies(
  provider: Pick<SocialProvider, 'extensionCookies'>,
  base64Cookies: string
): Record<string, string> {
  const provided: unknown = JSON.parse(
    Buffer.from(base64Cookies, 'base64').toString()
  );
  if (!provided || typeof provided !== 'object' || Array.isArray(provided)) {
    return {};
  }

  const allowed = (provider.extensionCookies || []).map((c) => c.name);
  return Object.fromEntries(
    allowed
      .filter(
        (name) => typeof (provided as Record<string, unknown>)[name] === 'string'
      )
      .map((name) => [name, (provided as Record<string, string>)[name]])
  );
}

export function encryptExtensionCookiesForStorage(
  provider: Pick<SocialProvider, 'extensionCookies'>,
  base64Cookies: string
): string {
  return AuthService.fixedEncryption(
    JSON.stringify(pickExtensionCookies(provider, base64Cookies))
  );
}
