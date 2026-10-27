import { SharedFlowCreator } from '@gitroom/frontend/components/automations/shared-flow-creator.component';
export const dynamic = 'force-dynamic';
export default async function Page({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <SharedFlowCreator id={id} />; }
