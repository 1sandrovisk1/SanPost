'use client';
import { useCallback, useState } from 'react';
import useSWR from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useUser } from '@gitroom/frontend/components/layout/user.context';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { Button } from '@gitroom/react/form/button';

type DeletionInfo = { id: string; name: string; billingBlocked: boolean };
function DeletionPanel() {
  const fetchApi = useFetch();
  const t = useT();
  const user = useUser();
  const load = useCallback(async () => {
    const response = await fetchApi('/settings/organization/deletion');
    if (!response.ok) throw new Error('Deletion unavailable');
    return response.json() as Promise<DeletionInfo>;
  }, [fetchApi]);
  const { data, error } = useSWR(['organization-deletion', user?.orgId], load);
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  if (!data || error) return null;
  const remove = async () => {
    if (busy || confirmation !== data.name || data.billingBlocked) return;
    if (
      !window.confirm(
        t(
          'org_delete_final_confirmation',
          'Delete this organization and revoke all its access? User accounts will be preserved.'
        )
      )
    )
      return;
    setBusy(true);
    setFailed(false);
    try {
      const response = await fetchApi('/settings/organization', {
        method: 'DELETE',
        body: JSON.stringify({ confirmationName: confirmation }),
      });
      if (!response.ok) {
        setFailed(true);
        return;
      }
      window.location.assign('/');
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="border border-red-800 rounded p-4 my-5 space-y-3 text-newTextColor">
      <h4 className="font-semibold">
        {t('org_delete_title', 'Delete organization')}
      </h4>
      <p>
        {t(
          'org_delete_description',
          'Channels, posts and automations will be disabled. Organization, profile and OAuth keys and review links will stop working. User accounts and historical data will be preserved.'
        )}
      </p>
      {data.billingBlocked ? (
        <p role="alert">
          {t(
            'org_delete_billing_blocked',
            'Cancel the subscription and wait for cancellation to take effect before deleting this organization.'
          )}
        </p>
      ) : (
        <>
          <label className="block">
            {t(
              'org_delete_type_name',
              'Type the organization name to confirm:'
            )}{' '}
            <strong>{data.name}</strong>
            <input
              aria-label={t('org_delete_name', 'Organization name')}
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              maxLength={500}
              autoComplete="off"
              className="block w-full border border-tableBorder bg-newBgColorInner p-2 rounded mt-2"
            />
          </label>
          <Button
            disabled={busy || confirmation !== data.name}
            onClick={remove}
            className="!bg-red-700 !text-white"
          >
            {t('org_delete_title', 'Delete organization')}
          </Button>
        </>
      )}
      {failed && (
        <p role="alert">
          {t(
            'org_delete_failed',
            'Could not delete the organization. Reload and check permissions, name and billing status.'
          )}
        </p>
      )}
    </section>
  );
}
export function OrganizationDeletionSettings() {
  const user = useUser();
  if (!user?.isSuperAdmin || user.impersonate) return null;
  return <DeletionPanel key={user.orgId} />;
}
