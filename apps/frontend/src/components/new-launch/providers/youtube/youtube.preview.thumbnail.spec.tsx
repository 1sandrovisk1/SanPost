import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';

const state = vi.hoisted(() => ({
  media: {
    id: 'video',
    path: 'https://media.example.com/video.mp4',
    thumbnail: 'https://media.example.com/frame-one.jpg',
  },
  legacy: undefined as undefined | { path: string },
}));
vi.mock(
  '@gitroom/frontend/components/launches/helpers/use.integration',
  () => ({
    useIntegration: () => ({
      value: [{ content: 'Descricao', image: [state.media] }],
      integration: {
        identifier: 'youtube',
        name: 'Canal',
        picture: '/avatar.jpg',
      },
    }),
  })
);
vi.mock('@gitroom/frontend/components/new-launch/store', () => ({
  useLaunchStore: (selector: (value: { current: string }) => unknown) =>
    selector({ current: 'youtube-1' }),
}));
vi.mock('@gitroom/react/helpers/use.media.directory', () => ({
  useMediaDirectory: () => ({ set: (path: string) => path }),
}));
vi.mock('@gitroom/helpers/utils/strip.html.validation', () => ({
  stripHtmlValidation: (_mode: string, value: string) => value,
}));
vi.mock('@gitroom/helpers/utils/count.length', () => ({
  textSlicer: (_id: string, _max: number, text: string) => ({
    start: 0,
    end: text.length,
  }),
}));
vi.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (_key: string, fallback: string) => fallback,
}));
vi.mock('@gitroom/frontend/components/launches/helpers/use.values', () => ({
  useSettings: () => ({ control: {} }),
}));
vi.mock('react-hook-form', () => ({ useWatch: () => state.legacy }));
import { YoutubePreview } from './youtube.preview';

describe('preview da thumbnail do YouTube', () => {
  beforeEach(() => {
    state.media = {
      id: 'video',
      path: 'https://media.example.com/video.mp4',
      thumbnail: 'https://media.example.com/frame-one.jpg',
    };
    state.legacy = undefined;
  });
  afterEach(cleanup);
  it('mostra a imagem escolhida e atualiza quando a capa muda', () => {
    const { container, rerender } = render(<YoutubePreview />);
    expect(
      container.querySelector(
        'img[src="https://media.example.com/frame-one.jpg"]'
      )
    ).not.toBeNull();
    expect(container.querySelector('video[autoplay]')).toBeNull();
    state.media = {
      ...state.media,
      thumbnail: 'https://media.example.com/frame-final.jpg',
    };
    rerender(<YoutubePreview />);
    expect(
      container.querySelector(
        'img[src="https://media.example.com/frame-final.jpg"]'
      )
    ).not.toBeNull();
    expect(
      container.querySelector(
        'img[src="https://media.example.com/frame-one.jpg"]'
      )
    ).toBeNull();
  });
  it('respeita a mesma prioridade de thumbnail legada usada na publicacao', () => {
    state.legacy = { path: 'https://media.example.com/legacy.jpg' };
    const { container } = render(<YoutubePreview />);
    expect(
      container.querySelector('img[src="https://media.example.com/legacy.jpg"]')
    ).not.toBeNull();
    expect(
      container.querySelector(
        'img[src="https://media.example.com/frame-one.jpg"]'
      )
    ).toBeNull();
  });
  it('ao remover o override legado mostra novamente a capa da midia', () => {
    state.legacy = { path: 'https://media.example.com/legacy.jpg' };
    const { container, rerender } = render(<YoutubePreview />);
    state.legacy = undefined;
    rerender(<YoutubePreview />);
    expect(
      container.querySelector(
        'img[src="https://media.example.com/frame-one.jpg"]'
      )
    ).not.toBeNull();
  });
  it('sem capa escolhida mantem a previa do video', () => {
    state.media = { ...state.media, thumbnail: '' };
    const { container } = render(<YoutubePreview />);
    const video = container.querySelector('video');
    expect(video).not.toBeNull();
    expect(video?.getAttribute('src')).toContain(state.media.path);
    expect(video?.muted).toBe(true);
    expect(video?.loop).toBe(true);
  });
});
