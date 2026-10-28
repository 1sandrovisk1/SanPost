import { useShallow } from 'zustand/react/shallow';
import { useLaunchStore } from '@gitroom/frontend/components/new-launch/store';

// Valores que o editor deixa mudar: os globais, ou os de um canal
// personalizado (upstream #2285). Fica fora do media.settings.section para o
// high.order.provider nao importar a cadeia do modal de midia.
export const useMediaSettingsValues = () => {
  return useLaunchStore(
    useShallow((state) => {
      const internal = state.internal.find(
        (p) => p.integration.id === state.current
      );
      if (internal) {
        return internal.integrationValue;
      }

      return state.current === 'global' ? state.global : [];
    })
  );
};
