'use client';

import React, { FC, useState, useCallback } from 'react';
import { Web3ProviderInterface } from '@gitroom/frontend/components/launches/web3/web3.provider.interface';
import { LoadingComponent } from '@gitroom/frontend/components/layout/loading';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { FarcasterApproval } from '@gitroom/frontend/components/farcaster/farcaster.approval';
import {
  FARCASTER_CHANNEL_SIGNER_ENDPOINT,
  stashFarcasterCode,
} from '@gitroom/frontend/components/farcaster/farcaster.code';
export const WrapcasterProvider: FC<Web3ProviderInterface> = (props) => {
  const { onComplete, nonce } = props;
  const [, state] = nonce.split('||');
  const modal = useModals();
  const [hide, setHide] = useState(false);
  // o signer fica amarrado ao state deste fluxo; o code aprovado vai pela aba
  // (sessionStorage) para o ContinueIntegration, nunca pela URL
  const auth = useCallback(
    (requestId: string) => {
      stashFarcasterCode('connect', requestId);
      setHide(true);
      return onComplete('', state);
    },
    [state, onComplete]
  );
  return (
    <div className="justify-center items-center flex">
      {hide ? (
        <div className="justify-center items-center flex -mt-[90px]">
          <LoadingComponent width={100} height={100} />
        </div>
      ) : (
        <div className="w-[500px] max-w-full">
          <FarcasterApproval
            endpoint={FARCASTER_CHANNEL_SIGNER_ENDPOINT}
            body={{ state }}
            onApproved={auth}
            onFail={modal.closeCurrent}
          />
        </div>
      )}
    </div>
  );
};
