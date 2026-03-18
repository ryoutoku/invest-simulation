export type SimParams = {
  initialAmount: number;
  monthlyContribution: number;
  monthlyWithdrawal: number;
  months: number;
  expectedReturnYearly: number;
  volatilityYearly: number;
  numPaths: number;
  taxRate?: number;
};

export type SimSummary = {
  median: number[];
  p10: number[];
  p30: number[];
  p70: number[];
  p90: number[];
  normalMedian: number[];
  lockedMedian: number[];
  nisaMedian: number[];
  deterministic?: number[];
};

function normalRandom() {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

export function simulatePaths(params: SimParams) {
  const {
    initialAmount,
    monthlyContribution,
    monthlyWithdrawal,
    months,
    expectedReturnYearly,
    volatilityYearly,
    numPaths,
    taxRate = 0,
  } = params;

  const muYearlyDec = expectedReturnYearly / 100;
  const sigmaYearlyDec = volatilityYearly / 100;
  const dt = 1 / 12;
  const afterTaxReturn = (1 + muYearlyDec) * (1 - taxRate) - 1;
  const drift = (afterTaxReturn - 0.5 * sigmaYearlyDec * sigmaYearlyDec) * dt;
  const diffusion = sigmaYearlyDec * Math.sqrt(dt);

  const paths = Array.from({ length: numPaths }, () =>
    new Array(months).fill(0),
  );

  for (let p = 0; p < numPaths; p++) {
    let value = initialAmount;
    for (let t = 0; t < months; t++) {
      value += monthlyContribution;
      const z = normalRandom();
      const monthlyGross = Math.exp(drift + diffusion * z);
      value *= monthlyGross;
      if (monthlyWithdrawal > 0) {
        value -= monthlyWithdrawal;
      }
      paths[p][t] = Math.max(value, 0);
    }
  }

  return paths as number[][];
}

function percentile(values: number[], p: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sorted[lower];
  const weight = idx - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

export function summarizePaths(paths: number[][]) {
  const months = paths[0]?.length ?? 0;
  const median: number[] = [];
  const p10: number[] = [];
  const p30: number[] = [];
  const p70: number[] = [];
  const p90: number[] = [];

  for (let t = 0; t < months; t++) {
    const vals = paths.map((p) => p[t]);
    median.push(percentile(vals, 50));
    p10.push(percentile(vals, 10));
    p30.push(percentile(vals, 30));
    p70.push(percentile(vals, 70));
    p90.push(percentile(vals, 90));
  }

  return { median, p10, p30, p70, p90 };
}

export function computeDeterministicPath(params: {
  initialAmount: number;
  monthlyContribution: number;
  monthlyWithdrawal: number;
  months: number;
  expectedReturnYearly: number;
  taxRate?: number;
}) {
  const {
    initialAmount,
    monthlyContribution,
    monthlyWithdrawal,
    months,
    expectedReturnYearly,
    taxRate = 0,
  } = params;

  const muYearlyDec = expectedReturnYearly / 100;
  const afterTaxReturn = (1 + muYearlyDec) * (1 - taxRate) - 1;
  const monthlyGross = Math.pow(1 + afterTaxReturn, 1 / 12);
  const path = new Array(months).fill(0);
  let value = initialAmount;

  for (let t = 0; t < months; t++) {
    value += monthlyContribution;
    value *= monthlyGross;
    if (monthlyWithdrawal > 0) {
      value -= monthlyWithdrawal;
    }
    path[t] = Math.max(value, 0);
  }

  return path as number[];
}

export function formatCurrency(value: number) {
  return value.toLocaleString("ja-JP", {
    style: "currency",
    currency: "JPY",
    maximumFractionDigits: 0,
  });
}
