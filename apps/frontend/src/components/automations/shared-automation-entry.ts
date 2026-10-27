// Presentation routes only. Execution capabilities remain owned by each engine.
export const automationEntryOptions = {
  instagram: [
    {
      key: 'comment',
      icon: 'instagram',
      href: '/automacoes/nova?type=comment',
    },
    { key: 'story', icon: 'instagram', href: '/automacoes/nova?type=story' },
    { key: 'repost', icon: 'instagram', href: '/automacoes/repost/nova' },
  ],
  facebook: [
    {
      key: 'comment',
      icon: 'facebook',
      href: '/automacoes/compartilhada/nova?trigger=comment_on_post',
    },
    {
      key: 'message',
      icon: 'messenger',
      href: '/automacoes/compartilhada/nova?trigger=messenger_message',
    },
  ],
} as const;
