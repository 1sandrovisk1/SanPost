import 'reflect-metadata';

export const DASHBOARD_FUNCTION_METADATA = 'custom:dashboard_function';

/**
 * Marca um metodo de provider como invocavel pelo dashboard via
 * `POST /integrations/function` sem precisar expo-lo como `@Tool` (que tambem
 * fica acessivel pela API publica e pelo agente de IA).
 *
 * A rota executa o metodo pelo nome com o token do canal como primeiro
 * argumento; sem allowlist qualquer helper interno (ex.: `readOrFetch`, que faz
 * `readFileSync`) ficava acessivel a qualquer membro da org
 * (CVE-2026-115931). A metadata e gravada por nome de metodo no prototype, e a
 * leitura usa `Reflect.getMetadata` (percorre a cadeia de prototypes), entao um
 * override em subclasse continua invocavel.
 */
export function DashboardFunction() {
  return function (target: object, propertyKey: string | symbol) {
    Reflect.defineMetadata(
      DASHBOARD_FUNCTION_METADATA,
      true,
      target,
      propertyKey
    );
  };
}

export function isDashboardFunction(
  prototype: object,
  methodName: string
): boolean {
  return (
    Reflect.getMetadata(DASHBOARD_FUNCTION_METADATA, prototype, methodName) ===
    true
  );
}
