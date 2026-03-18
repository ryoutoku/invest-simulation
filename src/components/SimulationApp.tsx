import { useEffect, useMemo, useRef, useState } from "react";
import * as d3 from "d3";
import {
  computeDeterministicPath,
  formatCurrency,
  simulatePaths,
  SimParams,
  summarizePaths,
} from "../lib/sim";

type ChartData = {
  median: number[];
  p10: number[];
  p30: number[];
  p70: number[];
  p90: number[];
  normalMedian: number[];
  lockedMedian: number[];
  nisaMedian: number[];
  deterministic: number[];
};

const INITIAL_PARAMS: SimParams = {
  initialAmount: 100,
  monthlyContribution: 5,
  monthlyWithdrawal: 0,
  months: 20 * 12,
  expectedReturnYearly: 5,
  volatilityYearly: 15,
  numPaths: 1000,
};

export default function SimulationApp() {
  const [params, setParams] = useState(INITIAL_PARAMS);
  const [chartData, setChartData] = useState<ChartData | null>(null);
  const [summary, setSummary] = useState<string>(
    "パラメータを入力して「シミュレーションを実行」を押してください。",
  );

  const chartRef = useRef<SVGSVGElement | null>(null);
  const histRef = useRef<SVGSVGElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const histTooltipRef = useRef<HTMLDivElement | null>(null);

  const months = useMemo(() => params.months, [params.months]);

  const drawChart = (data: ChartData) => {
    const svg = d3.select(chartRef.current);
    if (!svg.node()) return;

    const WIDTH = 800;
    const HEIGHT = 400;
    const PADDING_LEFT = 70;
    const PADDING_RIGHT = 20;
    const PADDING_TOP = 20;
    const PADDING_BOTTOM = 40;

    svg.selectAll("*").remove();

    svg
      .append("rect")
      .attr("x", 0)
      .attr("y", 0)
      .attr("width", WIDTH)
      .attr("height", HEIGHT)
      .attr("fill", "#ffffff");

    const all = [
      ...data.median,
      ...data.p10,
      ...data.p30,
      ...data.p70,
      ...data.p90,
      ...data.normalMedian,
      ...data.lockedMedian,
      ...data.nisaMedian,
      ...data.deterministic,
    ];

    const maxVal = Math.max(...all);
    const minVal = 0;

    const xScale = d3
      .scaleLinear()
      .domain([0, months - 1])
      .range([PADDING_LEFT, WIDTH - PADDING_RIGHT]);

    const yScale = d3
      .scaleLinear()
      .domain([minVal, maxVal])
      .nice()
      .range([HEIGHT - PADDING_BOTTOM, PADDING_TOP]);

    const xAxis = d3
      .axisBottom(xScale)
      .ticks(6)
      .tickFormat((d) => `${Math.round(((d as number) + 1) / 12)}y`);

    const yAxis = d3
      .axisLeft(yScale)
      .ticks(6)
      .tickFormat((d) => formatCurrency(d as number));

    svg
      .append("g")
      .attr("transform", `translate(0, ${HEIGHT - PADDING_BOTTOM})`)
      .call(xAxis)
      .call((g) => g.selectAll("text").attr("font-size", "10px"));

    svg
      .append("g")
      .attr("transform", `translate(${PADDING_LEFT}, 0)`)
      .call(yAxis)
      .call((g) => g.selectAll("text").attr("font-size", "10px"));

    const line = d3
      .line<number>()
      .x((_, i) => xScale(i))
      .y((value) => yScale(value))
      .curve(d3.curveMonotoneX);

    svg
      .append("path")
      .datum(data.deterministic)
      .attr("fill", "none")
      .attr("stroke", "#10b981")
      .attr("stroke-width", 2)
      .attr("d", line);

    const area = d3
      .area<number>()
      .x((_, i) => xScale(i))
      .y0((value, i) => yScale(data.p10[i]))
      .y1((value, i) => yScale(data.p90[i]))
      .curve(d3.curveMonotoneX);

    svg
      .append("path")
      .datum(data.median)
      .attr("fill", "url(#band)")
      .attr("d", area);

    svg
      .append("linearGradient")
      .attr("id", "band")
      .attr("x1", "0")
      .attr("y1", "0")
      .attr("x2", "0")
      .attr("y2", "1")
      .selectAll("stop")
      .data([
        { offset: "0%", color: "#4f46e5", opacity: 0.25 },
        { offset: "100%", color: "#4f46e5", opacity: 0.02 },
      ])
      .enter()
      .append("stop")
      .attr("offset", (d) => d.offset)
      .attr("stop-color", (d) => d.color)
      .attr("stop-opacity", (d) => d.opacity);

    svg
      .append("path")
      .datum(data.median)
      .attr("fill", "none")
      .attr("stroke", "#a5b4fc")
      .attr("stroke-width", 2)
      .attr("d", line);

    svg
      .append("path")
      .datum(data.normalMedian)
      .attr("fill", "none")
      .attr("stroke", "#6366f1")
      .attr("stroke-dasharray", "4 4")
      .attr("stroke-width", 2)
      .attr("d", line);

    svg
      .append("path")
      .datum(data.lockedMedian)
      .attr("fill", "none")
      .attr("stroke", "#f97373")
      .attr("stroke-width", 2)
      .attr("d", line);

    const tooltip = d3.select(tooltipRef.current);
    const overlay = svg
      .append("rect")
      .attr("x", PADDING_LEFT)
      .attr("y", PADDING_TOP)
      .attr("width", WIDTH - PADDING_LEFT - PADDING_RIGHT)
      .attr("height", HEIGHT - PADDING_TOP - PADDING_BOTTOM)
      .attr("fill", "transparent")
      .on("mousemove", function (event) {
        const [mouseX] = d3.pointer(event);
        const x = Math.max(PADDING_LEFT, Math.min(WIDTH - PADDING_RIGHT, mouseX));
        const index = Math.round(xScale.invert(x));

        const label = `Year ${Math.floor(index / 12)}`;
        const medianValue = data.median[index];

        tooltip
          .style("display", "block")
          .style("left", `${x + 10}px`)
          .style("top", `${yScale(medianValue) - 30}px`)
          .html(`<div class='text-xs font-semibold text-white'>${label}</div><div class='text-xs text-white'>中央値: ${formatCurrency(
            medianValue,
          )}</div>`);
      })
      .on("mouseout", () => {
        tooltip.style("display", "none");
      });

    return () => {
      overlay.remove();
    };
  };

  const drawHistogram = (paths: number[][]) => {
    const svg = d3.select(histRef.current);
    if (!svg.node()) return;

    svg.selectAll("*").remove();

    const values = paths.map((p) => p[p.length - 1]);
    const bins = d3.bin().thresholds(20)(values);

    const WIDTH = 800;
    const HEIGHT = 220;
    const PADDING_LEFT = 50;
    const PADDING_RIGHT = 20;
    const PADDING_TOP = 20;
    const PADDING_BOTTOM = 30;

    const xScale = d3
      .scaleLinear()
      .domain([bins[0]?.x0 ?? 0, bins[bins.length - 1]?.x1 ?? 0])
      .range([PADDING_LEFT, WIDTH - PADDING_RIGHT]);

    const yScale = d3
      .scaleLinear()
      .domain([0, d3.max(bins, (b) => b.length) ?? 0])
      .nice()
      .range([HEIGHT - PADDING_BOTTOM, PADDING_TOP]);

    const xAxis = d3
      .axisBottom(xScale)
      .ticks(6)
      .tickFormat((d) => formatCurrency(d as number));

    const yAxis = d3.axisLeft(yScale).ticks(4);

    svg
      .append("g")
      .attr("transform", `translate(0, ${HEIGHT - PADDING_BOTTOM})`)
      .call(xAxis)
      .call((g) => g.selectAll("text").attr("font-size", "10px"));

    svg
      .append("g")
      .attr("transform", `translate(${PADDING_LEFT}, 0)`)
      .call(yAxis)
      .call((g) => g.selectAll("text").attr("font-size", "10px"));

    svg
      .append("g")
      .attr("fill", "#4f46e5")
      .selectAll("rect")
      .data(bins)
      .enter()
      .append("rect")
      .attr("x", (d) => xScale(d.x0 ?? 0) + 1)
      .attr("y", (d) => yScale(d.length))
      .attr("width", (d) =>
        Math.max(0, xScale(d.x1 ?? 0) - xScale(d.x0 ?? 0) - 2),
      )
      .attr("height", (d) => HEIGHT - PADDING_BOTTOM - yScale(d.length));

    const tooltip = d3.select(histTooltipRef.current);

    svg
      .selectAll("rect")
      .on("mousemove", function (event, d) {
        const [mouseX, mouseY] = d3.pointer(event);
        tooltip
          .style("display", "block")
          .style("left", `${mouseX + 10}px`)
          .style("top", `${mouseY - 30}px`)
          .html(
            `<div class='text-xs font-semibold text-white'>${formatCurrency(
              d.x0 ?? 0,
            )}〜${formatCurrency(d.x1 ?? 0)}</div><div class='text-xs text-white'>件数: ${d.length}</div>`,
          );
      })
      .on("mouseout", () => {
        tooltip.style("display", "none");
      });
  };

  const runSim = () => {
    const normalPaths = simulatePaths(params);
    const lockedPaths = simulatePaths({
      ...params,
      monthlyContribution: 0,
      monthlyWithdrawal: 0,
      taxRate: 0,
    });

    const summaryData = summarizePaths(normalPaths);
    const lockedSummary = summarizePaths(lockedPaths);

    setChartData({
      ...summaryData,
      normalMedian: summaryData.median,
      lockedMedian: lockedSummary.median,
      nisaMedian: summaryData.median,
      deterministic: computeDeterministicPath({
        initialAmount: params.initialAmount,
        monthlyContribution: params.monthlyContribution,
        monthlyWithdrawal: params.monthlyWithdrawal,
        months: params.months,
        expectedReturnYearly: params.expectedReturnYearly,
      }),
    });

    setSummary(
      `中央値: ${formatCurrency(summaryData.median[summaryData.median.length - 1])} / ` +
        `10〜90パーセンタイル: ${formatCurrency(summaryData.p10[summaryData.p10.length - 1])} - ${formatCurrency(
          summaryData.p90[summaryData.p90.length - 1],
        )}`,
    );
  };

  useEffect(() => {
    if (!chartData) return;
    drawChart(chartData);
  }, [chartData, months]);

  useEffect(() => {
    if (!chartData) return;

    const normalPaths = simulatePaths(params);
    drawHistogram(normalPaths);
  }, [chartData, params]);

  return (
    <div className='space-y-8'>
      <div className='card p-6'>
        <div className='flex items-center justify-between mb-4'>
          <h2 className='text-lg font-semibold text-slate-900'>入力</h2>
          <span className='inline-flex items-center rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700 ring-1 ring-indigo-100'>
            高速シミュレーション
          </span>
        </div>

        <form
          className='space-y-6'
          onSubmit={(event) => {
            event.preventDefault();
            runSim();
          }}
        >
          <div className='rounded-xl border border-slate-200 bg-white/70 p-5 shadow-sm'>
            <div className='flex items-center justify-between mb-4'>
              <h3 className='text-sm font-semibold text-slate-800'>基本情報</h3>
              <span className='text-xs text-slate-500'>必須</span>
            </div>

            <div className='space-y-4'>
              <div className='grid grid-cols-1 gap-3 sm:grid-cols-[180px_1fr] sm:items-center'>
                <label htmlFor='initial-amount' className='text-sm font-medium text-slate-700'>
                  初期金額（万円）
                </label>
                <input
                  id='initial-amount'
                  type='number'
                  min={0}
                  step={1}
                  value={params.initialAmount}
                  onChange={(e) => setParams((p) => ({ ...p, initialAmount: Number(e.target.value) }))}
                  className='w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200'
                />
              </div>

              <div className='grid grid-cols-1 gap-3 sm:grid-cols-[180px_1fr] sm:items-center'>
                <label htmlFor='monthly-contribution' className='text-sm font-medium text-slate-700'>
                  毎月の積立金額（万円）
                </label>
                <input
                  id='monthly-contribution'
                  type='number'
                  min={0}
                  step={0.1}
                  value={params.monthlyContribution}
                  onChange={(e) =>
                    setParams((p) => ({ ...p, monthlyContribution: Number(e.target.value) }))
                  }
                  className='w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200'
                />
              </div>

              <div className='grid grid-cols-1 gap-3 sm:grid-cols-[180px_1fr] sm:items-center'>
                <label htmlFor='monthly-withdrawal' className='text-sm font-medium text-slate-700'>
                  毎月の取り崩し金額（万円・0で取り崩しなし）
                </label>
                <input
                  id='monthly-withdrawal'
                  type='number'
                  min={0}
                  step={0.1}
                  value={params.monthlyWithdrawal}
                  onChange={(e) =>
                    setParams((p) => ({ ...p, monthlyWithdrawal: Number(e.target.value) }))
                  }
                  className='w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200'
                />
              </div>

              <div className='grid grid-cols-1 gap-3 sm:grid-cols-[180px_1fr] sm:items-center'>
                <label htmlFor='years' className='text-sm font-medium text-slate-700'>
                  積立期間（年）
                </label>
                <input
                  id='years'
                  type='number'
                  min={1}
                  max={50}
                  step={1}
                  value={params.months / 12}
                  onChange={(e) =>
                    setParams((p) => ({
                      ...p,
                      months: Number(e.target.value) * 12,
                    }))
                  }
                  className='w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200'
                />
              </div>

            </div>
          </div>

          <div className='rounded-xl border border-slate-200 bg-white/70 p-5 shadow-sm'>
            <div className='flex items-center justify-between mb-4'>
              <h3 className='text-sm font-semibold text-slate-800'>想定リターン / ボラティリティ</h3>
              <span className='text-xs text-slate-500'>設定値</span>
            </div>

            <div className='grid gap-4 sm:grid-cols-2'>
              <div className='grid grid-cols-1 gap-3 sm:grid-cols-[160px_1fr] sm:items-center'>
                <label htmlFor='expected-return' className='text-sm font-medium text-slate-700'>
                  期待リターン（% / 年）
                </label>
                <input
                  id='expected-return'
                  type='number'
                  step={0.1}
                  value={params.expectedReturnYearly}
                  onChange={(e) =>
                    setParams((p) => ({ ...p, expectedReturnYearly: Number(e.target.value) }))
                  }
                  className='w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200'
                />
              </div>
              <div className='grid grid-cols-1 gap-3 sm:grid-cols-[160px_1fr] sm:items-center'>
                <label htmlFor='volatility' className='text-sm font-medium text-slate-700'>
                  ボラティリティ（% / 年）
                </label>
                <input
                  id='volatility'
                  type='number'
                  step={0.1}
                  value={params.volatilityYearly}
                  onChange={(e) =>
                    setParams((p) => ({ ...p, volatilityYearly: Number(e.target.value) }))
                  }
                  className='w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200'
                />
              </div>
            </div>
          </div>

          <div className='rounded-xl border border-slate-200 bg-white/70 p-5 shadow-sm'>
            <div className='flex items-center justify-between mb-4'>
              <h3 className='text-sm font-semibold text-slate-800'>ロック口座 (iDeCo 等)</h3>
              <span className='text-xs text-slate-500'>任意</span>
            </div>

            <div className='grid gap-4 sm:grid-cols-2'>
              <div className='grid grid-cols-1 gap-3 sm:grid-cols-[160px_1fr] sm:items-center'>
                <label htmlFor='locked-initial' className='text-sm font-medium text-slate-700'>
                  初期金額（万円）
                </label>
                <input
                  id='locked-initial'
                  type='number'
                  min={0}
                  step={1}
                  value={0}
                  onChange={() => {}}
                  className='w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200'
                />
              </div>
              <div className='grid grid-cols-1 gap-3 sm:grid-cols-[160px_1fr] sm:items-center'>
                <label htmlFor='locked-monthly' className='text-sm font-medium text-slate-700'>
                  毎月の積立金額（万円）
                </label>
                <input
                  id='locked-monthly'
                  type='number'
                  min={0}
                  step={0.1}
                  value={0}
                  onChange={() => {}}
                  className='w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200'
                />
              </div>
            </div>

            <div className='grid gap-4 sm:grid-cols-2 mt-4'>
              <div className='grid grid-cols-1 gap-3 sm:grid-cols-[160px_1fr] sm:items-center'>
                <label htmlFor='locked-years' className='text-sm font-medium text-slate-700'>
                  ロックされる年数
                </label>
                <input
                  id='locked-years'
                  type='number'
                  min={1}
                  max={60}
                  step={1}
                  value={0}
                  onChange={() => {}}
                  className='w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200'
                />
              </div>
              <div className='grid grid-cols-1 gap-3 sm:grid-cols-[160px_1fr] sm:items-center'>
                <label htmlFor='locked-expected-return' className='text-sm font-medium text-slate-700'>
                  期待リターン（% / 年）
                </label>
                <input
                  id='locked-expected-return'
                  type='number'
                  step={0.1}
                  value={0}
                  onChange={() => {}}
                  className='w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200'
                />
              </div>
            </div>

            <div className='grid grid-cols-1 gap-3 sm:grid-cols-[160px_1fr] sm:items-center mt-4'>
              <label htmlFor='locked-volatility' className='text-sm font-medium text-slate-700'>
                ボラティリティ（% / 年）
              </label>
              <input
                id='locked-volatility'
                type='number'
                step={0.1}
                value={0}
                onChange={() => {}}
                className='w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200'
              />
            </div>
          </div>

          <div className='rounded-xl border border-slate-200 bg-white/70 p-5 shadow-sm'>
            <div className='grid grid-cols-1 gap-3 sm:grid-cols-[180px_1fr] sm:items-center'>
              <label htmlFor='num-paths' className='text-sm font-medium text-slate-700'>
                シミュレーション回数
              </label>
              <input
                id='num-paths'
                type='number'
                min={100}
                max={5000}
                step={100}
                value={params.numPaths}
                onChange={(e) => setParams((p) => ({ ...p, numPaths: Number(e.target.value) }))}
                className='w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200'
              />
            </div>
          </div>

          <button
            type='submit'
            className='mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-indigo-600 to-indigo-500 px-5 py-2 text-sm font-semibold text-white shadow-lg transition hover:brightness-110 active:scale-95 sm:w-auto'
          >
            シミュレーションを実行
          </button>
        </form>
      </div>

      <div className='card p-6'>
        <div className='flex items-center justify-between mb-4'>
          <h2 className='text-lg font-semibold text-slate-900'>結果</h2>
          <span className='inline-flex items-center rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 ring-1 ring-emerald-100'>
            新しい予測を試す
          </span>
        </div>

        <p id='summary' className='text-sm text-slate-600 leading-relaxed mb-6'>
          {summary}
        </p>

        <div className='relative rounded-xl border border-slate-200 bg-white overflow-hidden mb-6'>
          <svg
            id='chart'
            ref={chartRef}
            viewBox='0 0 800 400'
            role='img'
            aria-label='投資シミュレーション結果の推移グラフ'
            className='w-full h-auto'
          />
          <div
            id='chart-tooltip'
            ref={tooltipRef}
            className='chart-tooltip'
            style={{ display: "none" }}
          />
        </div>

        <div className='flex flex-wrap gap-4 text-xs text-slate-600 mb-4'>
          <span className='inline-flex items-center gap-2'>
            <span className='h-2 w-7 rounded-full bg-indigo-200'></span>
            中央値
          </span>
          <span className='inline-flex items-center gap-2'>
            <span className='h-2 w-7 rounded-full bg-gradient-to-r from-indigo-600 to-indigo-400 opacity-70'></span>
            10〜90パーセンタイル
          </span>
          <span className='inline-flex items-center gap-2'>
            <span className='h-2 w-7 rounded-full bg-emerald-500'></span>
            理論値（ボラティリティなし）
          </span>
        </div>

        <h3 className='mt-6 mb-3 text-sm font-semibold text-slate-700'>
          最終時点の分布（ヒストグラム）
        </h3>
        <div className='relative rounded-xl border border-slate-200 bg-white overflow-hidden'>
          <svg
            id='histogram'
            ref={histRef}
            viewBox='0 0 800 220'
            role='img'
            aria-label='最終時点の資産額分布ヒストグラム'
            className='w-full h-auto'
          />
          <div
            id='hist-tooltip'
            ref={histTooltipRef}
            className='chart-tooltip'
            style={{ display: "none" }}
          />
        </div>
      </div>
    </div>
  );
}
