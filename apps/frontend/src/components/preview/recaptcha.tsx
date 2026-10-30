'use client';
import { useEffect, useRef, useState } from 'react';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

declare global {
  interface Window {
    roboPreviewCaptchaReady?: () => void;
    grecaptcha?: {
      render: (
        element: HTMLElement,
        options: {
          sitekey: string;
          callback: (token: string) => void;
          'expired-callback': () => void;
          'error-callback': () => void;
        }
      ) => number;
      reset: (widget: number) => void;
    };
  }
}
export function PreviewRecaptcha({
  siteKey,
  reset,
  onToken,
}: {
  siteKey: string;
  reset: number;
  onToken: (token: string) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const widget = useRef<number | null>(null);
  const tokenCallback = useRef(onToken);
  tokenCallback.current = onToken;
  const [failed, setFailed] = useState(false);
  const t = useT();
  useEffect(() => {
    const render = () => {
      if (
        widget.current !== null ||
        !container.current ||
        !window.grecaptcha?.render
      )
        return;
      widget.current = window.grecaptcha.render(container.current, {
        sitekey: siteKey,
        callback: (token) => {
          setFailed(false);
          tokenCallback.current(token);
        },
        'expired-callback': () => tokenCallback.current(''),
        'error-callback': () => {
          tokenCallback.current('');
          setFailed(true);
        },
      });
    };
    window.addEventListener('preview-captcha-ready', render);
    window.roboPreviewCaptchaReady = () =>
      window.dispatchEvent(new Event('preview-captcha-ready'));
    if (window.grecaptcha?.render) render();
    else if (!document.getElementById('preview-recaptcha-script')) {
      const script = document.createElement('script');
      script.id = 'preview-recaptcha-script';
      script.src =
        'https://www.google.com/recaptcha/api.js?onload=roboPreviewCaptchaReady&render=explicit';
      script.async = true;
      script.onerror = () => setFailed(true);
      document.head.appendChild(script);
    }
    return () => {
      window.removeEventListener('preview-captcha-ready', render);
      if (widget.current !== null) window.grecaptcha?.reset(widget.current);
    };
  }, [siteKey]);
  useEffect(() => {
    if (widget.current !== null) window.grecaptcha?.reset(widget.current);
    tokenCallback.current('');
  }, [reset]);
  return (
    <div>
      <div ref={container} />
      {failed && (
        <p role="alert">
          {t(
            'preview_captcha_failed',
            'Verification could not load. Reload the page to try again.'
          )}
        </p>
      )}
    </div>
  );
}
