import React, { useState } from 'react';
import { useCharter } from '../../context/CharterContext';
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { IconChip } from '../common/IconChip';
import { StatusBadge } from '../common/StatusBadge';
import { formatFreightRate } from '../../utils/currency';
import {
  TrendingUp,
  Sparkles,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  History,
} from 'lucide-react';

export const FreightForecastView: React.FC = () => {
  const {
    forecast,
    forecastHorizon,
    setForecastHorizon,
    optimalWindow,
    cargoRequest,
    currencyUnit,
  } = useCharter();

  const [activeChartMode, setActiveChartMode] = useState<'forecast' | 'historical_bdi'>('forecast');
  const horizons: (7 | 14 | 30 | 60)[] = [7, 14, 30, 60];

  // Format genuine model-derived forecast data
  const forecastChartData = forecast.dataPoints.map((dp) => ({
    date: dp.date.length >= 10 ? dp.date.slice(5) : dp.date, // MM-DD
    fullDate: dp.date,
    predicted: dp.predicted,
    lower: dp.lowerBound,
    upper: dp.upperBound,
    dayIndex: dp.dayIndex,
  }));

  // Format real monthly Baltic Dry Index historical observations
  const historicalBdiData = (forecast.historicalBdi || []).map((pt) => ({
    date: pt.date.length >= 7 ? pt.date.slice(0, 7) : pt.date, // YYYY-MM
    fullDate: pt.date,
    bdi: pt.bdi,
  }));

  // Calculate grounded Y-Axis domain with margin
  const allForecastValues = forecast.dataPoints
    .flatMap((d) => [d.predicted, d.lowerBound, d.upperBound])
    .filter((v): v is number => typeof v === 'number' && !isNaN(v));
  const minForecastVal = Math.max(0, Math.floor((allForecastValues.length ? Math.min(...allForecastValues) : forecast.currentRate) * 0.85));
  const maxForecastVal = Math.ceil((allForecastValues.length ? Math.max(...allForecastValues) : forecast.currentRate) * 1.15);

  const bdiValues = (forecast.historicalBdi || []).map((d) => d.bdi).filter((v): v is number => typeof v === 'number' && !isNaN(v));
  const minBdiVal = bdiValues.length > 0 ? Math.max(0, Math.floor(Math.min(...bdiValues) * 0.85)) : 500;
  const maxBdiVal = bdiValues.length > 0 ? Math.ceil(Math.max(...bdiValues) * 1.15) : 3000;

  // Custom Axis Tick components with solid backing chips for maximum legibility
  const CustomYAxisTick = ({ x, y, payload }: any) => {
    let text = '';
    if (activeChartMode === 'historical_bdi') {
      text = `${Math.round(payload.value).toLocaleString()} pts`;
    } else {
      text = currencyUnit === 'INR' ? `₹${Math.round(payload.value * 83.5)}` : `$${Number(payload.value).toFixed(1)}`;
    }
    return (
      <g transform={`translate(${x},${y})`}>
        <rect x={-54} y={-9} width={50} height={18} rx={4} fill="#F8FAFC" stroke="#CBD5E1" strokeWidth={1} />
        <text x={-29} y={4} textAnchor="middle" fill="#101828" fontSize={10} fontWeight={600} fontFamily="JetBrains Mono, monospace">
          {text}
        </text>
      </g>
    );
  };

  const CustomXAxisTick = ({ x, y, payload }: any) => {
    return (
      <g transform={`translate(${x},${y})`}>
        <rect x={-24} y={4} width={48} height={18} rx={4} fill="#F8FAFC" stroke="#CBD5E1" strokeWidth={1} />
        <text x={0} y={17} textAnchor="middle" fill="#101828" fontSize={10} fontWeight={600} fontFamily="JetBrains Mono, monospace">
          {payload.value}
        </text>
      </g>
    );
  };

  const customTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      if (data.bdi !== undefined) {
        return (
          <div className="bg-[#101828] text-white p-3 rounded-xl shadow-lg border border-slate-700 text-xs font-mono-data">
            <div className="font-bold text-[#38BDF8] mb-1">Month: {data.fullDate || label}</div>
            <div className="text-white font-semibold flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#38BDF8]"></span>
              <span>Baltic Dry Index: {Number(data.bdi).toLocaleString()} pts</span>
            </div>
            <div className="text-[#94A3B8] text-[11px] mt-0.5">
              Real Baltic Exchange monthly macro data
            </div>
          </div>
        );
      }
      return (
        <div className="bg-[#101828] text-white p-3 rounded-xl shadow-lg border border-slate-700 text-xs font-mono-data">
          <div className="font-bold text-[#0EA5E9] mb-1">Date: {data.fullDate || label} (Day +{data.dayIndex})</div>
          {data.predicted !== null && (
            <div className="text-[#0EA5E9] font-bold flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#0EA5E9]"></span>
              <span>AI Projected Rate: {formatFreightRate(data.predicted, currencyUnit)}</span>
            </div>
          )}
          {data.lower !== null && data.upper !== null && (
            <div className="text-[#94A3B8] text-[11px] mt-0.5">
              90% Confidence Interval: {formatFreightRate(data.lower, currencyUnit, { showSlashMT: false })} – {formatFreightRate(data.upper, currencyUnit)}
            </div>
          )}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* OPTIMAL CHARTERING WINDOW HERO CARD */}
      <div className="relative rounded-[20px] bg-white p-5 sm:p-6 shadow-sm border border-slate-200/80 overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <IconChip icon={<Clock className="w-4 h-4" />} color="teal" size="sm" />
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#2B3342] font-mono-data">
                Optimal Chartering Window
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              <StatusBadge
                label={optimalWindow.recommendation}
                variant={
                  optimalWindow.recommendation === 'Charter Now'
                    ? 'success'
                    : optimalWindow.recommendation === 'Wait'
                    ? 'warning'
                    : 'danger'
                }
                size="md"
                pulse={optimalWindow.recommendation === 'Charter Now'}
              />
              <span className="text-xs font-semibold text-[#101828] bg-slate-100 border border-slate-200/80 px-2.5 py-0.5 rounded-md font-mono-data">
                Suggested Window: {optimalWindow.bestWindowStart} – {optimalWindow.bestWindowEnd}
              </span>
            </div>
            <p className="text-xs sm:text-sm text-[#2B3342] leading-snug max-w-3xl font-sans">
              {optimalWindow.tradeOffSentence}
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-[#12883E]/15 border border-[#12883E]/30 shrink-0 text-right min-w-[180px]">
            <div className="text-[10px] font-bold text-[#12883E] uppercase tracking-wider font-mono-data">
              {optimalWindow.recommendation === 'Wait' ? 'Potential Freight Saving' : 'Escalation Avoided'}
            </div>
            <div className="text-xl sm:text-2xl font-bold text-[#12883E] font-mono-data mt-0.5">
              {currencyUnit === 'INR' ? (
                <>₹{optimalWindow.potentialSavingsLakhs} <span className="text-xs font-semibold">Lakhs</span></>
              ) : (
                <>${Math.round(optimalWindow.potentialSavingsUSD).toLocaleString()} <span className="text-xs font-semibold">USD</span></>
              )}
            </div>
            <div className="text-[10px] text-[#12883E] font-mono-data font-medium">
              {currencyUnit === 'INR' ? (
                `~$${Math.round(optimalWindow.potentialSavingsUSD).toLocaleString()} USD on ${cargoRequest.cargoQuantity.toLocaleString()} MT`
              ) : (
                `~₹${optimalWindow.potentialSavingsLakhs} Lakhs on ${cargoRequest.cargoQuantity.toLocaleString()} MT`
              )}
            </div>
          </div>
        </div>
      </div>

      {/* MAIN FORECAST CHART CARD */}
      <div className="rounded-[20px] bg-white p-5 sm:p-7 shadow-sm border border-slate-200/80">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-slate-200/80">
          <div>
            <div className="flex items-center gap-2">
              <IconChip icon={<TrendingUp className="w-4 h-4" />} color="blue" size="sm" />
              <h2 className="text-lg sm:text-xl font-bold font-heading text-[#101828] tracking-tight">
                {activeChartMode === 'forecast' ? `Freight Trajectory Forecast: ${forecast.route}` : `Historical Baltic Dry Index (Real Monthly BDI)`}
              </h2>
            </div>
            <p className="text-xs text-[#2B3342] mt-1 font-sans">
              {activeChartMode === 'forecast'
                ? `Genuine ML Ridge Regression projections with 90% confidence corridor for ${cargoRequest.origin} → ${cargoRequest.destinationPort}`
                : `Actual monthly Baltic Dry Index observations loaded from Baltic Exchange records`}
            </p>
          </div>

          {/* Controls: Chart Mode Switch + Horizon Segmented Control */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200/80 shrink-0">
              <button
                onClick={() => setActiveChartMode('forecast')}
                className={`px-3 py-1 rounded-lg text-xs font-bold font-mono-data transition-all cursor-pointer flex items-center gap-1.5 ${
                  activeChartMode === 'forecast'
                    ? 'bg-[#101828] text-white shadow-xs'
                    : 'text-[#2B3342] hover:text-[#101828] hover:bg-white'
                }`}
              >
                <TrendingUp className="w-3.5 h-3.5" />
                <span>AI Forecast</span>
              </button>
              <button
                onClick={() => setActiveChartMode('historical_bdi')}
                className={`px-3 py-1 rounded-lg text-xs font-bold font-mono-data transition-all cursor-pointer flex items-center gap-1.5 ${
                  activeChartMode === 'historical_bdi'
                    ? 'bg-[#101828] text-white shadow-xs'
                    : 'text-[#2B3342] hover:text-[#101828] hover:bg-white'
                }`}
              >
                <History className="w-3.5 h-3.5" />
                <span>Real Historical BDI</span>
              </button>
            </div>

            {activeChartMode === 'forecast' && (
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200/80 shrink-0">
                <span className="text-xs font-bold text-[#2B3342] px-2 font-mono-data">Horizon:</span>
                {horizons.map((h) => (
                  <button
                    key={h}
                    onClick={() => setForecastHorizon(h)}
                    className={`px-3 py-1 rounded-lg text-xs font-bold font-mono-data transition-all cursor-pointer ${
                      forecastHorizon === h
                        ? 'bg-[#0284C7] text-white shadow-xs'
                        : 'text-[#2B3342] hover:text-[#101828] hover:bg-white'
                    }`}
                  >
                    {h}d
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 3 Metric Stat Readouts */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 my-5">
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
            <div className="text-xs font-semibold text-[#2B3342] font-mono-data">Current Spot Anchor</div>
            <div className="text-xl sm:text-2xl font-bold font-mono-data text-[#101828] mt-0.5">
              {formatFreightRate(forecast.currentRate, currencyUnit)}
            </div>
            <div className="text-[11px] text-[#2B3342] mt-0.5 font-sans">Trailing 24h market baseline</div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
            <div className="text-xs font-semibold text-[#0EA5E9] font-mono-data">Projected {forecastHorizon}d Rate</div>
            <div className="text-xl sm:text-2xl font-bold font-mono-data text-[#101828] mt-0.5 flex items-center gap-2">
              <span>{formatFreightRate(forecast.projectedRate30d, currencyUnit)}</span>
              <span
                className={`text-xs px-2 py-0.5 rounded-md font-bold font-mono-data ${
                  forecast.trend === 'Rising'
                    ? 'bg-[#EB1515]/15 text-[#EB1515] border border-[#EB1515]/30'
                    : forecast.trend === 'Falling'
                    ? 'bg-[#12883E]/15 text-[#12883E] border border-[#12883E]/30'
                    : 'bg-slate-100 text-[#2B3342]'
                }`}
              >
                {forecast.trend === 'Rising' ? '+' : ''}{forecast.trendPercent}%
              </span>
            </div>
            <div className="text-[11px] text-[#2B3342] mt-0.5 font-sans">
              Trend: <span className="font-bold">{forecast.trend}</span>
            </div>
          </div>

          <div
            className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80"
            title="Rule-based heuristic indicator reflecting known route distance, vessel elasticity, and operational risk factors rather than a machine-learned probability"
          >
            <div className="text-xs font-semibold text-[#12883E] font-mono-data">Forecast Reliability</div>
            <div className="text-xl sm:text-2xl font-bold font-mono-data text-[#12883E] mt-0.5">
              {forecast.confidenceScore}%
            </div>
            <div className="text-[11px] text-[#2B3342] mt-0.5 font-sans">Route, vessel & cargo risk index</div>
          </div>
        </div>

        {/* The Responsive Chart */}
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="text-xs font-bold font-mono-data text-[#101828] flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#0EA5E9]"></span>
            <span>
              {activeChartMode === 'forecast'
                ? `Freight Rate (${currencyUnit === 'INR' ? '₹ INR / Metric Ton' : '$ USD / Metric Ton'})`
                : 'Baltic Dry Index (BDI Points)'}
            </span>
          </span>
          <span className="text-xs font-mono-data text-[#2B3342] font-medium">
            {activeChartMode === 'forecast'
              ? 'Genuine ML Model Projections + 90% Confidence Corridor'
              : 'Real Monthly Baltic Exchange Dataset Actuals'}
          </span>
        </div>

        <div className="h-[320px] sm:h-[380px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            {activeChartMode === 'forecast' ? (
              <ComposedChart data={forecastChartData} margin={{ top: 10, right: 15, left: 15, bottom: 10 }}>
                <defs>
                  <linearGradient id="forecastLineGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#0284C7" />
                    <stop offset="100%" stopColor="#38BDF8" />
                  </linearGradient>
                  <linearGradient id="bandGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="#0EA5E9" stopOpacity={0.20} />
                    <stop offset="100%" stopColor="#0EA5E9" stopOpacity={0.03} />
                  </linearGradient>
                </defs>

                <CartesianGrid strokeDasharray="3 3" stroke="#CBD5E1" strokeOpacity={0.5} vertical={false} />
                <XAxis
                  dataKey="date"
                  stroke="#475569"
                  tickLine={false}
                  interval={forecastHorizon <= 14 ? 2 : forecastHorizon <= 30 ? 5 : 8}
                  tick={<CustomXAxisTick />}
                />
                <YAxis
                  domain={[minForecastVal, maxForecastVal]}
                  stroke="#475569"
                  tickLine={false}
                  tick={<CustomYAxisTick />}
                />
                <Tooltip content={customTooltip} />

                {/* Confidence Band Area */}
                <Area
                  type="monotone"
                  dataKey="upper"
                  stroke="transparent"
                  fill="url(#bandGrad)"
                  fillOpacity={1}
                />

                {/* Forecast Line (Cyan Accent Gradient) */}
                <Line
                  type="monotone"
                  dataKey="predicted"
                  stroke="url(#forecastLineGrad)"
                  strokeWidth={3}
                  strokeDasharray="4 2"
                  dot={false}
                  activeDot={{ r: 6, fill: '#0EA5E9' }}
                  name="AI Prediction"
                />
              </ComposedChart>
            ) : (
              <ComposedChart data={historicalBdiData} margin={{ top: 10, right: 15, left: 15, bottom: 10 }}>
                <defs>
                  <linearGradient id="bdiLineGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#061B30" />
                    <stop offset="100%" stopColor="#0284C7" />
                  </linearGradient>
                  <linearGradient id="bdiAreaGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="#0284C7" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#0284C7" stopOpacity={0.02} />
                  </linearGradient>
                </defs>

                <CartesianGrid strokeDasharray="3 3" stroke="#CBD5E1" strokeOpacity={0.5} vertical={false} />
                <XAxis
                  dataKey="date"
                  stroke="#475569"
                  tickLine={false}
                  interval={historicalBdiData.length > 30 ? 6 : historicalBdiData.length > 15 ? 3 : 1}
                  tick={<CustomXAxisTick />}
                />
                <YAxis
                  domain={[minBdiVal, maxBdiVal]}
                  stroke="#475569"
                  tickLine={false}
                  tick={<CustomYAxisTick />}
                />
                <Tooltip content={customTooltip} />

                <Area
                  type="monotone"
                  dataKey="bdi"
                  stroke="url(#bdiLineGrad)"
                  strokeWidth={2.5}
                  fill="url(#bdiAreaGrad)"
                  fillOpacity={1}
                  dot={{ r: 3, fill: '#0284C7' }}
                  activeDot={{ r: 6, fill: '#38BDF8' }}
                  name="Baltic Dry Index"
                />
              </ComposedChart>
            )}
          </ResponsiveContainer>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 mt-2 border-t border-slate-200/80 text-xs text-[#2B3342]">
          <div className="flex items-center gap-4">
            {activeChartMode === 'forecast' ? (
              <>
                <span className="flex items-center gap-1.5 font-mono-data font-semibold text-[#101828]">
                  <span className="w-3 h-1 bg-[#0EA5E9] rounded-full"></span> Genuine AI Projection (+{forecastHorizon}d)
                </span>
                <span className="flex items-center gap-1.5 font-mono-data font-semibold text-[#2B3342]">
                  <span className="w-2.5 h-2 bg-[#0EA5E9]/20 rounded-xs border border-[#0EA5E9]/40"></span> 90% Confidence Corridor
                </span>
              </>
            ) : (
              <span className="flex items-center gap-1.5 font-mono-data font-semibold text-[#101828]">
                <span className="w-3 h-1 bg-[#0284C7] rounded-full"></span> Real Monthly Baltic Dry Index Observations
              </span>
            )}
          </div>
          <span className="font-mono-data text-[11px] text-[#2B3342] font-medium">Source: Baltic Exchange Monthly Series + ML Ridge Inference</span>
        </div>
      </div>

      {/* EXPLAINABLE AI FEATURE CONTRIBUTION PANEL */}
      <div className="rounded-[20px] bg-white p-5 sm:p-7 shadow-sm border border-slate-200/80">
        <div className="flex items-center gap-2 mb-1.5">
          <IconChip icon={<Sparkles className="w-4 h-4" />} color="violet" size="sm" />
          <h3 className="text-base sm:text-lg font-bold font-heading text-[#101828]">
            Explainable AI: Ridge Model Feature Weights & Coefficients
          </h3>
        </div>
        <p className="text-xs sm:text-sm text-[#2B3342] mb-4 font-sans">
          Actual mathematical coefficients (<span className="font-mono-data font-semibold">w<sub>i</sub></span>) learned by the Ridge regression model from 25-year Baltic Exchange training features:
        </p>

        {forecast.featureContributions.length > 0 ? (
          <div className="grid grid-cols-1 gap-2.5">
            {forecast.featureContributions.map((fc, index) => {
              const isUp = fc.direction === 'up';
              const absVal = Math.abs(fc.contributionPercent);
              const barWidthPercent = Math.min(100, Math.max(8, (Math.min(10, absVal) / 10) * 100));
              return (
                <div
                  key={index}
                  className="p-3 sm:p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <div
                      className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 text-white ${
                        isUp ? 'bg-[#12883E]' : 'bg-[#EB1515]'
                      }`}
                    >
                      {isUp ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs sm:text-sm font-bold text-[#101828] font-mono-data">{fc.factor}</div>
                      <div className="text-[11px] text-[#2B3342] leading-tight font-sans">{fc.description}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 sm:w-56 shrink-0">
                    <div className="flex-1 h-2 rounded-full bg-[#E3E9F5] overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          isUp ? 'bg-[#12883E]' : 'bg-[#EB1515]'
                        }`}
                        style={{ width: `${barWidthPercent}%` }}
                      />
                    </div>

                    <span
                      className={`text-xs font-bold font-mono-data px-2.5 py-0.5 rounded-md min-w-[70px] text-center ${
                        isUp ? 'bg-[#12883E]/15 text-[#12883E] border border-[#12883E]/30' : 'bg-[#EB1515]/15 text-[#EB1515] border border-[#EB1515]/30'
                      }`}
                    >
                      {fc.contributionPercent > 0 ? '+' : ''}{fc.contributionPercent}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-xs text-slate-500 font-sans italic p-4 bg-slate-50 rounded-xl border border-slate-200">
            Model coefficients available via MLModelManager.
          </div>
        )}

        {/* Net Cumulative Impact Row */}
        <div className="mt-4 p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs sm:text-sm font-semibold text-[#101828]">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#0EA5E9]"></span>
            <span className="font-heading font-bold text-[#101828]">Net Corridor Forecast Trajectory Shift:</span>
          </div>
          <div>
            <span
              className={`text-xs sm:text-sm font-bold font-mono-data px-3 py-1 rounded-lg border ${
                forecast.netExpectedChangePercent > 0
                  ? 'bg-[#EB1515]/15 text-[#EB1515] border-[#EB1515]/30'
                  : 'bg-[#12883E]/15 text-[#12883E] border-[#12883E]/30'
              }`}
            >
              {forecast.netExpectedChangePercent > 0 ? '+' : ''}
              {forecast.netExpectedChangePercent}% Projected Shift
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
