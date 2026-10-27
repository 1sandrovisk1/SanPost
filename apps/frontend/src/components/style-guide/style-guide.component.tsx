'use client';

import { ReactNode, useState } from 'react';
import { Button } from '@gitroom/react/form/button';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

const buttonSource = 'libraries/react-shared-libraries/src/form/button.tsx';
const settingsSource = 'apps/frontend/src/components/settings/';
const localSamples = [
  {
    id: 'outline',
    action: 'copy',
    source: `${settingsSource}facebook-automation-setup.component.tsx`,
    secondary: true,
    classes:
      '!h-9 !px-3 rounded-lg border border-newTableBorder text-sm shrink-0',
  },
  {
    id: 'green',
    action: 'approve',
    source: 'apps/frontend/src/components/preview/comments.components.tsx',
    classes: '!bg-green-600 hover:!bg-green-700 !text-white',
  },
  {
    id: 'amber',
    action: 'request_changes',
    source: 'apps/frontend/src/components/preview/comments.components.tsx',
    classes: '!bg-amber-600 hover:!bg-amber-700 !text-white',
  },
];
const sizes = [
  {
    size: 24,
    classes:
      '!bg-customColor3 !h-[24px] border border-customColor21 rounded-[4px] text-[12px]',
    secondary: true,
    source: `${settingsSource}profiles.component.tsx`,
    context: 'profiles',
  },
  {
    size: 36,
    classes:
      '!h-9 !px-3 rounded-lg border border-newTableBorder text-sm shrink-0',
    secondary: true,
    source: `${settingsSource}facebook-automation-setup.component.tsx`,
    context: 'facebook',
  },
  { size: 40, classes: '', source: buttonSource, context: 'default' },
  {
    size: 52,
    classes: 'rounded-[10px] !h-[52px]',
    source: 'apps/frontend/src/components/auth/login.tsx',
    context: 'login',
  },
];
const tokens = [
  { id: 'brand', token: '--new-btn-primary', color: 'var(--new-btn-primary)' },
  {
    id: 'surface',
    token: '--new-bgColorInner',
    color: 'var(--new-bgColorInner)',
  },
  { id: 'background', token: '--new-bgColor', color: 'var(--new-bgColor)' },
  {
    id: 'border',
    token: '--new-table-border',
    color: 'var(--new-table-border)',
  },
  { id: 'text', token: '--new-textColor', color: 'rgb(var(--new-textColor))' },
  { id: 'ai', token: '--new-ai-btn', color: 'var(--new-ai-btn)' },
];

function Specimen({
  title,
  description,
  source,
  children,
  local = false,
}: {
  title: string;
  description: string;
  source: string;
  children: ReactNode;
  local?: boolean;
}) {
  const t = useT();
  return (
    <article className="min-w-0 rounded-xl border border-newTableBorder bg-newBgColorInner p-5">
      <p className="text-xs text-newTextColor/60">
        {t(local ? 'ui_guide_local' : 'ui_guide_shared')}
      </p>
      <h3 className="mt-1 font-semibold">{title}</h3>
      <div className="my-5 flex min-h-[64px] flex-wrap items-center gap-3">
        {children}
      </div>
      <p className="text-sm leading-relaxed text-newTextColor/70">
        {description}
      </p>
      <details className="mt-4 text-xs text-newTextColor/60">
        <summary className="cursor-pointer rounded-sm focus-visible:ring-2 focus-visible:ring-btnPrimary">
          {t('ui_guide_source')}
        </summary>
        <code className="mt-2 block break-all leading-relaxed">{source}</code>
      </details>
    </article>
  );
}

function Section({
  id,
  title,
  intro,
  children,
}: {
  id: string;
  title: string;
  intro: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-6 space-y-4">
      <div>
        <h2 className="text-xl font-semibold">{title}</h2>
        <p className="mt-1 max-w-3xl text-sm leading-relaxed text-newTextColor/70">
          {intro}
        </p>
      </div>
      {children}
    </section>
  );
}

export function StyleGuide() {
  const t = useT();
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [action, setAction] = useState('');
  const simulate = (key: string) => () => setAction(key);
  return (
    <div className={`${theme} min-w-0 w-full`}>
      <main className="min-h-full bg-newBgColor text-newTextColor p-4 sm:p-8">
        <div className="mx-auto max-w-6xl space-y-9">
          <header className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <a
                href="/settings?tab=credentials"
                className="rounded-sm text-sm underline underline-offset-4 focus-visible:ring-2 focus-visible:ring-btnPrimary"
              >
                {t('ui_guide_back')}
              </a>
              <span className="rounded-full border border-newTableBorder px-3 py-1 text-xs">
                {t('ui_guide_inventory')}
              </span>
            </div>
            <div>
              <h1 className="text-3xl font-semibold">{t('ui_guide_title')}</h1>
              <p className="mt-2 max-w-3xl text-sm leading-relaxed text-newTextColor/70">
                {t('ui_guide_intro')}
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-newTableBorder bg-newBgColorInner p-4">
              <div>
                <p className="text-sm font-semibold">{t('ui_guide_theme')}</p>
                <p className="text-xs text-newTextColor/60">
                  {t('ui_guide_theme_note')}
                </p>
              </div>
              <div className="inline-flex gap-1 rounded-lg bg-newBgColor p-1">
                {(['light', 'dark'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    aria-pressed={theme === mode}
                    onClick={() => setTheme(mode)}
                    className={`rounded-md px-4 py-2 text-sm focus-visible:ring-2 focus-visible:ring-btnPrimary ${
                      theme === mode
                        ? 'bg-newBgColorInner shadow-sm font-semibold'
                        : 'text-newTextColor/60'
                    }`}
                  >
                    {t(`ui_guide_${mode}`)}
                  </button>
                ))}
              </div>
            </div>
            <nav
              aria-label={t('ui_guide_navigation')}
              className="flex flex-wrap gap-x-6 gap-y-3 text-sm"
            >
              {[
                'buttons',
                'local_styles',
                'sizes',
                'states',
                'colors',
                'decisions',
              ].map((id) => (
                <a
                  key={id}
                  href={`#guide-${id}`}
                  className="rounded-sm underline underline-offset-4 focus-visible:ring-2 focus-visible:ring-btnPrimary"
                >
                  {t(`ui_guide_${id}`)}
                </a>
              ))}
            </nav>
            <p
              role="status"
              aria-live="polite"
              className="min-h-[20px] text-xs text-newTextColor/70"
            >
              {action
                ? t('ui_guide_simulated', { action: t(action) })
                : t('ui_guide_demo_note')}
            </p>
          </header>

          <Section
            id="guide-buttons"
            title={t('ui_guide_buttons')}
            intro={t('ui_guide_buttons_intro')}
          >
            <div className="grid gap-4 md:grid-cols-2">
              <Specimen
                title={t('ui_guide_primary')}
                description={t('ui_guide_primary_desc')}
                source={buttonSource}
              >
                <Button onClick={simulate('ui_guide_save')}>
                  {t('ui_guide_save')}
                </Button>
              </Specimen>
              <Specimen
                title={t('ui_guide_secondary')}
                description={t('ui_guide_secondary_desc')}
                source={buttonSource}
              >
                <Button secondary onClick={simulate('ui_guide_cancel')}>
                  {t('ui_guide_cancel')}
                </Button>
              </Specimen>
            </div>
          </Section>

          <Section
            id="guide-local_styles"
            title={t('ui_guide_local_styles')}
            intro={t('ui_guide_local_intro')}
          >
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {localSamples.map((sample) => (
                <Specimen
                  key={sample.id}
                  local
                  title={t(`ui_guide_${sample.id}`)}
                  description={t(`ui_guide_${sample.id}_desc`)}
                  source={sample.source}
                >
                  <Button
                    secondary={sample.secondary}
                    className={sample.classes}
                    onClick={simulate(`ui_guide_${sample.action}`)}
                  >
                    {t(`ui_guide_${sample.action}`)}
                  </Button>
                </Specimen>
              ))}
            </div>
            <Specimen
              local
              title={t('ui_guide_destructive')}
              description={t('ui_guide_destructive_desc')}
              source="apps/frontend/src/components/layout/new-modal.tsx → DecisionModal"
            >
              <Button onClick={simulate('ui_guide_delete')}>
                {t('ui_guide_delete')}
              </Button>
              <Button onClick={simulate('ui_guide_keep')}>
                {t('ui_guide_keep')}
              </Button>
            </Specimen>
          </Section>

          <Section
            id="guide-sizes"
            title={t('ui_guide_sizes')}
            intro={t('ui_guide_sizes_intro')}
          >
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {sizes.map((sample) => (
                <Specimen
                  key={sample.size}
                  local={sample.size !== 40}
                  title={`${sample.size} px`}
                  description={t(`ui_guide_size_${sample.context}`)}
                  source={sample.source}
                >
                  <Button
                    secondary={sample.secondary}
                    className={sample.classes}
                    onClick={simulate('ui_guide_example')}
                  >
                    {t('ui_guide_example')}
                  </Button>
                </Specimen>
              ))}
            </div>
          </Section>

          <Section
            id="guide-states"
            title={t('ui_guide_states')}
            intro={t('ui_guide_states_intro')}
          >
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <Specimen
                title={t('ui_guide_disabled')}
                description={t('ui_guide_disabled_desc')}
                source={buttonSource}
              >
                <Button disabled>{t('ui_guide_unavailable')}</Button>
              </Specimen>
              <Specimen
                title={t('ui_guide_loading')}
                description={t('ui_guide_loading_desc')}
                source={buttonSource}
              >
                <Button loading>{t('ui_guide_save')}</Button>
              </Specimen>
              <Specimen
                title={t('ui_guide_secondary_loading')}
                description={t('ui_guide_secondary_loading_desc')}
                source={buttonSource}
              >
                <Button secondary loading>
                  {t('ui_guide_save')}
                </Button>
              </Specimen>
            </div>
          </Section>

          <Section
            id="guide-colors"
            title={t('ui_guide_colors')}
            intro={t('ui_guide_colors_intro')}
          >
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              {tokens.map((token) => (
                <article
                  key={token.id}
                  className="min-w-0 rounded-xl border border-newTableBorder bg-newBgColorInner p-3"
                >
                  <div
                    aria-hidden="true"
                    className="h-14 rounded-lg border border-newTableBorder"
                    style={{ backgroundColor: token.color }}
                  />
                  <h3 className="mt-3 text-sm font-semibold">
                    {t(`ui_guide_token_${token.id}`)}
                  </h3>
                  <code className="mt-1 block break-all text-[11px] text-newTextColor/60">
                    {token.token}
                  </code>
                </article>
              ))}
            </div>
            <div className="rounded-xl border border-newTableBorder bg-newBgColorInner p-5 space-y-2">
              <h3 className="font-semibold">{t('ui_guide_typography')}</h3>
              <p className="text-sm text-newTextColor/70">
                {t('ui_guide_typography_desc')}
              </p>
              <div className="flex flex-wrap items-baseline gap-6 py-3">
                {[12, 14, 16, 20, 24].map((size) => (
                  <span key={size} style={{ fontSize: size }}>
                    {size} px
                  </span>
                ))}
              </div>
              <code className="block break-all text-xs text-newTextColor/60">
                apps/frontend/src/components/new-layout/layout.component.tsx ·
                colors.scss · tailwind.config.cjs
              </code>
            </div>
          </Section>

          <Section
            id="guide-decisions"
            title={t('ui_guide_decisions')}
            intro={t('ui_guide_decisions_intro')}
          >
            <div className="grid gap-4 md:grid-cols-2">
              <article className="rounded-xl border border-newTableBorder bg-newBgColorInner p-5">
                <h3 className="font-semibold">{t('ui_guide_observed')}</h3>
                <ul className="mt-3 list-disc space-y-3 pl-5 text-sm leading-relaxed text-newTextColor/70">
                  {[
                    'gap_variants',
                    'gap_sizes',
                    'gap_loading',
                    'gap_focus',
                  ].map((key) => (
                    <li key={key}>{t(`ui_guide_${key}`)}</li>
                  ))}
                </ul>
              </article>
              <article className="rounded-xl border border-newTableBorder bg-newBgColorInner p-5">
                <h3 className="font-semibold">{t('ui_guide_proposed')}</h3>
                <ul className="mt-3 list-disc space-y-3 pl-5 text-sm leading-relaxed text-newTextColor/70">
                  {[
                    'propose_variants',
                    'propose_sizes',
                    'propose_semantics',
                    'propose_rollout',
                  ].map((key) => (
                    <li key={key}>{t(`ui_guide_${key}`)}</li>
                  ))}
                </ul>
              </article>
            </div>
          </Section>
        </div>
      </main>
    </div>
  );
}
