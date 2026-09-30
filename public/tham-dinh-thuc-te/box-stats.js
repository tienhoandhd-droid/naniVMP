(() => {
  'use strict';

  const method = 'linear-type7-iqr1.5-v1';

  function quantile(sorted, probability) {
    const position = (sorted.length - 1) * probability;
    const lowerIndex = Math.floor(position);
    const upperIndex = Math.ceil(position);

    if (lowerIndex === upperIndex) return sorted[lowerIndex];

    const fraction = position - lowerIndex;
    return sorted[lowerIndex] * (1 - fraction) + sorted[upperIndex] * fraction;
  }

  function summarize(values) {
    const observations = [];

    values.forEach((value, index) => {
      if (typeof value === 'number' && Number.isFinite(value)) {
        observations.push({ index, value });
      }
    });

    const n = observations.length;
    const base = {
      n,
      q1: null,
      median: null,
      q3: null,
      iqr: null,
      lowerFence: null,
      upperFence: null,
      lowerWhisker: null,
      upperWhisker: null,
      outliers: [],
      smallSample: n < 4,
      method,
    };

    if (n === 0) return base;

    const sorted = observations.map(({ value }) => value).sort((a, b) => a - b);
    const q1 = quantile(sorted, 0.25);
    const median = quantile(sorted, 0.5);
    const q3 = quantile(sorted, 0.75);
    const iqr = q3 - q1;
    const lowerFence = q1 - 1.5 * iqr;
    const upperFence = q3 + 1.5 * iqr;
    const inFence = sorted.filter((value) => value >= lowerFence && value <= upperFence);

    return {
      n,
      q1,
      median,
      q3,
      iqr,
      lowerFence,
      upperFence,
      lowerWhisker: inFence[0],
      upperWhisker: inFence[inFence.length - 1],
      outliers: observations.filter(({ value }) => value < lowerFence || value > upperFence),
      smallSample: n < 4,
      method,
    };
  }

  window.CPC1BoxStats = { summarize };
})();
