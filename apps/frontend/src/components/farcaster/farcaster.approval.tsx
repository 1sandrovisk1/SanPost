'use client';

import { FC, useCallback, useEffect, useRef, useState } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { timer } from '@gitroom/helpers/utils/timer';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { Button } from '@gitroom/react/form/button';
import copy from 'copy-to-clipboard';
import Loading from '@gitroom/frontend/components/layout/loading';

// o modal desiste depois de 10 min (o registro do signer vale 15 min)
const APPROVAL_TIMEOUT = 10 * 60 * 1000;
const POLL_INTERVAL = 2000;
// "failed" e transitorio (Neynar instavel); depois de 5 seguidos o modal para
const MAX_TRANSIENT_FAILURES = 5;

type SignerStart = {
  requestId?: string;
  approvalUrl?: string;
  qrCode?: string;
  error?: string;
};

type SignerStatus = {
  status?: string;
  error?: string;
};

// Cria o signer, mostra o QR/link de aprovacao e consulta o status ate o
// usuario aprovar no app do Farcaster. Usado no login e na conexao de canal.
// O navegador so lida com o requestId opaco (o signer_uuid fica no servidor).
export const FarcasterApproval: FC<{
  endpoint: string;
  body?: Record<string, string>;
  onApproved: (requestId: string) => void;
  onFail: () => void;
}> = (props) => {
  const { endpoint, body, onApproved, onFail } = props;
  const fetch = useFetch();
  const toaster = useToaster();
  const t = useT();
  // started: o StrictMode roda o efeito duas vezes e cada POST cria um signer
  // na Neynar; alive: fechar o modal antes do POST voltar nao inicia o polling
  const started = useRef(false);
  const alive = useRef(true);
  const activeRequest = useRef('');
  const [approvalUrl, setApprovalUrl] = useState('');
  const [qrCode, setQrCode] = useState('');

  const fail = (message: string) => {
    activeRequest.current = '';
    toaster.show(message, 'warning');
    onFail();
  };

  const failureMessage = (error?: string) => {
    switch (error) {
      case 'not_configured':
        return t(
          'farcaster_not_configured',
          'Farcaster is not configured on this instance. Ask the administrator to set the Neynar variables.'
        );
      case 'key_refused':
      case 'no_credits':
        return t(
          'farcaster_neynar_unavailable',
          'Farcaster is unavailable on this instance (Neynar account). Let the administrator know.'
        );
      case 'rate_limited':
        return t(
          'farcaster_rate_limited',
          'Too many Farcaster connection attempts. Wait a few minutes and try again.'
        );
      case 'invalid_signer':
      case 'invalid_state':
        return t(
          'farcaster_session_invalid',
          'This Farcaster approval is no longer valid. Close it and try again.'
        );
      default:
        return t(
          'farcaster_signer_failed',
          'Failed to start the Farcaster connection'
        );
    }
  };

  // 429 do limite da instancia e 404 (login desligado) nao viram polling mudo
  const httpFailure = (status: number) =>
    status === 429 ? 'rate_limited' : 'failed';

  const poll = async (requestId: string) => {
    activeRequest.current = requestId;
    const startedAt = Date.now();
    let transientFailures = 0;
    while (alive.current && activeRequest.current === requestId) {
      let data: SignerStatus = {};
      try {
        const response = await fetch(`${endpoint}/status`, {
          method: 'POST',
          body: JSON.stringify({ requestId }),
        });
        data = response.ok
          ? await response.json()
          : { error: httpFailure(response.status) };
      } catch (err) {
        // instabilidade de rede: conta como falha transitoria
        data = { error: 'failed' };
      }

      if (!alive.current || activeRequest.current !== requestId) {
        return;
      }

      if (data.status === 'approved') {
        activeRequest.current = '';
        onApproved(requestId);
        return;
      }

      if (data.status === 'revoked') {
        fail(
          t(
            'farcaster_signer_revoked',
            'The Farcaster approval was revoked, please try again'
          )
        );
        return;
      }

      if (data.error) {
        transientFailures =
          data.error === 'failed' ? transientFailures + 1 : Infinity;
        if (transientFailures >= MAX_TRANSIENT_FAILURES) {
          fail(failureMessage(data.error));
          return;
        }
      } else {
        transientFailures = 0;
      }

      if (Date.now() - startedAt > APPROVAL_TIMEOUT) {
        fail(
          t(
            'farcaster_approval_timeout',
            'Farcaster approval timed out, please try again'
          )
        );
        return;
      }

      await timer(POLL_INTERVAL);
    }
  };

  const start = async () => {
    let data: SignerStart = {};
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        body: JSON.stringify(body || {}),
      });
      data = response.ok
        ? await response.json()
        : { error: httpFailure(response.status) };
    } catch (err) {
      // tratado abaixo como falha generica
    }

    if (!alive.current) {
      return;
    }

    if (!data.approvalUrl || !data.requestId) {
      fail(failureMessage(data.error));
      return;
    }

    setApprovalUrl(data.approvalUrl);
    setQrCode(data.qrCode || '');
    poll(data.requestId);
  };

  const copyLink = useCallback(() => {
    copy(approvalUrl);
    toaster.show(
      t('link_copied_to_clipboard', 'Link copied to clipboard'),
      'success'
    );
  }, [approvalUrl, toaster, t]);

  useEffect(() => {
    alive.current = true;
    if (!started.current) {
      started.current = true;
      start();
    }
    return () => {
      alive.current = false;
    };
  }, []);

  if (!approvalUrl) {
    return (
      <div className="flex justify-center py-[20px]">
        <Loading width={40} height={40} />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-[12px] py-[20px] text-center">
      {!!qrCode && (
        <img
          src={qrCode}
          alt={t(
            'farcaster_qr_alt',
            'QR code to approve the access in the Farcaster app'
          )}
          className="w-[200px] h-[200px] rounded-[8px] bg-white"
        />
      )}
      <div className="max-w-[400px]">
        {t(
          'farcaster_scan_instructions',
          'Scan the QR code with your phone, or copy the link and open it on your phone, then approve the access request in the Farcaster app.'
        )}
      </div>
      <Button onClick={copyLink}>
        {t('farcaster_copy_link', 'Copy Farcaster link')}
      </Button>
      <div className="flex items-center gap-[8px] text-sm opacity-70">
        <Loading width={20} height={20} />
        {t('farcaster_waiting_for_approval', 'Waiting for your approval...')}
      </div>
    </div>
  );
};
