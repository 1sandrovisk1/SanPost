'use client';
import useSWR from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useCurrentProfile } from '@gitroom/frontend/hooks/use-current-profile.hook';
import { useUser } from '@gitroom/frontend/components/layout/user.context';
export function useSharedFlowData<T>(path: string | null, refreshInterval = 0) {
  const fetchApi = useFetch();
  const { profile } = useCurrentProfile();
  const user = useUser();
  return useSWR<T>(
    profile?.id && path ? [user?.id, profile.id, path] : null,
    async () => {
      const response = await fetchApi(path!, { cache: 'no-store' });
      if (!response.ok) throw new Error('SHARED_FLOW_LOAD_FAILED');
      return response.json();
    },
    {
      refreshInterval,
      refreshWhenHidden: false,
      keepPreviousData: false,
      shouldRetryOnError: false,
      revalidateOnFocus: false,
    }
  );
}
