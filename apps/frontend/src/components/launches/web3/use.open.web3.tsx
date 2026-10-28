'use client';

import { useCallback } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { web3List } from '@gitroom/frontend/components/launches/web3/web3.list';

// Abre o modal dos providers "web3" (Farcaster, Telegram, Moltbook), que nao
// tem URL OAuth para redirecionar: /integrations/social/:id devolve um nonce
// com o state, e o modal conclui em /integrations/social/:id?code&state.
// Tambem cobre o "Reconectar" (refresh): antes o botao fazia
// window.location.href = nonce e caia numa URL quebrada.
// Devolve false quando o identifier nao e web3 (o chamador segue o OAuth).
export const useOpenWeb3 = () => {
  const fetch = useFetch();
  // so as funcoes estaveis: useModals/useToaster devolvem objeto novo a cada
  // render e o callback mudaria sempre (refreshChannel depende dele)
  const { openModal } = useModals();
  const { show } = useToaster();
  const t = useT();

  return useCallback(
    async (
      identifier: string,
      options: { refresh?: string; onboarding?: boolean } = {}
    ) => {
      const web3 = web3List.find((item) => item.identifier === identifier);
      if (!web3) {
        return false;
      }

      const params = new URLSearchParams();
      if (options.refresh) {
        params.set('refresh', options.refresh);
      }
      if (options.onboarding) {
        params.set('onboarding', 'true');
      }
      const query = params.toString();

      const { url, err } = await (
        await fetch(
          `/integrations/social/${identifier}${query ? `?${query}` : ''}`
        )
      ).json();

      if (err || !url) {
        show(
          t(
            'could_not_connect_to_platform',
            'Could not connect to the platform'
          ),
          'warning'
        );
        return true;
      }

      const Web3Provider = web3.component;
      openModal({
        title: options.refresh
          ? t('reconnect_channel', 'Reconnect channel')
          : t('add_channel', 'Add Channel'),
        withCloseButton: true,
        classNames: {
          modal: 'bg-transparent text-textColor',
        },
        children: (
          <Web3Provider
            nonce={url}
            onComplete={(code, newState) => {
              // code do Farcaster e base64 (+, /, =): sem encode chega
              // corrompido (upstream #2078)
              window.location.href = `/integrations/social/${identifier}?code=${encodeURIComponent(
                code
              )}&state=${encodeURIComponent(newState)}${
                options.onboarding ? '&onboarding=true' : ''
              }`;
            }}
          />
        ),
      });
      return true;
    },
    [fetch, openModal, show, t]
  );
};
