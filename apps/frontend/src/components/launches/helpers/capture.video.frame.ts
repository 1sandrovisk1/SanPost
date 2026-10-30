// A slider updates currentTime before the decoder completes the seek. Never
// copy the old decoded frame and attach the newly selected timestamp to it.
const waitForDecodedFrame = (video: HTMLVideoElement, timeoutMs: number) =>
  new Promise<void>((resolve, reject) => {
    const ready = () =>
      !video.seeking &&
      video.readyState >= 2 &&
      video.videoWidth > 0 &&
      video.videoHeight > 0;
    if (ready()) {
      resolve();
      return;
    }
    const cleanup = () => {
      clearTimeout(timeout);
      video.removeEventListener('seeked', check);
      video.removeEventListener('loadeddata', check);
      video.removeEventListener('error', fail);
    };
    const check = () => {
      if (ready()) {
        cleanup();
        resolve();
      }
    };
    const fail = () => {
      cleanup();
      reject(new Error('Video frame unavailable'));
    };
    const timeout = setTimeout(fail, timeoutMs);
    video.addEventListener('seeked', check);
    video.addEventListener('loadeddata', check);
    video.addEventListener('error', fail);
  });

export async function captureVideoFrame(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  timeoutMs = 5000
) {
  await waitForDecodedFrame(video, timeoutMs);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas unavailable');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  const timestampMs = Math.round(video.currentTime * 1000);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (value) =>
        value ? resolve(value) : reject(new Error('Frame capture failed')),
      'image/jpeg',
      0.8
    );
  });
  return { blob, timestampMs };
}
