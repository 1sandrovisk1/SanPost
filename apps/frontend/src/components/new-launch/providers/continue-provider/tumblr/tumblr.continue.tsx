'use client';
import { withContinueProvider } from '../with-continue-provider';
export const TumblrContinue = withContinueProvider<
  { id: string; name: string; picture?: { data: { url: string } } },
  { id: string }
>({
  endpoint: 'pages',
  swrKey: 'load-tumblr-blogs',
  titleKey: 'select_tumblr_blog',
  titleDefault: 'Select Tumblr Blog:',
  emptyStateMessages: [
    {
      key: 'tumblr_no_blogs_found',
      text: 'No Tumblr blogs were found for this account.',
    },
    {
      key: 'tumblr_ensure_blog_exists',
      text: 'Create a blog in Tumblr, then reconnect the account.',
    },
  ],
  getItemId: (item) => item.id,
  getSelectionValue: (item) => ({ id: item.id }),
  transformSaveData: (selection) => selection,
  isSelected: (item, selection) => item.id === selection?.id,
  renderItem: (item) => (
    <>
      <img
        className="h-16 w-16 rounded-full"
        src={item.picture?.data?.url || '/no-picture.jpg'}
        alt={item.name}
      />
      <div>{item.name}</div>
    </>
  ),
});
