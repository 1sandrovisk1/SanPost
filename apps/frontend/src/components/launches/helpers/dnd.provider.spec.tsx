import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { useDrag } from 'react-dnd';
import { DNDProvider } from './dnd.provider';
afterEach(cleanup);
const Post = () => {
  const [, drag] = useDrag(() => ({ type: 'POST', item: { id: 'post' } }));
  return (
    <div
      ref={(node) => {
        drag(node);
      }}
    >
      Post
    </div>
  );
};
describe('calendario compartilha backend DnD', () => {
  it('monta calendarios simultaneos e remonta sem disputar os listeners globais', () => {
    const first = render(
      <DNDProvider>
        <Post />
      </DNDProvider>
    );
    expect(() =>
      render(
        <DNDProvider>
          <Post />
        </DNDProvider>
      )
    ).not.toThrow();
    first.unmount();
    expect(() =>
      render(
        <DNDProvider>
          <Post />
        </DNDProvider>
      )
    ).not.toThrow();
  });
});
