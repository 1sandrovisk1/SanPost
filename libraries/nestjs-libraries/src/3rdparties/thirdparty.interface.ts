import { Injectable } from '@nestjs/common';

export abstract class ThirdPartyAbstract<T = any> {
  abstract checkConnection(
    apiKey: string
  ): Promise<false | { name: string; username: string; id: string }>;
  abstract sendData(apiKey: string, data: T): Promise<string>;
  [key: string]: ((apiKey: string, data?: any) => Promise<any>) | undefined;
}
export interface ThirdPartyParams {
  identifier: string;
  title: string;
  description: string;
  position: 'media' | 'media-library' | 'webhook';
  fields: {
    name: string;
    description: string;
    type: string;
    placeholder: string;
    validation?: RegExp;
  }[];
}

export function ThirdParty(params: ThirdPartyParams) {
  return function (target: any) {
    // Apply @Injectable decorator to the target class
    Injectable()(target);

    // Retrieve existing metadata or initialize an empty array
    const existingMetadata =
      Reflect.getMetadata('third:party', ThirdPartyAbstract) || [];

    // Add the metadata information for this method
    existingMetadata.push({ target, ...params });

    // Define metadata on the class prototype (so it can be retrieved from the class)
    Reflect.defineMetadata('third:party', existingMetadata, ThirdPartyAbstract);
  };
}

/**
 * `POST /third-party/function/:id/:functionName` executa um metodo do provider
 * pelo nome vindo da URL, com a API key decifrada como primeiro argumento. Sem
 * allowlist e a mesma classe de falha de `/integrations/function`
 * (CVE-2026-115931): so metodos declarados na propria classe do provider
 * podem ser chamados — nada herdado de `Object` nem `constructor`.
 */
export function isThirdPartyFunctionCallable(
  instance: ThirdPartyAbstract | undefined,
  functionName: unknown
): functionName is string {
  if (
    !instance ||
    typeof functionName !== 'string' ||
    !functionName ||
    functionName === 'constructor'
  ) {
    return false;
  }

  const prototype = Object.getPrototypeOf(instance);
  if (!prototype || prototype === Object.prototype) {
    return false;
  }

  if (!Object.prototype.hasOwnProperty.call(prototype, functionName)) {
    return false;
  }

  return typeof (instance as any)[functionName] === 'function';
}
