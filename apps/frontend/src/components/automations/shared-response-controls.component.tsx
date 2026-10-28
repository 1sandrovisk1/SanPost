'use client';
import { useId } from 'react';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import type { PreviewJourneyStage } from './shared-preview-journey';
export interface FollowGateValues {
  openingDmMessage: string;
  openingDmButtonText: string;
  followGateMessage: string;
  alreadyFollowedButtonText: string;
  gateExhaustedMessage: string;
  maxGateAttempts: number;
}
const inputClass =
  'w-full rounded-lg border border-newTableBorder bg-newBgColorInner px-3 py-2 text-[13px] text-textColor focus:border-btnPrimary';
export function AutomationFollowGateFields({
  values,
  onChange,
  onFocusStage,
}: {
  values: FollowGateValues;
  onChange: (patch: Partial<FollowGateValues>) => void;
  onFocusStage: (stage: PreviewJourneyStage) => void;
}) {
  const t = useT(),
    id = useId();
  const textField = (
    field: Exclude<keyof FollowGateValues, 'maxGateAttempts'>,
    label: string,
    stage: PreviewJourneyStage,
    button = false
  ) => (
    <label className="block space-y-1 text-xs" htmlFor={`${id}-${field}`}>
      <span>{t(label)}</span>
      {button ? (
        <input
          id={`${id}-${field}`}
          value={values[field]}
          maxLength={20}
          className={inputClass}
          onFocus={() => onFocusStage(stage)}
          onChange={(e) => onChange({ [field]: e.target.value })}
        />
      ) : (
        <textarea
          id={`${id}-${field}`}
          value={values[field]}
          rows={3}
          className={inputClass}
          onFocus={() => onFocusStage(stage)}
          onChange={(e) => onChange({ [field]: e.target.value })}
        />
      )}
    </label>
  );
  return (
    <div className="space-y-2">
      <p className="text-xs text-newTextColor/70">
        {t('automation_gate_sequence')}
      </p>
      <details className="rounded-lg border border-newTableBorder p-3">
        <summary className="cursor-pointer text-sm font-medium">
          <span>{t('automation_gate_opening')}</span>
          <span className="block truncate text-xs font-normal text-newTextColor/60 mt-1">
            {values.openingDmMessage || t('automation_not_configured')} ·{' '}
            {values.openingDmButtonText}
          </span>
        </summary>
        <div className="pt-3 space-y-3">
          {textField(
            'openingDmMessage',
            'follow_gate_opening_dm_label',
            'opening'
          )}
          {textField(
            'openingDmButtonText',
            'follow_gate_opening_btn_label',
            'opening',
            true
          )}
        </div>
      </details>
      <details className="rounded-lg border border-newTableBorder p-3">
        <summary className="cursor-pointer text-sm font-medium">
          <span>{t('automation_gate_check')}</span>
          <span className="block truncate text-xs font-normal text-newTextColor/60 mt-1">
            {values.followGateMessage || t('automation_not_configured')} ·{' '}
            {values.alreadyFollowedButtonText}
          </span>
        </summary>
        <div className="pt-3 space-y-3">
          {textField('followGateMessage', 'story_follow_gate_label', 'gate')}
          {textField(
            'alreadyFollowedButtonText',
            'follow_gate_already_btn_label',
            'gate',
            true
          )}
        </div>
      </details>
      <details className="rounded-lg border border-newTableBorder p-3">
        <summary className="cursor-pointer text-sm font-medium">
          <span>{t('automation_gate_attempts')}</span>
          <span className="block text-xs font-normal text-newTextColor/60 mt-1">
            {values.maxGateAttempts} {t('automation_attempts')} ·{' '}
            {values.gateExhaustedMessage
              ? t('automation_custom_message')
              : t('automation_not_configured')}
          </span>
        </summary>
        <div className="pt-3 space-y-3">
          {textField(
            'gateExhaustedMessage',
            'follow_gate_exhausted_label',
            'exhausted'
          )}
          <label className="block text-xs space-y-1" htmlFor={`${id}-attempts`}>
            <span>{t('follow_gate_max_attempts_label')}</span>
            <input
              id={`${id}-attempts`}
              type="number"
              min={1}
              max={10}
              value={values.maxGateAttempts}
              className={inputClass}
              onFocus={() => onFocusStage('exhausted')}
              onChange={(e) =>
                onChange({ maxGateAttempts: Number(e.target.value) })
              }
            />
          </label>
        </div>
      </details>
    </div>
  );
}
export function JourneyPreviewControls({
  stage,
  onChange,
  story = false,
}: {
  stage: PreviewJourneyStage;
  onChange: (stage: PreviewJourneyStage) => void;
  story?: boolean;
}) {
  const t = useT(),
    id = useId();
  const stages: PreviewJourneyStage[] = story
    ? ['gate', 'delivery']
    : ['opening', 'gate', 'exhausted', 'delivery'];
  return (
    <div className="w-full space-y-1 text-xs">
      <label htmlFor={id}>{t('automation_preview_path')}</label>
      <select
        id={id}
        className={inputClass}
        value={stage}
        onChange={(e) => onChange(e.target.value as PreviewJourneyStage)}
      >
        {stages.map((value) => (
          <option key={value} value={value}>
            {t(`automation_preview_${value}`)}
          </option>
        ))}
      </select>
    </div>
  );
}
export function ReplyPreviewControls({
  messages,
  index,
  onChange,
}: {
  messages: string[];
  index: number;
  onChange: (index: number) => void;
}) {
  const t = useT(),
    id = useId();
  if (messages.length < 2) return null;
  return (
    <div className="w-full space-y-1 text-xs">
      <label htmlFor={id}>{t('shared_reply_preview')}</label>
      <select
        id={id}
        className={inputClass}
        value={Math.min(index, messages.length - 1)}
        onChange={(e) => onChange(Number(e.target.value))}
      >
        {messages.map((_, i) => (
          <option key={i} value={i}>
            {t('shared_reply_variant')} {i + 1}
          </option>
        ))}
      </select>
      <p className="text-newTextColor/60">
        {t('shared_reply_variations_hint')}
      </p>
    </div>
  );
}

export function PublicationPreviewControls({
  posts,
  value,
  onChange,
}: {
  posts: Array<{ id: string; caption?: string }>;
  value?: string;
  onChange: (id: string) => void;
}) {
  const t = useT(),
    id = useId();
  if (posts.length < 2) return null;
  return (
    <label htmlFor={id} className="w-full space-y-1 text-xs">
      <span>{t('automation_preview_publication')}</span>
      <select
        id={id}
        className={inputClass}
        value={value || posts[0]?.id}
        onChange={(e) => onChange(e.target.value)}
      >
        {posts.map((p, i) => (
          <option key={p.id} value={p.id}>
            {i + 1} · {p.caption || t('shared_post_no_caption')}
          </option>
        ))}
      </select>
    </label>
  );
}
