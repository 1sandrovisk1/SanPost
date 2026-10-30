import type { InstagramDto } from '../../dtos/posts/providers-settings/instagram.dto';
export const isInstagramVideo = (path: string) =>
  /\.mp4$/i.test((path || '').split(/[?#]/, 1)[0]);

export function instagramAudioError(
  settings: Partial<InstagramDto> | undefined,
  media: { path: string }[] = [],
  supported = true
): string | undefined {
  const audio = settings?.audio;
  if (audio == null) return undefined;
  if (
    !supported ||
    settings?.post_type === 'story' ||
    media.length !== 1 ||
    !isInstagramVideo(media[0]?.path)
  ) {
    return 'Áudio está disponível somente para um vídeo Reel conectado pelo Facebook Login.';
  }
  if (
    (typeof audio.id!=='string'||!/^\d{1,40}$/.test(audio.id)) ||
    [audio.audio_volume, audio.video_volume].some(
      (v) =>
        v !== undefined &&
        (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 100)
    )
  ) {
    return 'Selecione um áudio válido e volumes entre 0 e 100.';
  }
  return undefined;
}
