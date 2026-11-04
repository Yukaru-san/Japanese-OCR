import type { DownloadOptions } from './model-files';
import type {
  DetectOptions,
  LineOptions,
  PaddleBackend,
  PaddleCandidate,
  PaddleEngine,
  PaddleLine,
  RgbaImage,
} from './paddle';

export type WorkerRequest =
  | { type: 'load'; gpu: boolean }
  | { type: 'cancel' }
  | {
      type: 'run';
      id: number;
      method: 'recognize' | 'recognizeLine';
      image: RgbaImage;
      options?: DetectOptions | LineOptions;
    };

export type WorkerResponse =
  | { type: 'loaded'; backend: PaddleBackend }
  | { type: 'progress'; loadedBytes: number; totalBytes: number }
  | { type: 'failed'; message: string; aborted: boolean }
  | { type: 'result'; id: number; result: PaddleLine[] | PaddleCandidate[] }
  | { type: 'error'; id: number; message: string };

/**
 * The engine in a Web Worker (`paddle-worker.ts`), behind the same interface as on the page.
 * Rejects when the worker can't start or can't load the models; the caller then loads them on the
 * page instead. A cancelled download (`signal`) rejects with an `AbortError`.
 * Once the worker failed, the engine rejects every call right away and `onLost` tells the caller,
 * which can start a new one.
 */
export function connectPaddleWorker(
  worker: Worker,
  gpu: boolean,
  options: DownloadOptions = {},
  onLost?: () => void,
): Promise<PaddleEngine> {
  const pending = new Map<number, { resolve: (result: never) => void; reject: (e: Error) => void }>();
  let nextId = 0;
  // Set once the worker is gone; nothing can answer anymore
  let lost: Error | null = null;

  return new Promise((resolve, reject) => {
    const fail = (message: string, aborted = false) => {
      if (lost) return;
      worker.terminate();
      const error = aborted ? new DOMException(message, 'AbortError') : new Error(message);
      lost = error;
      pending.forEach((call) => call.reject(error));
      pending.clear();
      reject(error);
      onLost?.();
    };

    worker.addEventListener('error', (event) => fail(event.message || 'The OCR worker failed.'));
    worker.addEventListener('message', (event: MessageEvent<WorkerResponse>) => {
      const response = event.data;
      if (response.type === 'progress') return options.onProgress?.(response.loadedBytes, response.totalBytes);
      if (response.type === 'failed') return fail(response.message, response.aborted);
      if (response.type === 'loaded') return resolve(remoteEngine(response.backend));

      const call = pending.get(response.id);
      pending.delete(response.id);
      if (response.type === 'result') call?.resolve(response.result as never);
      else call?.reject(new Error(response.message));
    });

    if (options.signal?.aborted) return fail('The download was cancelled.', true);
    options.signal?.addEventListener('abort', () => worker.postMessage({ type: 'cancel' } satisfies WorkerRequest));
    worker.postMessage({ type: 'load', gpu } satisfies WorkerRequest);
  });

  function remoteEngine(backend: PaddleBackend): PaddleEngine {
    const run = <T>(method: 'recognize' | 'recognizeLine', image: RgbaImage, options?: DetectOptions | LineOptions) =>
      new Promise<T>((resolve, reject) => {
        if (lost) return reject(lost);
        const id = nextId++;
        pending.set(id, { resolve: resolve as (result: never) => void, reject });
        // A copy moves to the worker, the caller keeps its pixels
        const data = new Uint8ClampedArray(image.data);
        const request: WorkerRequest = { type: 'run', id, method, image: { ...image, data }, options };
        worker.postMessage(request, [data.buffer]);
      });

    return {
      backend,
      recognize: (image, options) => run<PaddleLine[]>('recognize', image, options),
      recognizeLine: (image, options) => run<PaddleCandidate[]>('recognizeLine', image, options),
    };
  }
}
