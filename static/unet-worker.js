importScripts('vendor/ort.wasm.min.js');

ort.env.wasm.numThreads = 1;
ort.env.wasm.proxy = false;
ort.env.wasm.wasmPaths = new URL('vendor/', self.location.href).href;
let session;
let manifest;

const progress = (id, message) => self.postMessage({ id, type: 'progress', message });

async function loadModel(id) {
  if (session) return session;
  progress(id, 'U-Net 모델 불러오는 중…');
  const manifestUrl = new URL('../models/manifest.json', self.location.href);
  const response = await fetch(manifestUrl);
  if (!response.ok) throw new Error('U-Net 모델 정보를 불러오지 못했습니다.');
  manifest = await response.json();
  const model = new Uint8Array(manifest.bytes);
  let offset = 0;
  for (const chunk of manifest.chunks) {
    const response = await fetch(new URL(chunk.file, manifestUrl));
    if (!response.ok) throw new Error('U-Net 모델을 내려받지 못했습니다. 연결을 확인하고 다시 실행하세요.');
    const data = new Uint8Array(await response.arrayBuffer());
    const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', data));
    const digest = Array.from(hash, value => value.toString(16).padStart(2, '0')).join('');
    if (data.length !== chunk.bytes || digest !== chunk.sha256) {
      throw new Error('U-Net 모델 파일을 확인하지 못했습니다. 새로고침 후 다시 실행하세요.');
    }
    model.set(data, offset);
    offset += data.length;
    progress(id, `U-Net 모델 불러오는 중 ${Math.round(offset / manifest.bytes * 100)}%`);
  }
  progress(id, 'U-Net 모델 준비 중…');
  session = await ort.InferenceSession.create(model, {
    executionProviders: ['wasm'],
    graphOptimizationLevel: 'all'
  });
  return session;
}

function prepare(image) {
  const original = new OffscreenCanvas(image.width, image.height);
  original.getContext('2d').putImageData(new ImageData(image.data, image.width, image.height), 0, 0);
  const small = new OffscreenCanvas(256, 256);
  const context = small.getContext('2d', { willReadFrequently: true });
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(original, 0, 0, 256, 256);
  const pixels = context.getImageData(0, 0, 256, 256).data;
  const tensor = new Float32Array(3 * 256 * 256);
  const { mean, std } = manifest.input;
  for (let channel = 0; channel < 3; channel++) {
    for (let index = 0; index < 256 * 256; index++) {
      tensor[channel * 256 * 256 + index] = (pixels[4 * index + channel] / 255 - mean[channel]) / std[channel];
    }
  }
  return new ort.Tensor('float32', tensor, [1, 3, 256, 256]);
}

self.onmessage = async ({ data: { id, image } }) => {
  let input;
  let output;
  try {
    const activeSession = await loadModel(id);
    progress(id, 'U-Net으로 균열 분할 중…');
    input = prepare(image);
    const result = await activeSession.run({ [manifest.input.name]: input });
    output = result[manifest.output.name];
    const scores = new Float32Array(output.data.length);
    for (let i = 0; i < scores.length; i++) scores[i] = 1 - output.data[i];
    const model = {
      id: manifest.id,
      revision: manifest.revision,
      weights_sha256: manifest.weights_sha256,
      onnx_sha256: manifest.sha256,
      output_transform: manifest.output.crack_score,
      input_size: [256, 256],
      runtime: 'ONNX Runtime Web 1.20.1 / WASM'
    };
    self.postMessage({ id, type: 'result', scores, model }, [scores.buffer]);
  } catch (error) {
    self.postMessage({ id, type: 'error', message: `U-Net 실행 실패. ${error.message}` });
  } finally {
    input?.dispose();
    output?.dispose();
  }
};
