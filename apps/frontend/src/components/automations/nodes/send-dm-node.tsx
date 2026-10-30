'use client';

import { FC, memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

export const SendDmNode: FC<NodeProps> = memo(({ data, selected }) => {
  const t = useT();
  const config =
    typeof data?.config === 'string'
      ? (() => {
          try {
            return JSON.parse(data.config as string);
          } catch {
            return {};
          }
        })()
      : data?.config || {};
  const message =
    config.variants?.[0]?.message ||
    config.messages?.[0] ||
    config.message ||
    config.template ||
    '';
  const buttonText: string =
    (config.variants ? config.variants[0]?.buttonText : config.buttonText) ||
    '';
  const buttonUrl: string =
    (config.variants ? config.variants[0]?.buttonUrl : config.buttonUrl) || '';
  const hasButton = !!buttonText && !!buttonUrl;

  return (
    <div
      className="automation-node automation-color-dm rounded-[8px] border-2 px-[16px] py-[12px] min-w-[200px]"
      data-selected={!!selected}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="automation-node-handle"
      />
      <div className="flex items-center gap-[8px] mb-[4px]">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          className="automation-accent"
          strokeWidth="2"
        >
          <line x1="22" y1="2" x2="11" y2="13" />
          <polygon points="22 2 15 22 11 13 2 9 22 2" />
        </svg>
        <span className="text-[13px] font-semibold text-textColor">
          {t('send_dm_node_label', 'Send DM')}
        </span>
      </div>
      {message && (
        <p className="text-[12px] text-customColor18 truncate max-w-[180px]">
          {message}
        </p>
      )}
      {hasButton && (
        <span
          className="inline-block mt-[6px] text-[10px] px-[6px] py-[2px] rounded-[10px] automation-badge border max-w-[180px] truncate"
          title={buttonUrl}
        >
          🔗 {buttonText}
        </span>
      )}
      <Handle
        type="source"
        position={Position.Bottom}
        className="automation-node-handle"
      />
    </div>
  );
});

SendDmNode.displayName = 'SendDmNode';
