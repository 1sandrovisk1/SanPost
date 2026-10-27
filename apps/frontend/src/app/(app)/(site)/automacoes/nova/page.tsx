import { NewInstagramEditor } from '@gitroom/frontend/components/automations/shared-new-instagram-editor.component';

export default async function NovaAutomacaoPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const { type } = await searchParams;
  return (
    <div className="bg-newBgColorInner flex-1 flex-col flex h-[calc(100dvh-104px)] overflow-hidden">
      <NewInstagramEditor type={type} />
    </div>
  );
}
