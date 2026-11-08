/* ONNX inference runs in a dedicated worker so the controls remain responsive. */
(() => {
  const workerUrl = new URL('unet-worker.js?v=6', document.currentScript.src);
  let worker;
  let nextId = 0;
  const requests = new Map();

  function getWorker() {
    if (worker) return worker;
    worker = new Worker(workerUrl);
    worker.onmessage = ({ data }) => {
      const request = requests.get(data.id);
      if (!request) return;
      if (data.type === 'progress') {
        request.onProgress(data.message);
        return;
      }
      requests.delete(data.id);
      clearTimeout(request.timeout);
      if (data.type === 'error') request.reject(new Error(data.message));
      else request.resolve(data);
    };
    worker.onerror = () => {
      for (const request of requests.values()) {
        clearTimeout(request.timeout);
        request.reject(new Error('U-Net 실행 중 오류가 발생했습니다. 페이지를 새로 열어 다시 실행하세요.'));
      }
      requests.clear();
      worker.terminate();
      worker = undefined;
    };
    return worker;
  }

  window.UnetSegmentation = {
    segment(image, onProgress = () => {}) {
      const activeWorker = getWorker();
      const id = ++nextId;
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          activeWorker.terminate();
          worker = undefined;
          for (const request of requests.values()) {
            clearTimeout(request.timeout);
            request.reject(new Error('U-Net 모델을 실행하지 못했습니다. 네트워크 연결을 확인하고 다시 실행하세요.'));
          }
          requests.clear();
        }, 240000);
        requests.set(id, { resolve, reject, onProgress, timeout });
        activeWorker.postMessage({ id, image }, [image.data.buffer]);
      });
    }
  };
})();
