import { NewInstagramEditor } from '@gitroom/frontend/components/automations/shared-new-instagram-editor.component';

export default async function NovaAutomacaoPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const { type } = await searchParams;
  return (
    <div className="bg-newBgColorInner flex-1 flex-col flex min-w-0 lg:min-h-0 lg:h-[calc(100dvh-105px)] lg:overflow-hidden">
      <NewInstagramEditor type={type} />
    </div>
  );
}
