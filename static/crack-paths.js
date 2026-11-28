const CrackPaths = (() => {
  // Approximate paths limit the search. The photograph determines the pixels that enter the mask.
  function detect({width, height, data}, guide, threshold, minimum = 5) {
    const luma = new Float32Array(width * height);
    for (let i = 0; i < luma.length; i++) {
      luma[i] = .299 * data[4*i] + .587 * data[4*i+1] + .114 * data[4*i+2];
    }
    function sample(x, y) {
      x = Math.max(0, Math.min(width - 1, x));
      y = Math.max(0, Math.min(height - 1, y));
      const left = Math.floor(x), top = Math.floor(y);
      const right = Math.min(width - 1, left + 1), bottom = Math.min(height - 1, top + 1);
      const u = x - left, v = y - top;
      return (1-v) * ((1-u) * luma[top*width+left] + u * luma[top*width+right]) +
        v * ((1-u) * luma[bottom*width+left] + u * luma[bottom*width+right]);
    }
    function excluded(x, y) {
      return guide.exclude.some(([cx, cy, rx, ry]) => ((x-cx)/rx)**2 + ((y-cy)/ry)**2 <= 1);
    }

    const mask = new Uint8Array(width * height);
    const strokes = [];
    const searchRadius = 6;
    for (const path of guide.paths) {
      const scan = [];
      for (let i = 1; i < path.points.length; i++) {
        const [x, y] = path.points[i-1], [endX, endY] = path.points[i];
        const distance = Math.hypot(endX - x, endY - y);
        const steps = Math.ceil(distance);
        const tx = (endX - x) / distance, ty = (endY - y) / distance;
        for (let step = 0; step < steps; step++) {
          scan.push({x:x + step*(endX-x)/steps, y:y + step*(endY-y)/steps, tx, ty});
        }
      }
      const rows = [];
      for (let i = 0; i < scan.length; i++) {
        const {x, y, tx, ty} = scan[i];
        const profile = offset => {
          const px = x - ty * offset, py = y + tx * offset;
          return (sample(px-tx, py-ty) + 2*sample(px,py) + sample(px+tx,py+ty)) / 4;
        };
        const row = [];
        for (let offset = -searchRadius; offset <= searchRadius; offset++) {
          const value = profile(offset);
          const shoulder = path.width + 1;
          const left = (profile(offset-shoulder) + profile(offset-shoulder-2))/2;
          const right = (profile(offset+shoulder) + profile(offset+shoulder+2))/2;
          const contrast = Math.min(left,right) - value;
          const strength = Math.min(contrast, 45) - .9 * Math.abs(offset);
          const prev = rows[i-1];
          let score = strength, parent = 0;
          if (prev) {
            let best = -Infinity;
            for (let j = 0; j < prev.length; j++) {
              const delta = Math.abs(offset - prev[j].offset);
              const candidate = prev[j].score - 3 * delta - 2 * Math.max(0, delta-1);
              if (candidate > best) { best = candidate; parent = j; }
            }
            score += best;
          }
          const cutoff = value + .52 * contrast;
          let low = offset, high = offset;
          while (low > offset-path.width && profile(low-1) <= cutoff) low--;
          while (high < offset+path.width && profile(high+1) <= cutoff) high++;
          const usable = contrast >= threshold && high-low+1 <= path.width &&
            !excluded(x-ty*offset, y+tx*offset);
          row.push({offset,low,high,usable,score,parent});
        }
        rows.push(row);
      }
      if (!rows.length) continue;
      let index = rows.at(-1).reduce((best, row, i, last) => row.score > last[best].score ? i : best, 0);
      const selected = [];
      for (let i = rows.length - 1; i >= 0; i--) {
        selected[i] = rows[i][index];
        index = selected[i].parent;
      }
      let start = 0;
      for (let i = 0; i <= selected.length; i++) {
        if (selected[i]?.usable) continue;
        const area = selected.slice(start,i).reduce((sum, point) => sum + point.high - point.low + 1, 0);
        if (i - start >= 5 && area >= minimum) {
          let stroke = [];
          for (let k = start; k < i; k++) {
            const {x,y,tx,ty} = scan[k], {low,high,offset:center} = selected[k];
            const point = [x-ty*center, y+tx*center];
            const previous = stroke.at(-1);
            if (previous && Math.hypot(point[0]-previous[0], point[1]-previous[1]) > 3) {
              strokes.push(stroke);
              stroke = [];
            }
            stroke.push(point);
            for (let offset = low; offset <= high; offset++) {
              const px = Math.round(x - ty*offset), py = Math.round(y + tx*offset);
              if (px >= 0 && px < width && py >= 0 && py < height && !excluded(px,py)) {
                mask[py*width+px] = 255;
              }
            }
          }
          strokes.push(stroke);
        }
        start = i+1;
      }
    }
    return {mask, strokes};
  }

  return {detect};
})();

if (typeof module !== 'undefined') module.exports = CrackPaths;
