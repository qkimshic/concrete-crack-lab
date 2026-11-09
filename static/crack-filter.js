/* Retain dark ridges with bilateral contrast and seed-connected weak detail. */
const CrackFilter = (() => {
  function response(image) {
    const { rows, cols, data } = image;
    const strength = new Float32Array(rows * cols);
    const directions = [[1, 0], [0, 1], [1, 1], [1, -1]];
    const radii = [1, 2, 3, 5];
    for (const [dx, dy] of directions) {
      const along = new Float32Array(rows * cols);
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const index = y * cols + x;
          let sum = 0;
          for (let step = -2; step <= 2; step++) {
            const sampleX = Math.max(0, Math.min(cols - 1, x - dy * step));
            const sampleY = Math.max(0, Math.min(rows - 1, y + dx * step));
            sum += data[sampleY * cols + sampleX] * (3 - Math.abs(step));
          }
          along[index] = sum / 9;
        }
      }
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const index = y * cols + x;
          const center = along[index];
          for (const radius of radii) {
            const leftX = Math.max(0, Math.min(cols - 1, x - radius * dx));
            const leftY = Math.max(0, Math.min(rows - 1, y - radius * dy));
            const rightX = Math.max(0, Math.min(cols - 1, x + radius * dx));
            const rightY = Math.max(0, Math.min(rows - 1, y + radius * dy));
            const left = along[leftY * cols + leftX] - center;
            const right = along[rightY * cols + rightX] - center;
            strength[index] = Math.max(strength[index], Math.min(left, right));
          }
        }
      }
    }
    return strength;
  }

  function mask(cv, image, modelMask, options, own) {
    const strength = response(image);
    const weak = own(new cv.Mat.zeros(image.rows, image.cols, cv.CV_8UC1));
    const seeds = new Uint8Array(strength.length);
    const strongThreshold = options.threshold;
    const weakThreshold = Math.max(1.5, strongThreshold * 0.35);
    for (let index = 0; index < strength.length; index++) {
      if (strength[index] < weakThreshold) continue;
      weak.data[index] = 255;
      if (strength[index] >= strongThreshold || modelMask?.data[index]) seeds[index] = 1;
    }
    const labels = own(new cv.Mat());
    const stats = own(new cv.Mat());
    const centroids = own(new cv.Mat());
    const count = cv.connectedComponentsWithStats(weak, labels, stats, centroids, 8, cv.CV_32S);
    const supported = new Uint8Array(count);
    for (let index = 0; index < seeds.length; index++) {
      if (seeds[index]) supported[labels.data32S[index]] = 1;
    }
    for (let index = 0; index < weak.data.length; index++) {
      if (!supported[labels.data32S[index]]) weak.data[index] = 0;
    }
    return weak;
  }

  return { mask };
})();

if (typeof module !== 'undefined') module.exports = CrackFilter;
