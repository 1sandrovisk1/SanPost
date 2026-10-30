import React from 'react';
import { render, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { VideoFrame } from './video.frame';
afterEach(cleanup);
describe('VideoFrame', () => {
  it('troca imediatamente a imagem salva e volta ao video ao limpar', () => {
    const { container, rerender } = render(
      <VideoFrame url="/video.mp4" thumbnail="/first.jpg" />
    );
    expect(container.querySelector('img')?.getAttribute('src')).toBe(
      '/first.jpg'
    );
    rerender(<VideoFrame url="/video.mp4" thumbnail="/last.jpg" />);
    expect(container.querySelector('img')?.getAttribute('src')).toBe(
      '/last.jpg'
    );
    rerender(<VideoFrame url="/video.mp4" thumbnail="" />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('video')?.getAttribute('src')).toBe(
      '/video.mp4#t=0.1'
    );
  });
  it('mantem reproducao solicitada com poster e sem empilhar fragments', () => {
    const { container } = render(
      <VideoFrame url="/video.mp4#t=8" thumbnail="/last.jpg" autoplay />
    );
    expect(container.querySelector('video')?.getAttribute('poster')).toBe(
      '/last.jpg'
    );
    expect(container.querySelector('video')?.getAttribute('src')).toBe(
      '/video.mp4#t=0.1'
    );
  });
});
