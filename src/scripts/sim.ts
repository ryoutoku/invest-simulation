/* eslint-disable */
import * as d3 from "d3";

const formEl = document.getElementById("sim-form") as HTMLFormElement | null;
const summaryElMaybe = document.getElementById(
  "summary",
) as HTMLParagraphElement | null;
const chartElMaybe = document.getElementById("chart") as SVGSVGElement | null;
const tooltipElMaybe = document.getElementById(
  "chart-tooltip",
) as HTMLDivElement | null;
const histElMaybe = document.getElementById(
  "histogram",
) as SVGSVGElement | null;
const histTooltipElMaybe = document.getElementById(
  "hist-tooltip",
) as HTMLDivElement | null;

if (
  !formEl ||
  !summaryElMaybe ||
  !chartElMaybe ||
  !tooltipElMaybe ||
  !histElMaybe ||
  !histTooltipElMaybe
) {
  console.warn(
    "必要な要素が見つからず、シミュレーションを初期化できませんでした。",
  );
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
    taxRate = 0,
  }: {
    initialAmount: number;
    monthlyContribution: number;
    monthlyWithdrawal: number;
    months: number;
    expectedReturnYearly: number;
    volatilityYearly: number;
    numPaths: number;
    taxRate?: number;
  }) {
    const muYearlyDec = expectedReturnYearly / 100;
    const sigmaYearlyDec = volatilityYearly / 100;
    const dt = 1 / 12;
    // 税引き後リターン = (1 + mu) * (1 - taxRate) - 1
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

  function summarize(paths: number[][]) {
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

  function computeDeterministicPath({
    initialAmount,
    monthlyContribution,
    monthlyWithdrawal,
    months,
    expectedReturnYearly,
    taxRate = 0,
  }: {
    initialAmount: number;
    monthlyContribution: number;
    monthlyWithdrawal: number;
    months: number;
    expectedReturnYearly: number;
    taxRate?: number;
  }) {
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

  function formatCurrency(value: number) {
    return value.toLocaleString("ja-JP", {
      style: "currency",
      currency: "JPY",
      maximumFractionDigits: 0,
    });
  }

  function clearChart() {
    d3.select(chartEl).selectAll("*").remove();
  }

  function clearHistogram() {
    d3.select(histEl).selectAll("*").remove();
  }

  const chartState: {
    summaryData: null | {
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
    summaryData: {
      median: number[];
      p10: number[];
      p30: number[];
      p70: number[];
      p90: number[];
      normalMedian: number[];
      lockedMedian: number[];
      nisaMedian: number[];
      deterministic?: number[];
    },
    months: number,
  ) {
    clearChart();

    const svg = d3.select(chartEl);

    // Background
    svg
      .append("rect")
      .attr("x", 0)
      .attr("y", 0)
      .attr("width", WIDTH)
      .attr("height", HEIGHT)
      .attr("fill", "#ffffff");

    const {
      median,
      p10,
      p30,
      p70,
      p90,
      normalMedian,
      lockedMedian,
      nisaMedian,
      deterministic,
    } = summaryData;
    const all = [
      ...median,
      ...p10,
      ...p30,
      ...p70,
      ...p90,
      ...normalMedian,
      ...lockedMedian,
      ...nisaMedian,
      ...(deterministic ?? []),
    ];
    const maxVal = Math.max(...all);
    const minVal = 0;

    chartState.summaryData = summaryData;
    chartState.months = months;
    chartState.maxVal = maxVal;
    chartState.minVal = minVal;

    const innerWidth = WIDTH - PADDING_LEFT - PADDING_RIGHT;
    const innerHeight = HEIGHT - PADDING_TOP - PADDING_BOTTOM;

    const xScale = (i: number) =>
      PADDING_LEFT + (innerWidth * i) / (months - 1 || 1);
    const yScale = (v: number) =>
      PADDING_TOP + innerHeight * (1 - (v - minVal) / (maxVal - minVal || 1));

    // Grid
    const gridGroup = svg.append("g");

    const yTicks = 4;
    for (let i = 0; i <= yTicks; i++) {
      const t = i / yTicks;
      const value = minVal + (maxVal - minVal) * (1 - t);
      const y = PADDING_TOP + innerHeight * t;

      gridGroup
        .append("line")
        .attr("x1", PADDING_LEFT)
        .attr("x2", WIDTH - PADDING_RIGHT)
        .attr("y1", y)
        .attr("y2", y)
        .attr("stroke", "rgba(209,213,219,0.9)")
        .attr("stroke-width", 1)
        .attr("stroke-dasharray", "2 3");

      gridGroup
        .append("text")
        .attr("x", PADDING_LEFT - 8)
        .attr("y", y + 4)
        .attr("text-anchor", "end")
        .attr("fill", "#6b7280")
        .attr("font-size", 10)
        .text(formatCurrency(value));
    }

    const yearStep = months / 12 > 25 ? 5 : months / 12 > 10 ? 2 : 1;
    for (let year = 0; year <= months / 12; year += yearStep) {
      const m = year * 12;
      const x = xScale(Math.min(m, months - 1));

      gridGroup
        .append("line")
        .attr("x1", x)
        .attr("x2", x)
        .attr("y1", PADDING_TOP)
        .attr("y2", HEIGHT - PADDING_BOTTOM)
        .attr("stroke", "rgba(156,163,175,0.8)")
        .attr("stroke-width", 1)
        .attr("stroke-dasharray", "2 3");

      gridGroup
        .append("text")
        .attr("x", x)
        .attr("y", HEIGHT - PADDING_BOTTOM + 18)
        .attr("text-anchor", "middle")
        .attr("fill", "#6b7280")
        .attr("font-size", 10)
        .text(`${year}年`);
    }

    // Draw 10-90 percentile band (lighter)
    const band90Data = [];
    for (let i = 0; i < months; i++) {
      band90Data.push({ x: xScale(i), y: yScale(p90[i]) });
    }
    for (let i = months - 1; i >= 0; i--) {
      band90Data.push({ x: xScale(i), y: yScale(p10[i]) });
    }
    const band90Path = d3
      .line<{ x: number; y: number }>()
      .x((d) => d.x)
      .y((d) => d.y)
      .curve(d3.curveLinearClosed);
    svg
      .append("path")
      .attr("d", band90Path(band90Data))
      .attr("fill", "rgba(191, 219, 254, 0.4)")
      .attr("stroke", "none");

    // Draw 30-70 percentile band (darker)
    const band70Data = [];
    for (let i = 0; i < months; i++) {
      band70Data.push({ x: xScale(i), y: yScale(p70[i]) });
    }
    for (let i = months - 1; i >= 0; i--) {
      band70Data.push({ x: xScale(i), y: yScale(p30[i]) });
    }
    const band70Path = d3
      .line<{ x: number; y: number }>()
      .x((d) => d.x)
      .y((d) => d.y)
      .curve(d3.curveLinearClosed);
    svg
      .append("path")
      .attr("d", band70Path(band70Data))
      .attr("fill", "rgba(191, 219, 254, 0.7)")
      .attr("stroke", "none");

    // Median line
    const medianData = median.map((v, i) => ({ x: xScale(i), y: yScale(v) }));
    const medianLine = d3
      .line<{ x: number; y: number }>()
      .x((d) => d.x)
      .y((d) => d.y);
    svg
      .append("path")
      .attr("d", medianLine(medianData))
      .attr("fill", "none")
      .attr("stroke", "#1d4ed8")
      .attr("stroke-width", 2.5);

    // Normal account median
    const normalData = normalMedian.map((v, i) => ({
      x: xScale(i),
      y: yScale(v),
    }));
    const normalLine = d3
      .line<{ x: number; y: number }>()
      .x((d) => d.x)
      .y((d) => d.y);
    svg
      .append("path")
      .attr("d", normalLine(normalData))
      .attr("fill", "none")
      .attr("stroke", "#3b82f6")
      .attr("stroke-width", 1.5)
      .attr("stroke-dasharray", "5 3");

    // Locked account median
    const lockedData = lockedMedian.map((v, i) => ({
      x: xScale(i),
      y: yScale(v),
    }));
    const lockedLine = d3
      .line<{ x: number; y: number }>()
      .x((d) => d.x)
      .y((d) => d.y);
    svg
      .append("path")
      .attr("d", lockedLine(lockedData))
      .attr("fill", "none")
      .attr("stroke", "#10b981")
      .attr("stroke-width", 1.5)
      .attr("stroke-dasharray", "5 3");

    // NISA account median
    const nisaData = nisaMedian.map((v, i) => ({ x: xScale(i), y: yScale(v) }));
    const nisaLine = d3
      .line<{ x: number; y: number }>()
      .x((d) => d.x)
      .y((d) => d.y);
    svg
      .append("path")
      .attr("d", nisaLine(nisaData))
      .attr("fill", "none")
      .attr("stroke", "#8b5cf6")
      .attr("stroke-width", 1.5)
      .attr("stroke-dasharray", "5 3");

    if (deterministic && deterministic.length === months) {
      const detData = deterministic.map((v, i) => ({
        x: xScale(i),
        y: yScale(v),
      }));
      const detLine = d3
        .line<{ x: number; y: number }>()
        .x((d) => d.x)
        .y((d) => d.y);
      svg
        .append("path")
        .attr("d", detLine(detData))
        .attr("fill", "none")
        .attr("stroke", "#10b981")
        .attr("stroke-width", 1.8)
        .attr("stroke-dasharray", "6 3");
    }

    // Cursor line
    const cursorLine = svg
      .append("line")
      .attr("x1", PADDING_LEFT)
      .attr("x2", PADDING_LEFT)
      .attr("y1", PADDING_TOP)
      .attr("y2", HEIGHT - PADDING_BOTTOM)
      .attr("stroke", "#f97316")
      .attr("stroke-width", 1.5)
      .attr("stroke-dasharray", "4 3")
      .attr("opacity", 0);

    // Cursor dot
    const cursorDot = svg
      .append("circle")
      .attr("cx", PADDING_LEFT)
      .attr("cy", HEIGHT - PADDING_BOTTOM)
      .attr("r", 4)
      .attr("fill", "#ef4444")
      .attr("stroke", "#ffffff")
      .attr("stroke-width", 1.5)
      .attr("opacity", 0);

    chartState.cursorLine = cursorLine.node() as SVGLineElement;
    chartState.cursorDot = cursorDot.node() as SVGCircleElement;
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

    const clampedSvgX = Math.min(
      Math.max(svgX, PADDING_LEFT),
      WIDTH - PADDING_RIGHT,
    );
    const ratio =
      innerWidth === 0 ? 0 : (clampedSvgX - PADDING_LEFT) / innerWidth;
    const idx = Math.round(ratio * (chartState.months - 1 || 1));

    const year = (idx / 12).toFixed(1);
    const {
      median,
      p10,
      p30,
      p70,
      p90,
      normalMedian,
      lockedMedian,
      nisaMedian,
      deterministic,
    } = chartState.summaryData;
    const vMedian = median[idx];
    const vP10 = p10[idx];
    const vP30 = p30[idx];
    const vP70 = p70[idx];
    const vP90 = p90[idx];
    const vNormal = normalMedian[idx];
    const vLocked = lockedMedian[idx];
    const vNisa = nisaMedian[idx];
    const vDet =
      deterministic && deterministic[idx] != null ? deterministic[idx] : null;

    const maxVal = chartState.maxVal;
    const minVal = chartState.minVal;

    const xPlot =
      PADDING_LEFT + innerWidth * (idx / (chartState.months - 1 || 1));
    const yPlot =
      PADDING_TOP +
      innerHeight * (1 - (vMedian - minVal) / (maxVal - minVal || 1));

    if (chartState.cursorLine && chartState.cursorDot) {
      chartState.cursorLine.setAttribute("x1", xPlot.toString());
      chartState.cursorLine.setAttribute("x2", xPlot.toString());
      chartState.cursorLine.setAttribute("opacity", "1");

      chartState.cursorDot.setAttribute("cx", xPlot.toString());
      chartState.cursorDot.setAttribute("cy", yPlot.toString());
      chartState.cursorDot.setAttribute("opacity", "1");
    }

    tooltipEl.hidden = false;
    // ツールチップをグラフからはみ出して右上に表示
    const tooltipX = localX + 20;
    const tooltipY = localY - 40;
    tooltipEl.style.left = `${tooltipX}px`;
    tooltipEl.style.top = `${tooltipY}px`;

    let html = `
      <div>${year}年目（${idx}ヶ月）</div>
      <div>中央値: <strong>${formatCurrency(vMedian)}</strong></div>
      <div>30〜70%: ${formatCurrency(vP30)}〜${formatCurrency(vP70)}</div>
      <div>10〜90%: ${formatCurrency(vP10)}〜${formatCurrency(vP90)}</div>
      <div>基本口座: <strong>${formatCurrency(vNormal)}</strong></div>
      <div>iDeCo口座: <strong>${formatCurrency(vLocked)}</strong></div>
      <div>NISA口座: <strong>${formatCurrency(vNisa)}</strong></div>
    `;
    if (vDet != null) {
      html += `<div>理論値: <strong>${formatCurrency(vDet)}</strong></div>`;
    }
    tooltipEl.innerHTML = html;
  }

  chartEl.addEventListener("mousemove", (event) => {
    updateTooltipFromEvent(event);
  });

  chartEl.addEventListener("mouseleave", () => {
    tooltipEl.hidden = true;
    if (chartState.cursorLine && chartState.cursorDot) {
      chartState.cursorLine.setAttribute("opacity", "0");
      chartState.cursorDot.setAttribute("opacity", "0");
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
      const idx =
        v === max
          ? bucketCount - 1
          : Math.floor(((v - min) / (max - min)) * bucketCount);
      buckets[idx].count++;
    }

    return buckets;
  }

  const histState = {
    buckets: [] as { start: number; end: number; count: number }[],
    totalCount: 0,
  };

  function drawHistogram(
    buckets: { start: number; end: number; count: number }[],
  ) {
    clearHistogram();

    const svg = d3.select(histEl);

    const WIDTH_H = 800;
    const HEIGHT_H = 220;
    const PAD_L = 70;
    const PAD_R = 20;
    const PAD_T = 20;
    const PAD_B = 40;

    // Background
    svg
      .append("rect")
      .attr("x", 0)
      .attr("y", 0)
      .attr("width", WIDTH_H)
      .attr("height", HEIGHT_H)
      .attr("fill", "#ffffff");

    if (!buckets.length) {
      return;
    }

    histState.buckets = buckets;
    histState.totalCount = buckets.reduce((sum, b) => sum + b.count, 0);

    const innerWidth = WIDTH_H - PAD_L - PAD_R;
    const innerHeight = HEIGHT_H - PAD_T - PAD_B;
    const maxCount = Math.max(...buckets.map((b) => b.count));

    // X-axis
    svg
      .append("line")
      .attr("x1", PAD_L)
      .attr("x2", WIDTH_H - PAD_R)
      .attr("y1", HEIGHT_H - PAD_B)
      .attr("y2", HEIGHT_H - PAD_B)
      .attr("stroke", "#d1d5db")
      .attr("stroke-width", 1);

    const barWidth = innerWidth / buckets.length;

    // Bars
    buckets.forEach((b, i) => {
      const barHeight = maxCount === 0 ? 0 : (innerHeight * b.count) / maxCount;
      const x = PAD_L + barWidth * i;
      const y = HEIGHT_H - PAD_B - barHeight;

      svg
        .append("rect")
        .attr("x", x)
        .attr("y", y)
        .attr("width", Math.max(barWidth - 2, 1))
        .attr("height", barHeight)
        .attr("fill", "#bfdbfe");
    });

    const min = buckets[0].start;
    const max = buckets[buckets.length - 1].end;

    // Labels
    svg
      .append("text")
      .attr("x", PAD_L)
      .attr("y", HEIGHT_H - PAD_B + 24)
      .attr("text-anchor", "start")
      .attr("fill", "#6b7280")
      .attr("font-size", 10)
      .text(formatCurrency(min));

    svg
      .append("text")
      .attr("x", WIDTH_H - PAD_R)
      .attr("y", HEIGHT_H - PAD_B + 24)
      .attr("text-anchor", "end")
      .attr("fill", "#6b7280")
      .attr("font-size", 10)
      .text(formatCurrency(max));
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

    if (
      svgX < PAD_L ||
      svgX > WIDTH_H - PAD_R ||
      svgY < PAD_T ||
      svgY > HEIGHT_H - PAD_B
    ) {
      histTooltipEl.hidden = true;
      return;
    }

    const ratio = (svgX - PAD_L) / innerWidth;
    const idx = Math.min(
      histState.buckets.length - 1,
      Math.max(0, Math.floor(ratio * histState.buckets.length)),
    );
    const bucket = histState.buckets[idx];

    const percent = (bucket.count / histState.totalCount) * 100;

    histTooltipEl.hidden = false;
    // ツールチップをグラフからはみ出して右上に表示
    const tooltipX = localX + 20;
    const tooltipY = localY - 40;
    histTooltipEl.style.left = `${tooltipX}px`;
    histTooltipEl.style.top = `${tooltipY}px`;
    histTooltipEl.innerHTML = `
      <div>範囲: <strong>${formatCurrency(bucket.start)}〜${formatCurrency(bucket.end)}</strong></div>
      <div>本数: ${bucket.count}本（${percent.toFixed(1)}%）</div>
    `;
  }

  histEl.addEventListener("mousemove", (event) => {
    updateHistTooltip(event);
  });

  histEl.addEventListener("mouseleave", () => {
    histTooltipEl.hidden = true;
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();

    const yenPerMan = 10_000;
    const initialAmount =
      Number(
        (document.getElementById("initial-amount") as HTMLInputElement).value,
      ) * yenPerMan;
    const monthlyContribution =
      Number(
        (document.getElementById("monthly-contribution") as HTMLInputElement)
          .value,
      ) * yenPerMan;
    const monthlyWithdrawal =
      Number(
        (document.getElementById("monthly-withdrawal") as HTMLInputElement)
          .value,
      ) * yenPerMan;
    const years = Number(
      (document.getElementById("years") as HTMLInputElement).value,
    );
    const expectedReturnYearly = Number(
      (document.getElementById("expected-return") as HTMLInputElement).value,
    );
    const volatilityYearly = Number(
      (document.getElementById("volatility") as HTMLInputElement).value,
    );
    const numPaths = Number(
      (document.getElementById("num-paths") as HTMLInputElement).value,
    );

    const lockedInitial =
      Number(
        (document.getElementById("locked-initial") as HTMLInputElement).value,
      ) * yenPerMan;
    const lockedMonthly =
      Number(
        (document.getElementById("locked-monthly") as HTMLInputElement).value,
      ) * yenPerMan;
    const lockedYears = Number(
      (document.getElementById("locked-years") as HTMLInputElement).value,
    );
    const lockedExpectedReturn = Number(
      (document.getElementById("locked-expected-return") as HTMLInputElement)
        .value,
    );
    const lockedVolatility = Number(
      (document.getElementById("locked-volatility") as HTMLInputElement).value,
    );

    const nisaInitial =
      Number(
        (document.getElementById("nisa-initial") as HTMLInputElement).value,
      ) * yenPerMan;
    const nisaMonthly =
      Number(
        (document.getElementById("nisa-monthly") as HTMLInputElement).value,
      ) * yenPerMan;
    const nisaWithdrawal =
      Number(
        (document.getElementById("nisa-withdrawal") as HTMLInputElement).value,
      ) * yenPerMan;
    const nisaExpectedReturn = Number(
      (document.getElementById("nisa-expected-return") as HTMLInputElement)
        .value,
    );
    const nisaVolatility = Number(
      (document.getElementById("nisa-volatility") as HTMLInputElement).value,
    );

    if (
      !Number.isFinite(initialAmount) ||
      !Number.isFinite(monthlyContribution) ||
      !Number.isFinite(monthlyWithdrawal) ||
      !Number.isFinite(lockedInitial) ||
      !Number.isFinite(lockedMonthly) ||
      !Number.isFinite(lockedYears) ||
      !Number.isFinite(nisaInitial) ||
      !Number.isFinite(nisaMonthly) ||
      !Number.isFinite(nisaWithdrawal) ||
      !Number.isFinite(years) ||
      years <= 0
    ) {
      summaryEl.textContent = "入力値を確認してください。";
      summaryEl.style.color = "var(--danger)";
      return;
    }

    summaryEl.style.color = "var(--text-muted)";
    summaryEl.textContent = "シミュレーションを実行中です...";

    const months = Math.round(years * 12);
    const lockedMonths = Math.max(
      0,
      Math.round(Math.min(lockedYears, years) * 12),
    );

    setTimeout(() => {
      const pathsNormal = simulatePaths({
        initialAmount,
        monthlyContribution,
        monthlyWithdrawal,
        months,
        expectedReturnYearly,
        volatilityYearly,
        numPaths,
        taxRate: 0.20315, // 基本口座は課税
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
              taxRate: 0, // 非課税
            })
          : Array.from({ length: numPaths }, () => new Array(months).fill(0));

      const pathsNisa =
        nisaInitial > 0 || nisaMonthly > 0
          ? simulatePaths({
              initialAmount: nisaInitial,
              monthlyContribution: nisaMonthly,
              monthlyWithdrawal: nisaWithdrawal,
              months,
              expectedReturnYearly: nisaExpectedReturn,
              volatilityYearly: nisaVolatility,
              numPaths,
              taxRate: 0, // 非課税
            })
          : Array.from({ length: numPaths }, () => new Array(months).fill(0));

      const combinedPaths = pathsNormal.map((path, idx) => {
        const locked = pathsLocked[idx];
        const nisa = pathsNisa[idx];
        const combined = new Array(months);
        for (let t = 0; t < months; t++) {
          const lockedVal = t >= lockedMonths ? (locked[t] ?? 0) : 0;
          const nisaVal = nisa[t] ?? 0;
          combined[t] = (path[t] ?? 0) + lockedVal + nisaVal;
        }
        return combined;
      });

      const { median, p10, p30, p70, p90 } = summarize(combinedPaths);

      const normalSummary = summarize(pathsNormal);
      const lockedSummary = summarize(pathsLocked);
      const nisaSummary = summarize(pathsNisa);

      const detNormal = computeDeterministicPath({
        initialAmount,
        monthlyContribution,
        monthlyWithdrawal,
        months,
        expectedReturnYearly,
        taxRate: 0.20315, // 基本口座は課税
      });
      const detLocked =
        lockedInitial > 0 || lockedMonthly > 0
          ? computeDeterministicPath({
              initialAmount: lockedInitial,
              monthlyContribution: lockedMonthly,
              monthlyWithdrawal: 0,
              months,
              expectedReturnYearly: lockedExpectedReturn,
              taxRate: 0, // 非課税
            })
          : new Array(months).fill(0);

      const detNisa =
        nisaInitial > 0 || nisaMonthly > 0
          ? computeDeterministicPath({
              initialAmount: nisaInitial,
              monthlyContribution: nisaMonthly,
              monthlyWithdrawal: nisaWithdrawal,
              months,
              expectedReturnYearly: nisaExpectedReturn,
              taxRate: 0, // 非課税
            })
          : new Array(months).fill(0);

      const deterministic = detNormal.map((v, t) => {
        const lockedVal = t >= lockedMonths ? (detLocked[t] ?? 0) : 0;
        const nisaVal = detNisa[t] ?? 0;
        return v + lockedVal + nisaVal;
      });

      const finalValues = combinedPaths.map((p) => p[p.length - 1] ?? 0);
      const lastMedian = median[median.length - 1];
      const lastP10 = p10[p10.length - 1];
      const lastP30 = p30[p30.length - 1];
      const lastP70 = p70[p70.length - 1];
      const lastP90 = p90[p90.length - 1];

      const investedNormal =
        initialAmount +
        monthlyContribution * months -
        monthlyWithdrawal * months;
      const investedLocked = lockedInitial + lockedMonthly * lockedMonths;
      const investedNisa =
        nisaInitial + nisaMonthly * months - nisaWithdrawal * months;
      const investedTotal = investedNormal + investedLocked + investedNisa;

      summaryEl.innerHTML = `
        積立${years.toFixed(1)}年後の元本合計（積立−取り崩し後）は
        <strong>${formatCurrency(investedTotal)}</strong> です（うちロック口座分
        <strong>${formatCurrency(investedLocked)}</strong>、NISA口座分
        <strong>${formatCurrency(investedNisa)}</strong>）。<br />
        モンテカルロシミュレーション（${numPaths.toLocaleString("ja-JP")}パス）による最終資産額の分布は次の通りです：<br />
        10パーセンタイル：
        <strong>${formatCurrency(lastP10)}</strong> ／
        30パーセンタイル：
        <strong>${formatCurrency(lastP30)}</strong> ／
        中央値：<strong>${formatCurrency(lastMedian)}</strong> ／
        70パーセンタイル：
        <strong>${formatCurrency(lastP70)}</strong> ／
        90パーセンタイル：
        <strong>${formatCurrency(lastP90)}</strong>
      `;

      drawChart(
        {
          median,
          p10,
          p30,
          p70,
          p90,
          normalMedian: normalSummary.median,
          lockedMedian: lockedSummary.median,
          nisaMedian: nisaSummary.median,
          deterministic,
        },
        months,
      );
      drawHistogram(computeHistogram(finalValues));
    }, 20);
  });
}
