'use client';

import { FC } from 'react';
export const VideoFrame: FC<{
  url: string;
  thumbnail?: string | null;
  autoplay?: boolean;
  muted?: boolean;
  loop?: boolean;
}> = ({ url, thumbnail, autoplay, muted, loop }) => {
  const className = 'w-full h-full object-cover rounded-[4px]';
  if (thumbnail && !autoplay) {
    return <img className={className} src={thumbnail} alt="" />;
  }
  return (
    <video
      className={className}
      src={url.split('#')[0] + '#t=0.1'}
      poster={thumbnail || undefined}
      preload="metadata"
      autoPlay={!!autoplay}
      muted={muted}
      loop={loop}
    />
  );
};
