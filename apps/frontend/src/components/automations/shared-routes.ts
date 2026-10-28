/** UI routes only. API paths are deliberately unchanged. */
export function legacyAutomationDestination(
  parts: string[],
  query: Record<string, string | string[] | undefined>
) {
  let path = '/automations';
  if (parts[0] === 'compartilhada')
    path += parts[1] === 'nova' ? '/new' : `/${encodeURIComponent(parts[1])}`;
  else if (parts[0] === 'repost')
    path += `/reposts/${
      parts[1] === 'nova' ? 'new' : encodeURIComponent(parts[1])
    }`;
  else if (parts[0] === 'nova') path += '/instagram/new';
  else if (parts[0] === 'logs') path += '/logs';
  else if (parts[0]) path += `/instagram/${encodeURIComponent(parts[0])}`;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query))
    for (const item of Array.isArray(value)
      ? value
      : value === undefined
      ? []
      : [value])
      params.append(key, item);
  return path + (params.toString() ? `?${params}` : '');
}
