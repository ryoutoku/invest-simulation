/* eslint-disable */
const formEl = document.getElementById('sim-form') as HTMLFormElement | null;
const summaryElMaybe = document.getElementById('summary') as HTMLParagraphElement | null;
const chartElMaybe = document.getElementById('chart') as SVGSVGElement | null;
const tooltipElMaybe = document.getElementById('chart-tooltip') as HTMLDivElement | null;
const histElMaybe = document.getElementById('histogram') as SVGSVGElement | null;
const histTooltipElMaybe = document.getElementById('hist-tooltip') as HTMLDivElement | null;

if (
  !formEl ||
  !summaryElMaybe ||
  !chartElMaybe ||
  !tooltipElMaybe ||
  !histElMaybe ||
  !histTooltipElMaybe
) {
  console.warn('必要な要素が見つからず、シミュレーションを初期化できませんでした。');
} else {
  const form = formEl;
  const summaryEl = summaryElMaybe;
  const chartEl = chartElMaybe;
  const tooltipEl = tooltipElMaybe;
  const histEl = histElMaybe;
  const histTooltipEl = histTooltipElMaybe;
  const WIDTH = 800;
  const HEIGHT = 400;
  const PADDING_LEFT = 70;
  const PADDING_RIGHT = 20;
  const PADDING_TOP = 20;
  const PADDING_BOTTOM = 40;

  function normalRandom() {
    let u = 0;
    let v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  }

  function simulatePaths({
    initialAmount,
    monthlyContribution,
    monthlyWithdrawal,
    months,
    expectedReturnYearly,
    volatilityYearly,
    numPaths,
  }: {
    initialAmount: number;
    monthlyContribution: number;
    monthlyWithdrawal: number;
    months: number;
    expectedReturnYearly: number;
    volatilityYearly: number;
    numPaths: number;
  }) {
    const muYearlyDec = expectedReturnYearly / 100;
    const sigmaYearlyDec = volatilityYearly / 100;
    const dt = 1 / 12;
    const drift = (muYearlyDec - 0.5 * sigmaYearlyDec * sigmaYearlyDec) * dt;
    const diffusion = sigmaYearlyDec * Math.sqrt(dt);

    const paths = Array.from({ length: numPaths }, () => new Array(months).fill(0));

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

  function summarize(paths: number[][]) {
    const months = paths[0]?.length ?? 0;
    const median: number[] = [];
    const p10: number[] = [];
    const p90: number[] = [];

    for (let t = 0; t < months; t++) {
      const vals = paths.map((p) => p[t]);
      median.push(percentile(vals, 50));
      p10.push(percentile(vals, 10));
      p90.push(percentile(vals, 90));
    }

    return { median, p10, p90 };
  }

  function computeDeterministicPath({
    initialAmount,
    monthlyContribution,
    monthlyWithdrawal,
    months,
    expectedReturnYearly,
  }: {
    initialAmount: number;
    monthlyContribution: number;
    monthlyWithdrawal: number;
    months: number;
    expectedReturnYearly: number;
  }) {
    const muYearlyDec = expectedReturnYearly / 100;
    const monthlyGross = Math.pow(1 + muYearlyDec, 1 / 12);
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

  function formatCurrency(value: number) {
    return value.toLocaleString('ja-JP', {
      style: 'currency',
      currency: 'JPY',
      maximumFractionDigits: 0,
    });
  }

  function clearChart() {
    while (chartEl.firstChild) {
      chartEl.removeChild(chartEl.firstChild);
    }
  }

  function clearHistogram() {
    while (histEl.firstChild) {
      histEl.removeChild(histEl.firstChild);
    }
  }

  const chartState: {
    summaryData: null | { median: number[]; p10: number[]; p90: number[]; deterministic?: number[] };
    months: number;
    maxVal: number;
    minVal: number;
    cursorLine: null | SVGLineElement;
    cursorDot: null | SVGCircleElement;
  } = {
    summaryData: null,
    months: 0,
    maxVal: 0,
    minVal: 0,
    cursorLine: null,
    cursorDot: null,
  };

  function drawChart(
    summaryData: { median: number[]; p10: number[]; p90: number[]; deterministic?: number[] },
    months: number,
  ) {
    clearChart();

    const svgNS = 'http://www.w3.org/2000/svg';

    const rootRect = document.createElementNS(svgNS, 'rect');
    rootRect.setAttribute('x', '0');
    rootRect.setAttribute('y', '0');
    rootRect.setAttribute('width', WIDTH.toString());
    rootRect.setAttribute('height', HEIGHT.toString());
    rootRect.setAttribute('fill', '#ffffff');
    chartEl.appendChild(rootRect);

    const { median, p10, p90, deterministic } = summaryData;
    const all = [...median, ...p10, ...p90, ...(deterministic ?? [])];
    const maxVal = Math.max(...all);
    const minVal = 0;

    chartState.summaryData = summaryData;
    chartState.months = months;
    chartState.maxVal = maxVal;
    chartState.minVal = minVal;

    const innerWidth = WIDTH - PADDING_LEFT - PADDING_RIGHT;
    const innerHeight = HEIGHT - PADDING_TOP - PADDING_BOTTOM;

    const xScale = (i: number) => PADDING_LEFT + (innerWidth * i) / (months - 1 || 1);
    const yScale = (v: number) =>
      PADDING_TOP + innerHeight * (1 - (v - minVal) / (maxVal - minVal || 1));

    const gridGroup = document.createElementNS(svgNS, 'g');

    const yTicks = 4;
    for (let i = 0; i <= yTicks; i++) {
      const t = i / yTicks;
      const value = minVal + (maxVal - minVal) * (1 - t);
      const y = PADDING_TOP + innerHeight * t;

      const line = document.createElementNS(svgNS, 'line');
      line.setAttribute('x1', PADDING_LEFT.toString());
      line.setAttribute('x2', (WIDTH - PADDING_RIGHT).toString());
      line.setAttribute('y1', y.toString());
      line.setAttribute('y2', y.toString());
      line.setAttribute('stroke', 'rgba(209,213,219,0.9)');
      line.setAttribute('stroke-width', '1');
      line.setAttribute('stroke-dasharray', '2 3');
      gridGroup.appendChild(line);

      const label = document.createElementNS(svgNS, 'text');
      label.setAttribute('x', (PADDING_LEFT - 8).toString());
      label.setAttribute('y', (y + 4).toString());
      label.setAttribute('text-anchor', 'end');
      label.setAttribute('fill', '#6b7280');
      label.setAttribute('font-size', '10');
      label.textContent = formatCurrency(value);
      gridGroup.appendChild(label);
    }

    const yearStep = months / 12 > 25 ? 5 : months / 12 > 10 ? 2 : 1;
    for (let year = 0; year <= months / 12; year += yearStep) {
      const m = year * 12;
      const x = xScale(Math.min(m, months - 1));

      const line = document.createElementNS(svgNS, 'line');
      line.setAttribute('x1', x.toString());
      line.setAttribute('x2', x.toString());
      line.setAttribute('y1', PADDING_TOP.toString());
      line.setAttribute('y2', (HEIGHT - PADDING_BOTTOM).toString());
      line.setAttribute('stroke', 'rgba(156,163,175,0.8)');
      line.setAttribute('stroke-width', '1');
      line.setAttribute('stroke-dasharray', '2 3');
      gridGroup.appendChild(line);

      const label = document.createElementNS(svgNS, 'text');
      label.setAttribute('x', x.toString());
      label.setAttribute('y', (HEIGHT - PADDING_BOTTOM + 18).toString());
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('fill', '#6b7280');
      label.setAttribute('font-size', '10');
      label.textContent = `${year}年`;
      gridGroup.appendChild(label);
    }

    chartEl.appendChild(gridGroup);

    const bandPath = document.createElementNS(svgNS, 'path');
    let dBand = '';
    for (let i = 0; i < months; i++) {
      const x = xScale(i);
      const y = yScale(p90[i]);
      dBand += i === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`;
    }
    for (let i = months - 1; i >= 0; i--) {
      const x = xScale(i);
      const y = yScale(p10[i]);
      dBand += ` L ${x} ${y}`;
    }
    dBand += ' Z';
    bandPath.setAttribute('d', dBand);
    bandPath.setAttribute('fill', 'rgba(191, 219, 254, 0.7)');
    bandPath.setAttribute('stroke', 'none');
    chartEl.appendChild(bandPath);

    const medianPath = document.createElementNS(svgNS, 'path');
    let dMedian = '';
    for (let i = 0; i < months; i++) {
      const x = xScale(i);
      const y = yScale(median[i]);
      dMedian += i === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`;
    }
    medianPath.setAttribute('d', dMedian);
    medianPath.setAttribute('fill', 'none');
    medianPath.setAttribute('stroke', '#1d4ed8');
    medianPath.setAttribute('stroke-width', '2.5');
    chartEl.appendChild(medianPath);

    if (deterministic && deterministic.length === months) {
      const detPath = document.createElementNS(svgNS, 'path');
      let dDet = '';
      for (let i = 0; i < months; i++) {
        const x = xScale(i);
        const y = yScale(deterministic[i]);
        dDet += i === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`;
      }
      detPath.setAttribute('d', dDet);
      detPath.setAttribute('fill', 'none');
      detPath.setAttribute('stroke', '#10b981');
      detPath.setAttribute('stroke-width', '1.8');
      detPath.setAttribute('stroke-dasharray', '6 3');
      chartEl.appendChild(detPath);
    }

    const cursorLine = document.createElementNS(svgNS, 'line');
    cursorLine.setAttribute('x1', PADDING_LEFT.toString());
    cursorLine.setAttribute('x2', PADDING_LEFT.toString());
    cursorLine.setAttribute('y1', PADDING_TOP.toString());
    cursorLine.setAttribute('y2', (HEIGHT - PADDING_BOTTOM).toString());
    cursorLine.setAttribute('stroke', '#f97316');
    cursorLine.setAttribute('stroke-width', '1.5');
    cursorLine.setAttribute('stroke-dasharray', '4 3');
    cursorLine.setAttribute('opacity', '0');
    chartEl.appendChild(cursorLine);

    const cursorDot = document.createElementNS(svgNS, 'circle');
    cursorDot.setAttribute('cx', PADDING_LEFT.toString());
    cursorDot.setAttribute('cy', (HEIGHT - PADDING_BOTTOM).toString());
    cursorDot.setAttribute('r', '4');
    cursorDot.setAttribute('fill', '#ef4444');
    cursorDot.setAttribute('stroke', '#ffffff');
    cursorDot.setAttribute('stroke-width', '1.5');
    cursorDot.setAttribute('opacity', '0');
    chartEl.appendChild(cursorDot);

    chartState.cursorLine = cursorLine;
    chartState.cursorDot = cursorDot;
  }

  function updateTooltipFromEvent(event: MouseEvent) {
    if (!chartState.summaryData || chartState.months <= 0) {
      tooltipEl.hidden = true;
      return;
    }

    const rect = chartEl.getBoundingClientRect();
    const xClient = event.clientX;
    const yClient = event.clientY;

    const localX = xClient - rect.left;
    const localY = yClient - rect.top;
    const scaleX = WIDTH / rect.width;
    const scaleY = HEIGHT / rect.height;
    const svgX = localX * scaleX;

    const innerWidth = WIDTH - PADDING_LEFT - PADDING_RIGHT;
    const innerHeight = HEIGHT - PADDING_TOP - PADDING_BOTTOM;

    const clampedSvgX = Math.min(Math.max(svgX, PADDING_LEFT), WIDTH - PADDING_RIGHT);
    const ratio = innerWidth === 0 ? 0 : (clampedSvgX - PADDING_LEFT) / innerWidth;
    const idx = Math.round(ratio * (chartState.months - 1 || 1));

    const year = (idx / 12).toFixed(1);
    const { median, p10, p90, deterministic } = chartState.summaryData;
    const vMedian = median[idx];
    const vP10 = p10[idx];
    const vP90 = p90[idx];
    const vDet = deterministic && deterministic[idx] != null ? deterministic[idx] : null;

    const maxVal = chartState.maxVal;
    const minVal = chartState.minVal;

    const xPlot = PADDING_LEFT + innerWidth * (idx / (chartState.months - 1 || 1));
    const yPlot =
      PADDING_TOP + innerHeight * (1 - (vMedian - minVal) / (maxVal - minVal || 1));

    if (chartState.cursorLine && chartState.cursorDot) {
      chartState.cursorLine.setAttribute('x1', xPlot.toString());
      chartState.cursorLine.setAttribute('x2', xPlot.toString());
      chartState.cursorLine.setAttribute('opacity', '1');

      chartState.cursorDot.setAttribute('cx', xPlot.toString());
      chartState.cursorDot.setAttribute('cy', yPlot.toString());
      chartState.cursorDot.setAttribute('opacity', '1');
    }

    tooltipEl.hidden = false;
    tooltipEl.style.left = `${localX}px`;
    tooltipEl.style.top = `${localY}px`;

    let html = `
      <div>${year}年目（${idx}ヶ月）</div>
      <div>中央値: <strong>${formatCurrency(vMedian)}</strong></div>
      <div>10〜90%: ${formatCurrency(vP10)}〜${formatCurrency(vP90)}</div>
    `;
    if (vDet != null) {
      html += `<div>理論値: <strong>${formatCurrency(vDet)}</strong></div>`;
    }
    tooltipEl.innerHTML = html;
  }

  chartEl.addEventListener('mousemove', (event) => {
    updateTooltipFromEvent(event);
  });

  chartEl.addEventListener('mouseleave', () => {
    tooltipEl.hidden = true;
    if (chartState.cursorLine && chartState.cursorDot) {
      chartState.cursorLine.setAttribute('opacity', '0');
      chartState.cursorDot.setAttribute('opacity', '0');
    }
  });

  function computeHistogram(values: number[], bucketCount = 30) {
    if (!values.length) return [];
    const min = Math.min(...values);
    const max = Math.max(...values);
    if (min === max) {
      return [
        {
          start: min,
          end: max,
          count: values.length,
        },
      ];
    }

    const buckets = Array.from({ length: bucketCount }, (_, i) => ({
      start: min + ((max - min) / bucketCount) * i,
      end: min + ((max - min) / bucketCount) * (i + 1),
      count: 0,
    }));

    for (const v of values) {
      const idx = v === max ? bucketCount - 1 : Math.floor(((v - min) / (max - min)) * bucketCount);
      buckets[idx].count++;
    }

    return buckets;
  }

  const histState = {
    buckets: [] as { start: number; end: number; count: number }[],
    totalCount: 0,
  };

  function drawHistogram(buckets: { start: number; end: number; count: number }[]) {
    clearHistogram();

    const WIDTH_H = 800;
    const HEIGHT_H = 220;
    const PAD_L = 70;
    const PAD_R = 20;
    const PAD_T = 20;
    const PAD_B = 40;

    const svgNS = 'http://www.w3.org/2000/svg';

    const bg = document.createElementNS(svgNS, 'rect');
    bg.setAttribute('x', '0');
    bg.setAttribute('y', '0');
    bg.setAttribute('width', WIDTH_H.toString());
    bg.setAttribute('height', HEIGHT_H.toString());
    bg.setAttribute('fill', '#ffffff');
    histEl.appendChild(bg);

    if (!buckets.length) {
      return;
    }

    histState.buckets = buckets;
    histState.totalCount = buckets.reduce((sum, b) => sum + b.count, 0);

    const innerWidth = WIDTH_H - PAD_L - PAD_R;
    const innerHeight = HEIGHT_H - PAD_T - PAD_B;
    const maxCount = Math.max(...buckets.map((b) => b.count));

    const xAxis = document.createElementNS(svgNS, 'line');
    xAxis.setAttribute('x1', PAD_L.toString());
    xAxis.setAttribute('x2', (WIDTH_H - PAD_R).toString());
    xAxis.setAttribute('y1', (HEIGHT_H - PAD_B).toString());
    xAxis.setAttribute('y2', (HEIGHT_H - PAD_B).toString());
    xAxis.setAttribute('stroke', '#d1d5db');
    xAxis.setAttribute('stroke-width', '1');
    histEl.appendChild(xAxis);

    const barWidth = innerWidth / buckets.length;

    buckets.forEach((b, i) => {
      const barHeight = maxCount === 0 ? 0 : (innerHeight * b.count) / maxCount;
      const x = PAD_L + barWidth * i;
      const y = HEIGHT_H - PAD_B - barHeight;

      const rect = document.createElementNS(svgNS, 'rect');
      rect.setAttribute('x', x.toString());
      rect.setAttribute('y', y.toString());
      rect.setAttribute('width', Math.max(barWidth - 2, 1).toString());
      rect.setAttribute('height', barHeight.toString());
      rect.setAttribute('fill', '#bfdbfe');
      histEl.appendChild(rect);
    });

    const min = buckets[0].start;
    const max = buckets[buckets.length - 1].end;

    const minLabel = document.createElementNS(svgNS, 'text');
    minLabel.setAttribute('x', PAD_L.toString());
    minLabel.setAttribute('y', (HEIGHT_H - PAD_B + 24).toString());
    minLabel.setAttribute('text-anchor', 'start');
    minLabel.setAttribute('fill', '#6b7280');
    minLabel.setAttribute('font-size', '10');
    minLabel.textContent = formatCurrency(min);
    histEl.appendChild(minLabel);

    const maxLabel = document.createElementNS(svgNS, 'text');
    maxLabel.setAttribute('x', (WIDTH_H - PAD_R).toString());
    maxLabel.setAttribute('y', (HEIGHT_H - PAD_B + 24).toString());
    maxLabel.setAttribute('text-anchor', 'end');
    maxLabel.setAttribute('fill', '#6b7280');
    maxLabel.setAttribute('font-size', '10');
    maxLabel.textContent = formatCurrency(max);
    histEl.appendChild(maxLabel);
  }

  function updateHistTooltip(event: MouseEvent) {
    if (!histState.buckets.length || histState.totalCount <= 0) {
      histTooltipEl.hidden = true;
      return;
    }

    const rect = histEl.getBoundingClientRect();
    const localX = event.clientX - rect.left;
    const localY = event.clientY - rect.top;

    const WIDTH_H = 800;
    const HEIGHT_H = 220;
    const PAD_L = 70;
    const PAD_R = 20;
    const PAD_T = 20;
    const PAD_B = 40;

    const scaleX = WIDTH_H / rect.width;
    const scaleY = HEIGHT_H / rect.height;
    const svgX = localX * scaleX;
    const svgY = localY * scaleY;

    const innerWidth = WIDTH_H - PAD_L - PAD_R;

    if (svgX < PAD_L || svgX > WIDTH_H - PAD_R || svgY < PAD_T || svgY > HEIGHT_H - PAD_B) {
      histTooltipEl.hidden = true;
      return;
    }

    const ratio = (svgX - PAD_L) / innerWidth;
    const idx = Math.min(histState.buckets.length - 1, Math.max(0, Math.floor(ratio * histState.buckets.length)));
    const bucket = histState.buckets[idx];

    const percent = (bucket.count / histState.totalCount) * 100;

    histTooltipEl.hidden = false;
    histTooltipEl.style.left = `${localX}px`;
    histTooltipEl.style.top = `${localY}px`;
    histTooltipEl.innerHTML = `
      <div>範囲: <strong>${formatCurrency(bucket.start)}〜${formatCurrency(bucket.end)}</strong></div>
      <div>本数: ${bucket.count}本（${percent.toFixed(1)}%）</div>
    `;
  }

  histEl.addEventListener('mousemove', (event) => {
    updateHistTooltip(event);
  });

  histEl.addEventListener('mouseleave', () => {
    histTooltipEl.hidden = true;
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();

    const yenPerMan = 10_000;
    const initialAmount =
      Number((document.getElementById('initial-amount') as HTMLInputElement).value) * yenPerMan;
    const monthlyContribution =
      Number((document.getElementById('monthly-contribution') as HTMLInputElement).value) * yenPerMan;
    const monthlyWithdrawal =
      Number((document.getElementById('monthly-withdrawal') as HTMLInputElement).value) * yenPerMan;
    const years = Number((document.getElementById('years') as HTMLInputElement).value);
    const expectedReturnYearly = Number((document.getElementById('expected-return') as HTMLInputElement).value);
    const volatilityYearly = Number((document.getElementById('volatility') as HTMLInputElement).value);
    const numPaths = Number((document.getElementById('num-paths') as HTMLInputElement).value);

    const lockedInitial =
      Number((document.getElementById('locked-initial') as HTMLInputElement).value) * yenPerMan;
    const lockedMonthly =
      Number((document.getElementById('locked-monthly') as HTMLInputElement).value) * yenPerMan;
    const lockedYears = Number((document.getElementById('locked-years') as HTMLInputElement).value);
    const lockedExpectedReturn = Number((document.getElementById('locked-expected-return') as HTMLInputElement).value);
    const lockedVolatility = Number((document.getElementById('locked-volatility') as HTMLInputElement).value);

    if (
      !Number.isFinite(initialAmount) ||
      !Number.isFinite(monthlyContribution) ||
      !Number.isFinite(monthlyWithdrawal) ||
      !Number.isFinite(lockedInitial) ||
      !Number.isFinite(lockedMonthly) ||
      !Number.isFinite(lockedYears) ||
      !Number.isFinite(years) ||
      years <= 0
    ) {
      summaryEl.textContent = '入力値を確認してください。';
      summaryEl.style.color = 'var(--danger)';
      return;
    }

    summaryEl.style.color = 'var(--text-muted)';
    summaryEl.textContent = 'シミュレーションを実行中です...';

    const months = Math.round(years * 12);
    const lockedMonths = Math.max(0, Math.round(Math.min(lockedYears, years) * 12));

    setTimeout(() => {
      const pathsNormal = simulatePaths({
        initialAmount,
        monthlyContribution,
        monthlyWithdrawal,
        months,
        expectedReturnYearly,
        volatilityYearly,
        numPaths,
      });

      const pathsLocked =
        lockedInitial > 0 || lockedMonthly > 0
          ? simulatePaths({
              initialAmount: lockedInitial,
              monthlyContribution: lockedMonthly,
              monthlyWithdrawal: 0,
              months,
              expectedReturnYearly: lockedExpectedReturn,
              volatilityYearly: lockedVolatility,
              numPaths,
            })
          : Array.from({ length: numPaths }, () => new Array(months).fill(0));

      const combinedPaths = pathsNormal.map((path, idx) => {
        const locked = pathsLocked[idx];
        const combined = new Array(months);
        for (let t = 0; t < months; t++) {
          const lockedVal = t >= lockedMonths ? locked[t] ?? 0 : 0;
          combined[t] = (path[t] ?? 0) + lockedVal;
        }
        return combined;
      });

      const { median, p10, p90 } = summarize(combinedPaths);

      const detNormal = computeDeterministicPath({
        initialAmount,
        monthlyContribution,
        monthlyWithdrawal,
        months,
        expectedReturnYearly,
      });
      const detLocked =
        lockedInitial > 0 || lockedMonthly > 0
          ? computeDeterministicPath({
              initialAmount: lockedInitial,
              monthlyContribution: lockedMonthly,
              monthlyWithdrawal: 0,
              months,
              expectedReturnYearly: lockedExpectedReturn,
            })
          : new Array(months).fill(0);

      const deterministic = detNormal.map((v, t) => {
        const lockedVal = t >= lockedMonths ? detLocked[t] ?? 0 : 0;
        return v + lockedVal;
      });

      const finalValues = combinedPaths.map((p) => p[p.length - 1] ?? 0);
      const lastMedian = median[median.length - 1];
      const lastP10 = p10[p10.length - 1];
      const lastP90 = p90[p90.length - 1];

      const investedNormal = initialAmount + monthlyContribution * months - monthlyWithdrawal * months;
      const investedLocked = lockedInitial + lockedMonthly * lockedMonths;
      const investedTotal = investedNormal + investedLocked;

      summaryEl.innerHTML = `
        積立${years.toFixed(1)}年後の元本合計（積立−取り崩し後）は
        <strong>${formatCurrency(investedTotal)}</strong> です（うちロック口座分
        <strong>${formatCurrency(investedLocked)}</strong>）。<br />
        モンテカルロシミュレーション（${numPaths.toLocaleString('ja-JP')}パス）による最終資産額の分布は次の通りです：<br />
        10パーセンタイル：
        <strong>${formatCurrency(lastP10)}</strong> ／
        中央値：<strong>${formatCurrency(lastMedian)}</strong> ／
        90パーセンタイル：
        <strong>${formatCurrency(lastP90)}</strong>
      `;

      drawChart({ median, p10, p90, deterministic }, months);
      drawHistogram(computeHistogram(finalValues));
    }, 20);
  });
}

