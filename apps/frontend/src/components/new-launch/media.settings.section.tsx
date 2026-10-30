'use client';

import { FC, useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useLaunchStore } from '@gitroom/frontend/components/new-launch/store';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { useMediaDirectory } from '@gitroom/react/helpers/use.media.directory';
import { VideoFrame } from '@gitroom/react/helpers/video.frame';
import { MediaSettingsIcon } from '@gitroom/frontend/components/ui/icons';
import { MediaComponentInner } from '@gitroom/frontend/components/launches/helpers/media.settings.component';

import { useMediaSettingsValues } from '@gitroom/frontend/components/new-launch/media.settings.values';

// Painel "Miniaturas e texto alternativo" nas configuracoes do post (upstream
// #2285, #2295, #2302): lista a midia do que o editor mostra e abre o mesmo
// dialogo de texto alternativo/miniatura da midia.
export const MediaSettingsSection: FC = () => {
  const t = useT();
  const modals = useModals();
  const mediaDirectory = useMediaDirectory();
  const values = useMediaSettingsValues();
  const { current, internal, setGlobalValueMedia, setInternalValueMedia } =
    useLaunchStore(
      useShallow((state) => ({
        current: state.current,
        internal: state.internal.find(
          (p) => p.integration.id === state.current
        ),
        setGlobalValueMedia: state.setGlobalValueMedia,
        setInternalValueMedia: state.setInternalValueMedia,
      }))
    );

  const openSettings = useCallback(
    (index: number, media: any) => {
      modals.openModal({
        title: t('media_settings', 'Media Settings'),
        children: (close) => (
          <MediaComponentInner
            media={media}
            onClose={close}
            onSelect={(value: any) => {
              const newMedia = values[index].media.map((p) =>
                p.id === media.id ? { ...p, ...value } : p
              );
              if (internal) {
                return setInternalValueMedia(current, index, newMedia);
              }

              return setGlobalValueMedia(index, newMedia);
            }}
          />
        ),
      });
    },
    [values, internal, current]
  );

  if (!values.some((p) => p.media?.length)) {
    return null;
  }

  return (
    <div className="flex flex-col gap-[12px] m-[12px] p-[12px] bg-newBgColorInner rounded-[8px]">
      <div className="flex flex-col gap-[4px]">
        <div className="flex items-center gap-[6px] text-[14px] font-[600]">
          {t('thumbnails_and_alt_text', 'Thumbnails & alt text')}
          <svg
            data-tooltip-id="tooltip"
            data-tooltip-class-name="!max-w-[400px] break-words"
            data-tooltip-content={t(
              'media_settings_section_tooltip',
              'Thumbnails apply to videos in the main post and are sent to every channel that supports them. YouTube may ignore them on videos it treats as Shorts (vertical, up to 3 minutes) without failing the publish, and requires a phone-verified channel for custom thumbnails. If YouTube rejects the thumbnail the video is still published, and Robô MultiPost cannot check eligibility in advance.'
            )}
            role="img"
            aria-label={t(
              'media_settings_section_tooltip',
              'Thumbnails apply to videos in the main post and are sent to every channel that supports them.'
            )}
            className="cursor-help text-[#A3A3A3]"
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4" />
            <path d="M12 8h.01" />
          </svg>
        </div>
        <div className="text-[12px] text-[#A3A3A3]">
          {t(
            'media_settings_section_description',
            'Click a media item to set its alt text, or its thumbnail if it is a video.'
          )}
        </div>
      </div>
      {values.map((value, index) =>
        !value.media?.length ? null : (
          <div key={value.id} className="flex flex-col gap-[6px]">
            {values.length > 1 && (
              <div className="text-[12px]">
                {index === 0
                  ? t('media_settings_main_post', 'Main post')
                  : `${t('comment', 'Comment')} ${index}`}
              </div>
            )}
            <div className="flex flex-wrap gap-[10px]">
              {value.media.map((media) => (
                <div
                  key={media.id}
                  role="button"
                  tabIndex={0}
                  aria-label={t('media_settings', 'Media Settings')}
                  onClick={() => openSettings(index, media)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      openSettings(index, media);
                    }
                  }}
                  className="cursor-pointer rounded-[5px] w-[40px] h-[40px] border-2 border-tableBorder relative flex group"
                >
                  <div className="absolute top-[50%] left-[50%] -translate-x-[50%] -translate-y-[50%] bg-black/80 rounded-[10px] opacity-0 group-hover:opacity-100 transition-opacity z-[9]">
                    <MediaSettingsIcon className="cursor-pointer relative z-[200]" />
                  </div>
                  {media.path.indexOf('mp4') > -1 ? (
                    <VideoFrame url={mediaDirectory.set(media.path)} thumbnail={media.thumbnail ? mediaDirectory.set(media.thumbnail) : undefined} />
                  ) : (
                    <img
                      className="w-full h-full object-cover rounded-[4px]"
                      src={mediaDirectory.set(media.path)}
                      alt={media.alt || ''}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        )
      )}
    </div>
  );
};
