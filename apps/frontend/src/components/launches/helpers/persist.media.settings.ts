type FetchApi = (url: string, options?: RequestInit) => Promise<Response>;
export type SavedMediaSettings = {
  id: string;
  name: string;
  path: string;
  thumbnail: string;
  alt: string;
  thumbnailTimestamp: number | null;
};
export async function persistMediaSettings(
  fetchApi: FetchApi,
  settings: {
    id: string;
    alt: string;
    thumbnail: string | null;
    newThumbnail: string | null;
    thumbnailTimestamp: number | null;
  },
  readBlob: (url: string) => Promise<Blob> = async (url) =>
    (await fetch(url)).blob()
): Promise<SavedMediaSettings> {
  let thumbnail = settings.thumbnail || '';
  if (settings.newThumbnail) {
    const form = new FormData();
    form.append('file', await readBlob(settings.newThumbnail), 'media.jpg');
    form.append('preventSave', 'true');
    const upload = await fetchApi('/media/upload-simple', {
      method: 'POST',
      body: form,
    });
    if (!upload.ok) throw new Error('Thumbnail upload failed');
    const result = await upload.json();
    if (typeof result?.path !== 'string' || !result.path)
      throw new Error('Invalid upload response');
    thumbnail = result.path;
  }
  const response = await fetchApi('/media/information', {
    method: 'POST',
    body: JSON.stringify({
      id: settings.id,
      alt: settings.alt,
      thumbnail,
      thumbnailTimestamp: settings.thumbnailTimestamp,
    }),
  });
  if (!response.ok) throw new Error('Media settings save failed');
  const result = await response.json();
  if (
    result?.id !== settings.id ||
    typeof result.path !== 'string' ||
    result.thumbnail !== thumbnail
  )
    throw new Error('Invalid media settings response');
  return result;
}
