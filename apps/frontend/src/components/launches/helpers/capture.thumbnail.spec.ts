import { afterEach, describe, expect, it, vi } from 'vitest';
import { captureVideoFrame } from './capture.video.frame';
afterEach(() => vi.useRealTimers());
const setup = () => {
  const video = document.createElement('video');
  Object.defineProperties(video, {
    readyState: { value: 2, configurable: true },
    seeking: { value: true, configurable: true },
    videoWidth: { value: 320 },
    videoHeight: { value: 240 },
    currentTime: { value: 9.9, configurable: true },
  });
  const drawImage = vi.fn();
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({ drawImage }),
    toBlob: (callback: (blob: Blob) => void) =>
      callback(new Blob(['jpeg'], { type: 'image/jpeg' })),
  } as unknown as HTMLCanvasElement;
  return { video, canvas, drawImage };
};
describe('captura do quadro', () => {
  it('espera seeked e captura timestamp do quadro decodificado', async () => {
    const { video, canvas, drawImage } = setup();
    const capturing = captureVideoFrame(video, canvas);
    await Promise.resolve();
    expect(drawImage).not.toHaveBeenCalled();
    Object.defineProperty(video, 'seeking', { value: false });
    video.dispatchEvent(new Event('seeked'));
    const result = await capturing;
    expect(drawImage).toHaveBeenCalledWith(video, 0, 0, 320, 240);
    expect(result.timestampMs).toBe(9900);
  });
  it('preserva o timestamp zero', async () => {
    const { video, canvas } = setup();
    Object.defineProperty(video, 'seeking', { value: false });
    Object.defineProperty(video, 'currentTime', { value: 0 });
    expect((await captureVideoFrame(video, canvas)).timestampMs).toBe(0);
  });
  it('falha com timeout sem copiar um quadro antigo', async () => {
    vi.useFakeTimers();
    const { video, canvas, drawImage } = setup();
    const result = expect(
      captureVideoFrame(video, canvas, 50)
    ).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(51);
    await result;
    expect(drawImage).not.toHaveBeenCalled();
  });
});
