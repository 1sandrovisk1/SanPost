'use client';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { CommaSeparatedKeywordsInput } from './comma-separated-keywords-input.component';
export function AutomationKeywordConditions({
  specific,
  keywords,
  onSpecificChange,
  onKeywordsChange,
  disabled = false,
  requireKeywords = false,
  matchMode,
  onMatchModeChange,
  onFocus,
}: {
  specific: boolean;
  keywords: string[];
  onSpecificChange: (value: boolean) => void;
  onKeywordsChange: (value: string[]) => void;
  disabled?: boolean;
  requireKeywords?: boolean;
  matchMode?: string;
  onMatchModeChange?: (mode: string) => void;
  onFocus?: () => void;
}) {
  const t = useT();
  return (
    <div className="space-y-2">
      <div
        className={`rounded-lg border p-3 ${
          specific || requireKeywords
            ? 'border-btnPrimary bg-btnPrimary/5'
            : 'border-newTableBorder'
        }`}
      >
        {!requireKeywords && (
          <label className="flex gap-2 items-center text-[13px] cursor-pointer">
            <input
              type="radio"
              className="h-4 w-4 accent-btnPrimary"
              disabled={disabled}
              checked={specific}
              onChange={() => onSpecificChange(true)}
            />
            {t('wizard_specific_word')}
          </label>
        )}
        {(specific || requireKeywords) && (
          <div className={!requireKeywords ? 'mt-2' : ''}>
            <CommaSeparatedKeywordsInput
              disabled={disabled}
              aria-label={t('trigger_keywords')}
              className="w-full h-[42px] rounded-lg border border-newTableBorder bg-newBgColorInner px-[14px] text-[13px] text-textColor outline-none focus:border-btnPrimary disabled:opacity-60"
              placeholder={t('wizard_keywords_input_placeholder')}
              keywords={keywords}
              onKeywordsChange={onKeywordsChange}
              onFocus={onFocus}
            />
            <p className="text-[11px] text-newTextColor/60 mt-1 mb-2">
              {t('wizard_keywords_comma_hint')}
            </p>
            <div className="flex flex-wrap gap-1.5 items-center">
              <span className="text-[11px] text-newTextColor/60">
                {t('wizard_example')}
              </span>
              {[
                'automation_keyword_price',
                'automation_keyword_link',
                'automation_keyword_buy',
              ].map((key) => (
                <button
                  type="button"
                  key={key}
                  disabled={disabled}
                  className={`text-[11px] px-2 py-0.5 rounded-xl border ${
                    keywords.includes(t(key))
                      ? 'border-btnPrimary text-btnPrimary bg-btnPrimary/10'
                      : 'border-newTableBorder text-newTextColor/60 hover:border-btnPrimary'
                  }`}
                  onClick={() => {
                    if (!keywords.includes(t(key)))
                      onKeywordsChange([...keywords, t(key)]);
                  }}
                >
                  {t(key)}
                </button>
              ))}
            </div>
            {onMatchModeChange && (
              <details className="mt-2 text-xs text-newTextColor/60">
                <summary className="cursor-pointer">
                  {t('shared_match_mode')}
                </summary>
                <select
                  aria-label={t('shared_match_mode')}
                  disabled={disabled}
                  className="w-full mt-2 border border-newTableBorder rounded-lg p-2 bg-newBgColorInner text-textColor"
                  value={matchMode}
                  onChange={(e) => onMatchModeChange(e.target.value)}
                >
                  {['any', 'all', 'exact'].map((mode) => (
                    <option key={mode} value={mode}>
                      {t(`match_${mode}`)}
                    </option>
                  ))}
                </select>
              </details>
            )}
          </div>
        )}
      </div>
      {!requireKeywords && (
        <label
          className={`flex items-center gap-2 rounded-lg border p-3 text-[13px] cursor-pointer ${
            !specific
              ? 'border-btnPrimary bg-btnPrimary/5'
              : 'border-newTableBorder'
          }`}
        >
          <input
            type="radio"
            className="h-4 w-4 accent-btnPrimary"
            disabled={disabled}
            checked={!specific}
            onChange={() => {
              onSpecificChange(false);
              onKeywordsChange([]);
            }}
          />
          {t('wizard_any_word')}
        </label>
      )}
    </div>
  );
}
