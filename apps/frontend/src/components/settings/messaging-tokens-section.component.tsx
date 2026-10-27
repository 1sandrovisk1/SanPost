'use client';

import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  useT,
  useTranslationSettings,
} from '@gitroom/react/translation/get.transation.service.client';
import useSWR, { SWRConfig } from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { Button } from '@gitroom/react/form/button';
import { useUser } from '@gitroom/frontend/components/layout/user.context';
import { MetaActionFeedback } from './meta-action-feedback.component';
import { facebookSetupDateOptions } from './facebook-automation-dates';
import {
  DiagnosticSummary,
  DiagnosticField,
  DiagnosticDetails,
  DiagnosticIdentifier,
} from './meta-diagnostics.component';

interface IgTokenEntry {
  igUserId: string;
  username?: string;
  refreshedAt?: string;
  validatedAt?: string;
  hasToken?: boolean;
}
interface MessagingTokensResponse {
  hasSystemToken: boolean;
  systemTokenValidatedAt: string | null;
  systemTokenInfo: {
    businessId?: string;
    businessName?: string;
    pages: Array<{
      id: string;
      name: string;
      igUserId?: string;
      username?: string;
    }>;
  } | null;
  instagramTokens: IgTokenEntry[];
}
type TokenSection = 'instagram' | 'system-user';

function useTokenStore(enabled: boolean) {
  const fetchApi = useFetch();
  const t = useT();
  const toaster = useToaster();
  const user = useUser();
  const headers = {
    'x-expected-org-id': user?.orgId || '',
    'x-expected-profile-id': user?.profileId || '',
  };
  const {
    data: state,
    error,
    isLoading: loading,
    isValidating,
    mutate,
  } = useSWR<MessagingTokensResponse>(
    enabled
      ? ['/credentials/facebook/messaging-tokens', user?.orgId, user?.profileId]
      : null,
    async ([path]: [string, string, string]) => {
      const res = await fetchApi(path, { headers });
      if (!res.ok)
        throw new Error(res.status === 409 ? 'SCOPE_CHANGED' : 'UNAVAILABLE');
      const body = await res.json();
      if (
        !Array.isArray(body.instagramTokens) ||
        typeof body.hasSystemToken !== 'boolean'
      )
        throw new Error('UNAVAILABLE');
      return body;
    },
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      shouldRetryOnError: false,
    }
  );
  const load = () => mutate().catch(() => undefined);
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const busy = activeAction !== null;
  const inFlight = useRef(false);
  const [feedback, setFeedback] = useState<{
    section: TokenSection;
    key: string;
    error?: boolean;
  } | null>(null);
  const [systemInput, setSystemInput] = useState('');
  const [newToken, setNewToken] = useState('');
  const [adding, setAdding] = useState(false);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Both tabs share one response. Writes keep the existing partial-payload contract.
  const save = async (body: unknown) => {
    const res = await fetchApi('/credentials/facebook/messaging-tokens', {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    const result = await res.json().catch(() => ({}));
    if (!res.ok || result.ok === false)
      throw new Error(res.status === 409 ? 'SCOPE_CHANGED' : 'SAVE_FAILED');
    if (mounted.current) await mutate(result, false);
  };
  const perform = async (
    action: string,
    section: TokenSection,
    operation: () => Promise<void>
  ) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setActiveAction(action);
    setFeedback(null);
    try {
      await operation();
      if (mounted.current)
        setFeedback({
          section,
          key: action.endsWith('save')
            ? 'token_validated'
            : 'meta_token_removed',
        });
    } catch (failure) {
      if (mounted.current) {
        setFeedback({
          section,
          error: true,
          key:
            failure instanceof Error && failure.message === 'SCOPE_CHANGED'
              ? 'meta_tokens_scope_changed'
              : 'meta_tokens_save_failed',
        });
        toaster.show(
          t(
            failure instanceof Error && failure.message === 'SCOPE_CHANGED'
              ? 'meta_tokens_scope_changed'
              : 'meta_tokens_save_failed'
          ),
          'warning'
        );
      }
    } finally {
      inFlight.current = false;
      if (mounted.current) setActiveAction(null);
    }
  };
  const saveSystem = () =>
    perform('system-save', 'system-user', async () => {
      if (!systemInput.trim()) return;
      await save({ metaSystemUserToken: systemInput.trim() });
      if (mounted.current) {
        setSystemInput('');
        toaster.show(t('token_validated'), 'success');
      }
    });
  const removeSystem = () =>
    perform('system-remove', 'system-user', () =>
      save({ metaSystemUserToken: '' })
    );
  const clearInstagram = () =>
    perform('instagram-remove', 'instagram', () =>
      save({ instagramTokens: [] })
    );
  const addInstagram = () =>
    perform('instagram-save', 'instagram', async () => {
      if (!state || !newToken.trim()) return;
      const token = newToken.trim();
      const response = await fetchApi(
        '/credentials/facebook/validate-ig-token',
        { method: 'POST', body: JSON.stringify({ token }) }
      );
      const validated = await response.json().catch(() => ({}));
      if (!response.ok || !validated.ok || !validated.igUserId)
        throw new Error('INVALID_TOKEN');
      if (!mounted.current) return;
      await save({
        instagramTokens: [
          ...state.instagramTokens.filter(
            (entry) => entry.igUserId !== validated.igUserId
          ),
          { igUserId: validated.igUserId, username: validated.username, token },
        ],
      });
      if (mounted.current) {
        setNewToken('');
        setAdding(false);
        toaster.show(t('token_validated'), 'success');
      }
    });
  return {
    state,
    loading,
    error,
    busy,
    activeAction,
    feedback,
    isValidating,
    load,
    systemInput,
    setSystemInput,
    newToken,
    setNewToken,
    adding,
    setAdding,
    saveSystem,
    removeSystem,
    clearInstagram,
    addInstagram,
  };
}
const TokenContext = createContext<ReturnType<typeof useTokenStore> | null>(
  null
);
function ScopedTokens({
  children,
  enabled,
}: {
  children: ReactNode;
  enabled: boolean;
}) {
  const value = useTokenStore(enabled);
  return (
    <TokenContext.Provider value={value}>{children}</TokenContext.Provider>
  );
}
export function MessagingTokensProvider({
  children,
  enabled = true,
}: {
  children: ReactNode;
  enabled?: boolean;
}) {
  const user = useUser();
  // Remount local drafts and metadata when the authenticated scope changes.
  return (
    <SWRConfig
      key={`${user?.orgId || ''}:${user?.profileId || ''}`}
      value={{ provider: () => new Map() }}
    >
      <ScopedTokens enabled={enabled}>{children}</ScopedTokens>
    </SWRConfig>
  );
}
function useTokens() {
  const value = useContext(TokenContext);
  if (!value) throw new Error('MessagingTokensProvider required');
  return value;
}
function TokenLoadState({ children }: { children: ReactNode }) {
  const { loading, error, state, load, isValidating } = useTokens();
  const t = useT();
  if (loading)
    return (
      <p role="status" className="text-sm text-newTextColor/70">
        {t('loading')}
      </p>
    );
  if (error || !state)
    return (
      <div role="alert" className="space-y-3 text-sm">
        <p>
          {t(
            error?.message === 'SCOPE_CHANGED'
              ? 'meta_tokens_scope_changed'
              : 'meta_tokens_unavailable'
          )}
        </p>
        <Button
          secondary
          loading={isValidating}
          loadingLabel={t('meta_action_loading')}
          onClick={() => void load()}
        >
          {t('fb_auto_retry')}
        </Button>
      </div>
    );
  return <>{children}</>;
}
const secondary =
  'rounded-lg border border-newTableBorder text-sm focus-visible:ring-2 focus-visible:ring-btnPrimary';

export function MessagingTokensSection({
  section = 'instagram',
}: {
  section?: TokenSection;
}) {
  const store = useTokens();
  const { state, busy } = store;
  const t = useT();
  const inputId = useId();
  const system = section === 'system-user';
  const value = system ? store.systemInput : store.newToken;
  const label = system
    ? t('meta_system_user_token_label')
    : t('meta_instagram_tokens_label');
  const input = (
    <div className="space-y-3">
      <label htmlFor={inputId} className="block text-sm font-medium">
        {label}
      </label>
      <input
        id={inputId}
        type="password"
        autoComplete="off"
        spellCheck={false}
        value={value}
        onChange={(event) =>
          system
            ? store.setSystemInput(event.target.value)
            : store.setNewToken(event.target.value)
        }
        placeholder={t('meta_token_paste')}
        className="h-10 w-full rounded-lg border border-newTableBorder bg-newBgColorInner px-3 text-sm focus-visible:ring-2 focus-visible:ring-btnPrimary"
      />
      <div className="flex flex-wrap justify-end gap-2">
        {!system && (
          <Button
            secondary
            disabled={busy}
            className={secondary}
            onClick={() => {
              store.setAdding(false);
              store.setNewToken('');
            }}
          >
            {t('cancel')}
          </Button>
        )}
        <Button
          disabled={!value.trim() || busy}
          className="rounded-lg text-sm"
          loading={
            store.activeAction === (system ? 'system-save' : 'instagram-save')
          }
          loadingLabel={t('validating')}
          onClick={() =>
            void (system ? store.saveSystem() : store.addInstagram())
          }
        >
          {t('validate_and_save')}
        </Button>
      </div>
    </div>
  );
  return (
    <TokenLoadState>
      <div className="space-y-4 text-sm">
        {store.feedback?.section === section && (
          <MetaActionFeedback error={store.feedback.error}>
            {t(store.feedback.key)}
          </MetaActionFeedback>
        )}
        {system ? (
          <>
            <p className="text-newTextColor/70">
              {t('meta_system_scope_summary')}
            </p>
            {state?.hasSystemToken ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-newTableBorder p-3">
                <div className="space-y-1">
                  <p className="font-medium">
                    {state.systemTokenInfo?.businessName ||
                      t('meta_system_user_token_label')}
                  </p>
                  <p className="text-xs text-newTextColor/60">
                    {t('meta_token_added')}
                  </p>
                </div>
                <Button
                  secondary
                  disabled={busy}
                  className={secondary}
                  loading={store.activeAction === 'system-remove'}
                  loadingLabel={t('meta_action_removing')}
                  onClick={() => void store.removeSystem()}
                >
                  {t('meta_system_remove')}
                </Button>
              </div>
            ) : (
              input
            )}
          </>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <h3 className="font-medium">
                {t('meta_instagram_tokens_label')}
              </h3>
            </div>
            {!!state?.instagramTokens.length && (
              <div className="space-y-2">
                {state.instagramTokens.map((entry) => (
                  <div
                    key={entry.igUserId}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-newTableBorder p-3"
                  >
                    <span className="min-w-0 break-all">
                      {entry.username ? `@${entry.username}` : entry.igUserId}
                    </span>
                    <span className="text-xs text-newTextColor/60">
                      {t('meta_token_added')}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {store.adding ? (
              input
            ) : (
              <div className="flex flex-wrap gap-3">
                <Button
                  secondary
                  className={secondary}
                  disabled={busy}
                  onClick={() => store.setAdding(true)}
                >
                  {t('meta_instagram_tokens_add')}
                </Button>
                {!!state?.instagramTokens.length && (
                  <Button
                    secondary
                    className={secondary}
                    disabled={busy}
                    loading={store.activeAction === 'instagram-remove'}
                    loadingLabel={t('meta_action_removing')}
                    onClick={() => void store.clearInstagram()}
                  >
                    {t('meta_instagram_tokens_clear_all')}
                  </Button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </TokenLoadState>
  );
}

export function MessagingTokensDiagnostics({
  section,
}: {
  section: TokenSection;
}) {
  const { state } = useTokens();
  const t = useT();
  const { resolvedLanguage } = useTranslationSettings();
  const date = (value?: string | null) =>
    value
      ? facebookSetupDateOptions(value, resolvedLanguage || 'pt').time
      : t('meta_diagnostic_not_available');
  return (
    <TokenLoadState>
      <div className="space-y-4">
        {section === 'system-user' ? (
          <>
            <DiagnosticSummary
              title={t('meta_diagnostic_system_token')}
              status={t(
                state?.hasSystemToken
                  ? 'meta_token_added'
                  : 'meta_token_not_added'
              )}
            >
              {state?.hasSystemToken && (
                <>
                  <dl>
                    <DiagnosticField label={t('meta_token_last_validation')}>
                      {date(state.systemTokenValidatedAt)}
                    </DiagnosticField>
                    <DiagnosticField label={t('meta_diagnostic_expiry')}>
                      {t('meta_diagnostic_not_available')}
                    </DiagnosticField>
                  </dl>
                  <p className="text-xs text-newTextColor/60">
                    {t('meta_system_expiry_unknown')}
                  </p>
                </>
              )}
            </DiagnosticSummary>
            {!!state?.systemTokenInfo?.pages.length && (
              <DiagnosticDetails title={t('meta_system_assets')}>
                <p className="text-sm">
                  {t('meta_diagnostic_asset_count', {
                    count: state.systemTokenInfo.pages.length,
                  })}
                </p>
                <p className="text-xs text-newTextColor/60">
                  {t('meta_diagnostic_assets_notice')}
                </p>
                <ul className="space-y-3">
                  {state.systemTokenInfo.pages.map((page) => (
                    <li key={page.id} className="space-y-2 break-words">
                      <p className="font-medium">
                        {page.name}
                        {page.username ? ` · @${page.username}` : ''}
                      </p>
                      <DiagnosticIdentifier
                        label={t('meta_diagnostic_page_id')}
                        value={page.id}
                      />
                    </li>
                  ))}
                </ul>
              </DiagnosticDetails>
            )}
            {state?.hasSystemToken && !state.systemTokenInfo?.pages.length && (
              <p>{t('meta_system_no_assets')}</p>
            )}
          </>
        ) : (
          <>
            {!state?.instagramTokens.length && (
              <p>{t('meta_token_not_added')}</p>
            )}
            {state?.instagramTokens.map((entry) => (
              <div
                key={entry.igUserId}
                className="space-y-4 border-b border-newTableBorder pb-4"
              >
                <DiagnosticSummary
                  title={
                    entry.username
                      ? `@${entry.username}`
                      : t('meta_diagnostic_instagram_account')
                  }
                  status={t(
                    entry.hasToken ? 'meta_token_added' : 'meta_token_not_added'
                  )}
                >
                  <dl>
                    <DiagnosticField label={t('meta_token_last_validation')}>
                      {date(entry.validatedAt)}
                    </DiagnosticField>
                    <DiagnosticField label={t('meta_token_last_update')}>
                      {date(entry.refreshedAt)}
                    </DiagnosticField>
                  </dl>
                </DiagnosticSummary>
                <DiagnosticDetails>
                  <DiagnosticIdentifier
                    label={t('meta_diagnostic_instagram_id')}
                    value={entry.igUserId}
                  />
                </DiagnosticDetails>
              </div>
            ))}
            <p className="text-xs text-newTextColor/60">
              {t('meta_instagram_refresh_help')}
            </p>
          </>
        )}
      </div>
    </TokenLoadState>
  );
}
