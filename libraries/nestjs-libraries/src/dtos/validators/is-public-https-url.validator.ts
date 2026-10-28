import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

import { checkPublicHttpsUrl } from './public-https-url';
export { checkPublicHttpsUrl, PRIVATE_HOST_PATTERNS } from './public-https-url';

export function isPublicHttpsUrl(raw: unknown): boolean {
  return typeof raw === 'string' && checkPublicHttpsUrl(raw) === null;
}

@ValidatorConstraint({ name: 'isPublicHttpsUrl', async: false })
export class IsPublicHttpsUrlConstraint
  implements ValidatorConstraintInterface
{
  validate(value: unknown): boolean {
    // Campo opcional: ausencia e valida; presenca deve passar na regra.
    if (value === undefined || value === null || value === '') {
      return true;
    }
    return isPublicHttpsUrl(value);
  }

  defaultMessage(): string {
    return 'dmButtonUrl deve ser uma URL https publica valida (sem hosts privados/locais e sem esquemas como javascript:/data:/file:)';
  }
}

/**
 * Decorator class-validator. Uso: `@IsPublicHttpsUrl() dmButtonUrl?: string`.
 * Cobre o caminho REST/SDK (fail-fast no ValidationPipe + documentacao Swagger).
 * O service revalida via `checkPublicHttpsUrl` para cobrir tambem MCP e wizard.
 */
export function IsPublicHttpsUrl(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsPublicHttpsUrlConstraint,
    });
  };
}
