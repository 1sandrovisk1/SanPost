import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { FormProvider, useForm, useWatch } from 'react-hook-form';
vi.mock('../high.order.provider', () => ({
  PostComment: { POST: 1 },
  withProvider: (v: unknown) => v,
}));
vi.mock('../../finisher/thread.finisher', () => ({
  ThreadFinisher: (): null => null,
}));
vi.mock('@gitroom/frontend/components/media/media.component', () => ({
  MediaComponent: ({ label }: any) => <div>{label}</div>,
}));
vi.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (_: string, fallback: string) => fallback,
}));
import provider, { XSettings } from './x.provider';
import { IntegrationContext } from '@gitroom/frontend/components/launches/helpers/use.integration';
const config = provider as any;
function Fixture({ identifier = 'x' }: { identifier?: string }) {
  const form = useForm({ defaultValues: config.defaults });
  return (
    <FormProvider {...form}>
      <IntegrationContext.Provider
        value={{
          integration: { identifier } as any,
          value: [],
          allIntegrations: [],
          date: null as any,
        }}
      >
        <XSettings />
        <Result />
      </IntegrationContext.Provider>
    </FormProvider>
  );
}
function Result() {
  const settings = useWatch();
  return (
    <output data-testid="limit">
      {config.maximumCharacters([], settings)}
    </output>
  );
}
afterEach(cleanup);
describe('configuracoes de X Articles', () => {
  it('troca formato, status e limite reativamente sem perder titulo', () => {
    render(<Fixture />);
    expect(screen.getByTestId('limit').textContent).toBe('280');
    fireEvent.change(screen.getByRole('combobox', { name: 'Post format' }), {
      target: { value: 'article' },
    });
    expect(screen.getByTestId('limit').textContent).toBe('100000');
    expect(
      screen.getByRole('option', { name: 'Save draft on X' })
    ).toBeDefined();
    fireEvent.change(screen.getByRole('textbox', { name: 'Article title' }), {
      target: { value: 'Titulo salvo' },
    });
    fireEvent.change(
      screen.getByRole('combobox', { name: 'Send article to X' }),
      { target: { value: 'published' } }
    );
    fireEvent.change(screen.getByRole('combobox', { name: 'Post format' }), {
      target: { value: 'post' },
    });
    expect(screen.getByTestId('limit').textContent).toBe('280');
    fireEvent.change(screen.getByRole('combobox', { name: 'Post format' }), {
      target: { value: 'article' },
    });
    expect(
      (
        screen.getByRole('textbox', {
          name: 'Article title',
        }) as HTMLInputElement
      ).value
    ).toBe('Titulo salvo');
  });
  it('provider alternativo nao oferece formato artigo nem imagens inline', () => {
    render(<Fixture identifier="zernio-twitter" />);
    expect(screen.queryByRole('combobox', { name: 'Post format' })).toBeNull();
    expect(
      config.inlineImages({ post_type: 'article' }, 'zernio-twitter')
    ).toBe(false);
    expect(config.inlineImages({ post_type: 'article' }, 'x')).toBe(true);
  });
  it('bloqueia artigo draft com respostas no contrato da interface', async () => {
    expect(
      await config.checkValidity(
        [[], []],
        {
          post_type: 'article',
          article_title: 'Titulo',
          article_status: 'draft',
        },
        [],
        (_: string, fallback: string) => fallback,
        'x',
        ['Corpo', 'Resposta']
      )
    ).toEqual(expect.any(String));
  });
});
