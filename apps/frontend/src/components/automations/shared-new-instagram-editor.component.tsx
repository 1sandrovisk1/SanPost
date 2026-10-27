'use client';
import { useCurrentProfile } from '@gitroom/frontend/hooks/use-current-profile.hook';
import { AutomationWizardComponent } from './automation-wizard.component';
import { StoryWizardComponent } from './story-wizard.component';

export function NewInstagramEditor({ type }: { type?: string }) {
  const { profile } = useCurrentProfile();
  return type === 'story' ? (
    <StoryWizardComponent key={`${profile?.id}:story`} />
  ) : (
    <AutomationWizardComponent key={`${profile?.id}:comment`} />
  );
}
