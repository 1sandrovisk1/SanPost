export const dynamic = 'force-dynamic';
import { AutomationWizardServerWrapper } from '@gitroom/frontend/components/automations/automation-wizard-server-wrapper.component';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Flow Editor',
  description: 'Edit automation flow',
};

export default async function Index({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="bg-newBgColorInner flex-1 flex-col flex min-w-0 lg:min-h-0 lg:h-[calc(100dvh-105px)] lg:overflow-hidden">
      <AutomationWizardServerWrapper flowId={id} />
    </div>
  );
}
