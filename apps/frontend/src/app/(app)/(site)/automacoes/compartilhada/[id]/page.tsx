import { redirect } from 'next/navigation';
import { legacyAutomationDestination } from '@gitroom/frontend/components/automations/shared-routes';
export const dynamic = 'force-dynamic';
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  redirect(
    legacyAutomationDestination(['compartilhada', id], await searchParams)
  );
}
