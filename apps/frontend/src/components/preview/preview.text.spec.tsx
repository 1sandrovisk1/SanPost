import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, fireEvent } from '@testing-library/react';
vi.mock('@gitroom/react/helpers/variable.context', () => ({
  useVariables: () => ({
    frontEndUrl: 'https://multipost.example',
    cloudflareUrl: '',
  }),
}));
vi.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (_key: string, fallback: string) => fallback,
}));
import { PreviewText } from './preview.text';
afterEach(cleanup);
describe('PreviewText com imagem inline', () => {
  it('preserva a imagem propria e elimina a externa sem alterar o texto da ancora', () => {
    const { container } = render(
      <PreviewText
        postId="post"
        content={
          '<p>Olá <img src="https://multipost.example/uploads/a.jpg" alt="Foto"><img src="https://foreign.example/a.jpg"> mundo</p>'
        }
      />
    );
    const imgs = container.querySelectorAll('img');
    expect(imgs.length).toBe(1);
    expect(imgs[0].src).toBe('https://multipost.example/uploads/a.jpg');
    expect(container.textContent).toBe('Olá  mundo');
  });
  it('a selecao continua usando os offsets do texto renderizado', () => {
    const { container, getByText } = render(
      <PreviewText postId="post" content="<p>Olá mundo</p>" />
    );
    const text = container.querySelector('p')!.firstChild!;
    const range = document.createRange();
    range.setStart(text, 4);
    range.setEnd(text, 9);
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);
    fireEvent.mouseUp(container.querySelector('.preview')!);
    const listener = vi.fn();
    window.addEventListener('preview-comment-anchor', listener, { once: true });
    fireEvent.click(getByText('Comment on selected text'));
    expect(listener.mock.calls[0][0].detail).toEqual({
      postId: 'post',
      anchorStart: 4,
      anchorEnd: 9,
      anchorQuote: 'mundo',
    });
  });
});
