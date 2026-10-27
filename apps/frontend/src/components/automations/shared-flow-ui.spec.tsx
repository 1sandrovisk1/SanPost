import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { WizardPhonePreview } from './wizard-phone-preview.component';
import { connectionSettingsUrl, validateSharedDraft } from './shared-flow-ui';
import { simpleDefinition } from '@gitroom/nestjs-libraries/database/prisma/flows-v2/flow-definition';
vi.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (key: string) => key,
}));
afterEach(cleanup);
describe('contratos da interface compartilhada', () => {
  it('abre configuracao da plataforma correta sem navegar o rascunho', () => {
    expect(connectionSettingsUrl('facebook', 'fb')).toContain(
      'facebookAutomation=fb'
    );
    expect(connectionSettingsUrl('instagram', 'ig')).toContain(
      'instagramAutomation=ig'
    );
    expect(connectionSettingsUrl('instagram-standalone', 'ig')).not.toContain(
      'facebookAutomation'
    );
  });
  it('aponta campo e no invalidos antes de salvar em qualquer editor', () => {
    const graph = simpleDefinition({ message: '' });
    const problems = validateSharedDraft('', [], graph);
    expect(problems.map((p) => p.field)).toEqual(
      expect.arrayContaining(['name', 'channels', 'definition'])
    );
    expect(problems.find((p) => p.field === 'definition')?.nodeId).toBe('dm');
    expect(
      validateSharedDraft(
        'Oi',
        [{ integrationId: 'fb', postMode: 'specific', postIds: [] }],
        simpleDefinition({ message: 'Oi' })
      ).some((p) => p.field === 'posts')
    ).toBe(true);
    expect(
      validateSharedDraft(
        'Oi',
        [{ integrationId: 'fb', postMode: 'all', postIds: [] }],
        simpleDefinition({ message: 'Oi' })
      )
    ).toEqual([]);
  });
  it('interpola variaveis V2 sem interpretar aliases exclusivos do legado', () => {
    render(
      <WizardPhonePreview
        singleReply
        activeTab="dm"
        commenterName="Ana"
        dmMessage="Oi {{comment_name}}: {{comment_text}} / {commenter_name}"
      />
    );
    expect(
      screen.getByText('Oi Ana: preview_user_comment / {commenter_name}')
    ).toBeTruthy();
  });
  it('previa compartilhada mostra somente a mensagem configurada e preserva previa legada', () => {
    const { rerender } = render(
      <WizardPhonePreview
        activeTab="dm"
        dmMessage="Mensagem real"
        singleReply
      />
    );
    expect(screen.getByText('Mensagem real')).toBeTruthy();
    expect(screen.queryByText('preview_user_response')).toBeNull();
    expect(screen.queryByText('preview_follow_up')).toBeNull();
    rerender(<WizardPhonePreview activeTab="dm" dmMessage="Mensagem real" />);
    expect(screen.getByText('preview_user_response')).toBeTruthy();
  });
});
