// Unit tests for the web engine's recovery: worker failures, the model cache and failed imports.
// Run with `npm test` (compiles with tsc first).
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { test } from 'node:test';

import { downloadFiles } from '../dist/esm/web/model-files.js';
import { connectPaddleWorker } from '../dist/esm/web/paddle-remote.js';

// The compiled modules import each other without `.js` (for bundlers); Node gets the extension added
register(
  'data:text/javascript,export async function resolve(specifier, context, next) {' +
    'try { return await next(specifier, context); } catch (error) {' +
    'if (specifier.startsWith(".") && !specifier.endsWith(".js")) return next(specifier + ".js", context);' +
    'throw error; } }',
);
const { createJapaneseOcr } = await import('../dist/esm/engine-switch.js');

/** A worker that answers `load` and lets the test fail it. */
function fakeWorker() {
  const listeners = { error: [], message: [] };
  return {
    terminated: false,
    addEventListener: (type, listener) => listeners[type].push(listener),
    postMessage(request) {
      if (request.type === 'load')
        queueMicrotask(() => this.emit('message', { data: { type: 'loaded', backend: 'wasm' } }));
    },
    terminate() {
      this.terminated = true;
    },
    emit: (type, event) => listeners[type].forEach((listener) => listener(event)),
  };
}

const image = { data: new Uint8ClampedArray(4), width: 1, height: 1 };

test('a call after the worker failed rejects at once and the caller hears of it', async () => {
  const worker = fakeWorker();
  let lost = 0;
  const engine = await connectPaddleWorker(worker, false, {}, () => lost++);

  const running = engine.recognize(image);
  worker.emit('error', { message: 'crashed' });
  await assert.rejects(running, /crashed/);

  await assert.rejects(engine.recognize(image), /crashed/);
  assert.equal(lost, 1);
  assert.equal(worker.terminated, true);
});

/** Cache Storage in memory. */
function fakeCaches() {
  const stored = new Map();
  const cache = {
    match: async (url) => (stored.has(url) ? new Response(stored.get(url)) : undefined),
    put: async (url, response) => void stored.set(url, new Uint8Array(await response.arrayBuffer())),
    keys: async () => [...stored.keys()].map((url) => ({ url })),
    delete: async ({ url }) => stored.delete(url),
  };
  globalThis.caches = { open: async () => cache, delete: async () => stored.clear() };
  return stored;
}

test('loading the CPU runtime after a GPU failure keeps the stored models', async () => {
  const stored = fakeCaches();
  const file = (name) => ({ name, url: new URL(`https://ocr.test/assets/${name}`) });
  const gpuSet = [file('det.onnx'), file('rec.onnx'), file('ort-wasm-webgpu.bin')];
  for (const { url } of gpuSet) stored.set(url.href, new Uint8Array([1]));

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(new Uint8Array([2]));
  try {
    await downloadFiles([file('ort-wasm.bin')], { keep: [...gpuSet, file('ort-wasm.bin')] });
  } finally {
    globalThis.fetch = originalFetch;
    delete globalThis.caches;
  }

  assert.deepEqual([...stored.keys()].sort(), [...gpuSet, file('ort-wasm.bin')].map(({ url }) => url.href).sort());
});

test('a web engine whose import failed is imported again on the next call', async () => {
  let imports = 0;
  const ocr = createJapaneseOcr({
    web: async () => {
      imports++;
      if (imports === 1) throw new TypeError('Failed to fetch dynamically imported module');
      return { isOcrReady: async () => ({ ready: true }) };
    },
  });

  await assert.rejects(ocr.isOcrReady(), /dynamically imported/);
  assert.deepEqual(await ocr.isOcrReady(), { ready: true });
  assert.equal(imports, 2);
});
