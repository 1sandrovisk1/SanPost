'use client';

import { useSearchParams } from 'next/navigation';
import { FC, useCallback, useEffect } from 'react';

// So um endereco deste app: o valor termina em `window.location.href` depois
// do login, entao qualquer origem externa vira open redirect e `javascript:`
// vira XSS. Validado na escrita E na leitura, porque o localStorage pode
// guardar um valor salvo antes desta checagem.
const sameOriginUrl = (url: string | null): string | null => {
  if (!url) {
    return null;
  }
  try {
    const parsed = new URL(url);
    return parsed.origin === window.location.origin &&
      parsed.protocol === window.location.protocol
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
};

const ReturnUrlComponent: FC = () => {
  const params = useSearchParams();
  const url = params.get('returnUrl');
  useEffect(() => {
    const returnUrl = sameOriginUrl(url);
    if (returnUrl) {
      localStorage.setItem('returnUrl', returnUrl);
    }
  }, [url]);
  return null;
};
export const useReturnUrl = () => {
  return {
    getAndClear: useCallback(() => {
      const data = localStorage.getItem('returnUrl');
      localStorage.removeItem('returnUrl');
      return sameOriginUrl(data);
    }, []),
  };
};
export default ReturnUrlComponent;
