'use client';

import { useCallback } from 'react';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { FarcasterApproval } from '@gitroom/frontend/components/farcaster/farcaster.approval';
import {
  FARCASTER_LOGIN_SIGNER_ENDPOINT,
  stashFarcasterCode,
} from '@gitroom/frontend/components/farcaster/farcaster.code';

// Botao "Farcaster" do login/cadastro. O code aprovado fica na aba
// (sessionStorage) e o /auth?provider=FARCASTER o envia no corpo do
// /auth/oauth/FARCASTER/exists; o backend so aceita no navegador que criou o
// signer (cookie httpOnly) e uma vez so.
export const FarcasterProvider = () => {
  const modal = useModals();
  const t = useT();
  const gotoLogin = useCallback((requestId: string) => {
    stashFarcasterCode('login', requestId);
    window.location.href = '/auth?provider=FARCASTER';
  }, []);
  const open = useCallback(() => {
    modal.openModal({
      id: 'farcaster-login',
      title: t('farcaster', 'Farcaster'),
      withCloseButton: true,
      classNames: {
        modal: 'bg-transparent text-textColor',
      },
      children: (close) => (
        <FarcasterApproval
          endpoint={FARCASTER_LOGIN_SIGNER_ENDPOINT}
          onApproved={gotoLogin}
          onFail={close}
        />
      ),
    });
  }, [modal, t, gotoLogin]);
  return (
    <div
      onClick={open}
      className={`cursor-pointer bg-white h-[52px] flex-1 rounded-[10px] flex justify-center items-center text-[#0E0E0E] gap-[10px]`}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
      >
        <g clipPath="url(#clip0_2026_31786)">
          <path
            d="M18.75 0H5.25C2.35051 0 0 2.35051 0 5.25V18.75C0 21.6495 2.35051 24 5.25 24H18.75C21.6495 24 24 21.6495 24 18.75V5.25C24 2.35051 21.6495 0 18.75 0Z"
            fill="#7C65C1"
          />
          <path
            d="M17.2139 6.64138H19.9174L19.5312 8.76552H18.8553V16.8759L18.8851 16.8766C19.1912 16.8921 19.4346 17.1452 19.4346 17.4552V17.9379L19.4644 17.9387C19.7705 17.9541 20.0139 18.2073 20.0139 18.5172V19H14.607V18.5172C14.607 18.2073 14.8504 17.9541 15.1566 17.9387L15.1863 17.9379V17.4552C15.1863 17.1452 15.4297 16.8921 15.7359 16.8766L15.7657 16.8759V12.9172C15.7657 10.8376 14.0798 9.15172 12.0001 9.15172C9.92051 9.15172 8.2346 10.8376 8.2346 12.9172V16.8759L8.2644 16.8766C8.5705 16.8921 8.81391 17.1452 8.81391 17.4552V17.9379L8.84371 17.9387C9.14981 17.9541 9.39324 18.2073 9.39324 18.5172V19H3.98633V18.5172C3.98633 18.2073 4.22974 17.9541 4.53584 17.9387L4.56564 17.9379V17.4552C4.56564 17.1452 4.80905 16.8921 5.11515 16.8766L5.14495 16.8759V8.76552H4.46909L4.08288 6.64138H6.78633V5H17.2139V6.64138Z"
            fill="white"
          />
        </g>
        <defs>
          <clipPath id="clip0_2026_31786">
            <rect width="24" height="24" fill="white" />
          </clipPath>
        </defs>
      </svg>
      <div className="block xs:hidden">{t('farcaster', 'Farcaster')}</div>
    </div>
  );
};
