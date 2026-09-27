import React from 'react';
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

  const horizons: (7 | 14 | 30 | 60)[] = [7, 14, 30, 60];

  // Map forecast data points for the responsive trajectory chart
  const currentSpotRate = forecast.currentRate;
  const targetPoint = forecast.dataPoints.find((p) => p.dayIndex === forecastHorizon) || forecast.dataPoints[forecast.dataPoints.length - 1];
  const projectedTargetRate = targetPoint ? targetPoint.predicted : forecast.projectedRate30d;

  const chartData = forecast.dataPoints.map((dp) => {
    const isHistorical = !dp.isForecast || dp.dayIndex === 0;
    const isForecast = dp.isForecast;

    return {
      date: dp.date.length >= 10 ? dp.date.slice(5) : dp.date, // MM-DD
      fullDate: dp.date,
      historical: isHistorical ? (dp.historical ?? dp.predicted) : null,
      predicted: isForecast ? dp.predicted : null,
      lower: isForecast ? dp.lowerBound : null,
      upper: isForecast ? dp.upperBound : null,
      dayIndex: dp.dayIndex,
    };
  });

  // Grounded Y-Axis domain with 12% margin
  const allValues = forecast.dataPoints
    .flatMap((d) => [d.predicted, d.lowerBound, d.upperBound, d.historical])
    .filter((v): v is number => typeof v === 'number' && !isNaN(v));
  const baseRateVal = allValues.length ? Math.min(...allValues) : forecast.currentRate;
  const maxRateVal = allValues.length ? Math.max(...allValues) : forecast.currentRate;
  const minVal = Math.max(0, Math.floor(baseRateVal * 0.88));
  const maxVal = Math.ceil(maxRateVal * 1.12);

  // Custom Axis Tick components with solid backing chips for maximum legibility
  const CustomYAxisTick = ({ x, y, payload }: any) => {
    const text = currencyUnit === 'INR'
      ? `₹${Math.round(payload.value * 83.5)}`
      : `$${Number(payload.value).toFixed(1)}`;
    return (
      <g transform={`translate(${x},${y})`}>
        <rect x={-48} y={-9} width={44} height={18} rx={4} fill="#F8FAFC" stroke="#CBD5E1" strokeWidth={1} />
        <text x={-26} y={4} textAnchor="middle" fill="#101828" fontSize={11} fontWeight={600} fontFamily="JetBrains Mono, monospace">
          {text}
        </text>
      </g>
    );
  };

  const CustomXAxisTick = ({ x, y, payload }: any) => {
    return (
      <g transform={`translate(${x},${y})`}>
        <rect x={-20} y={4} width={40} height={18} rx={4} fill="#F8FAFC" stroke="#CBD5E1" strokeWidth={1} />
        <text x={0} y={17} textAnchor="middle" fill="#101828" fontSize={11} fontWeight={600} fontFamily="JetBrains Mono, monospace">
          {payload.value}
        </text>
      </g>
    );
  };

  const customTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-[#101828] text-white p-3 rounded-xl shadow-lg border border-slate-700 text-xs font-mono-data">
          <div className="font-bold text-[#0EA5E9] mb-1">
            Date: {data.fullDate || label} {data.dayIndex !== undefined ? `(${data.dayIndex <= 0 ? (data.dayIndex === 0 ? 'Today' : `Day ${data.dayIndex}`) : `Day +${data.dayIndex}`})` : ''}
          </div>
          {data.historical !== null && (
            <div className="text-white font-semibold flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#94A3B8]"></span>
              <span>Historical Spot: {formatFreightRate(data.historical, currencyUnit)}</span>
            </div>
          )}
          {data.predicted !== null && data.dayIndex > 0 && (
            <div className="text-[#0EA5E9] font-bold flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#0EA5E9]"></span>
              <span>AI Projected: {formatFreightRate(data.predicted, currencyUnit)}</span>
            </div>
          )}
          {data.lower !== null && data.upper !== null && data.dayIndex > 0 && (
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
        {/* Header Row */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-slate-200/80">
          <div>
            <div className="flex items-center gap-2">
              <IconChip icon={<TrendingUp className="w-4 h-4 text-[#0284C7]" />} color="blue" size="sm" />
              <h2 className="text-lg sm:text-xl font-bold font-heading text-[#101828] tracking-tight">
                Baltic Freight Trajectory: {cargoRequest.origin} → {cargoRequest.destinationPort}
              </h2>
            </div>
            <p className="text-xs text-[#2B3342] mt-1 font-sans">
              30-day historical spot rates paired with machine-learning confidence bounds for {cargoRequest.origin} → {cargoRequest.destinationPort}
            </p>
          </div>

          {/* Horizon Pill Segmented Control */}
          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200/80 shrink-0">
            <span className="text-xs font-bold text-[#2B3342] px-2 font-mono-data">Horizon:</span>
            {horizons.map((h) => (
              <button
                key={h}
                onClick={() => setForecastHorizon(h)}
                className={`px-3 py-1 rounded-lg text-xs font-bold font-mono-data transition-all cursor-pointer ${
                  forecastHorizon === h
                    ? 'bg-[#101828] text-white shadow-xs'
                    : 'text-[#2B3342] hover:text-[#101828] hover:bg-white'
                }`}
              >
                {h} Days
              </button>
            ))}
          </div>
        </div>

        {/* 3 Metric Stat Readouts */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 my-5">
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
            <div className="text-xs font-bold text-[#2B3342] font-mono-data">Current Spot Rate</div>
            <div className="text-xl sm:text-2xl font-bold font-mono-data text-[#101828] mt-0.5">
              {formatFreightRate(currentSpotRate, currencyUnit)}
            </div>
            <div className="text-[11px] text-[#2B3342] mt-0.5 font-sans">Trailing 24h market anchor</div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
            <div className="text-xs font-bold text-[#0EA5E9] font-mono-data">Projected {forecastHorizon}d Rate</div>
            <div className="text-xl sm:text-2xl font-bold font-mono-data text-[#101828] mt-0.5 flex items-center gap-2">
              <span>{formatFreightRate(projectedTargetRate, currencyUnit)}</span>
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

          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
            <div className="text-xs font-bold text-[#12883E] font-mono-data">Model Confidence</div>
            <div className="text-xl sm:text-2xl font-bold font-mono-data text-[#12883E] mt-0.5">
              {Math.round(forecast.confidenceScore)}%
            </div>
            <div className="text-[11px] text-[#2B3342] mt-0.5 font-sans">Based on vessel supply and queue</div>
          </div>
        </div>

        {/* Section Label Row */}
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="text-xs font-bold font-mono-data text-[#101828] flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#0EA5E9]"></span>
            <span>Freight Rate ({currencyUnit === 'INR' ? '₹ INR / Metric Ton' : '$ USD / Metric Ton'})</span>
          </span>
          <span className="text-xs font-mono-data text-[#2B3342] font-medium">
            Historical Actuals + ML Confidence Corridor
          </span>
        </div>

        {/* The Responsive Chart */}
        <div className="h-[320px] sm:h-[380px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 10, right: 15, left: 15, bottom: 10 }}>
              <defs>
                <linearGradient id="bandGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#0EA5E9" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="#0EA5E9" stopOpacity={0.04} />
                </linearGradient>
              </defs>

              <CartesianGrid strokeDasharray="3 3" stroke="#CBD5E1" strokeOpacity={0.5} vertical={false} />
              <XAxis
                dataKey="date"
                stroke="#475569"
                tickLine={false}
                interval={forecastHorizon <= 14 ? 3 : forecastHorizon <= 30 ? 6 : 9}
                tick={<CustomXAxisTick />}
              />
              <YAxis
                domain={[minVal, maxVal]}
                stroke="#475569"
                tickLine={false}
                tick={<CustomYAxisTick />}
              />
              <Tooltip content={customTooltip} />

              {/* Confidence Band Area (Shaded region over forecast dates) */}
              <Area
                type="monotone"
                dataKey="upper"
                stroke="transparent"
                fill="url(#bandGrad)"
                fillOpacity={1}
                isAnimationActive={false}
              />

              {/* Historical Line (Solid Dark Navy / Black) */}
              <Line
                type="monotone"
                dataKey="historical"
                stroke="#061B30"
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 5, fill: '#061B30' }}
                name="Historical Rate"
                isAnimationActive={false}
              />

              {/* Forecast Line (Dotted Blue) */}
              <Line
                type="monotone"
                dataKey="predicted"
                stroke="#0EA5E9"
                strokeWidth={2.5}
                strokeDasharray="4 2"
                dot={false}
                activeDot={{ r: 5, fill: '#0EA5E9' }}
                name="AI Projected"
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* Legend Row */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 mt-2 border-t border-slate-200/80 text-xs text-[#2B3342]">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5 font-mono-data font-semibold text-[#101828]">
              <span className="w-3 h-1 bg-[#061B30] rounded-full"></span> Historical Rate
            </span>
            <span className="flex items-center gap-1.5 font-mono-data font-semibold text-[#101828]">
              <span className="w-3 h-1 bg-[#0EA5E9] rounded-full"></span> AI Projected
            </span>
            <span className="flex items-center gap-1.5 font-mono-data font-semibold text-[#2B3342]">
              <span className="w-2.5 h-2 bg-[#0EA5E9]/20 rounded-xs border border-[#0EA5E9]/40"></span> Confidence Corridor
            </span>
          </div>
          <span className="font-mono-data text-[11px] text-[#2B3342] font-medium">
            Source: Baltic Exchange Index + AIS Fleet Tracking
          </span>
        </div>
      </div>

      {/* EXPLAINABLE AI FEATURE CONTRIBUTION PANEL */}
      <div className="rounded-[20px] bg-white p-5 sm:p-7 shadow-sm border border-slate-200/80">
        <div className="flex items-center gap-2 mb-1.5">
          <IconChip icon={<Sparkles className="w-4 h-4" />} color="violet" size="sm" />
          <h3 className="text-base sm:text-lg font-bold font-heading text-[#101828]">
            Key Factors Influencing Prediction
          </h3>
        </div>
        <p className="text-xs sm:text-sm text-[#2B3342] mb-4 font-sans">
          These are the main market factors influencing this forecast:
        </p>

        {(() => {
          const PLAIN_FEATURE_MAP: Record<string, { title: string; description: string }> = {
            pct_change_1: {
              title: "Last Month's Rate Change",
              description: 'Recent month-over-month shift in bulk carrier fixture rates across the corridor',
            },
            momentum_3: {
              title: '3-Month Price Velocity',
              description: 'Speed and direction of freight rate movements over the past quarter',
            },
            cos_month: {
              title: 'Seasonal Shipping Cycle',
              description: 'Historical seasonal pattern based on regular cyclical trade fluctuations',
            },
            sin_month: {
              title: 'Seasonal Weather & Demand Cycle',
              description: 'Annual monsoon and harvest seasonality affecting corridor trade volume',
            },
            bunker_pct_change_1: {
              title: 'Marine Fuel Price Trends',
              description: 'Recent changes in VLSFO bunker fuel prices impacting vessel operating costs',
            },
            quarter: {
              title: 'Quarterly Trade Demand',
              description: 'Typical commercial shipping demand for the current calendar quarter',
            },
            bunker_rolling_mean_3: {
              title: '3-Month Fuel Price Average',
              description: 'Average marine fuel benchmark prices influencing charter base rates',
            },
            bunker_lag_2: {
              title: 'Recent Bunker Fuel Benchmark',
              description: 'Bunker fuel cost baseline from two months prior',
            },
            month: {
              title: 'Monthly Calendar Seasonality',
              description: 'Expected demand pattern for the active calendar month',
            },
            lag_1: {
              title: "Last Month's Freight Rate",
              description: 'Baseline spot market rate established during the previous month',
            },
            bunker_rolling_mean_6: {
              title: '6-Month Fuel Cost Average',
              description: 'Medium-term average bunker price baseline',
            },
            bunker_lag_1: {
              title: 'Recent Marine Fuel Benchmark',
              description: 'Singapore VLSFO marine fuel prices from the preceding month',
            },
            lag_2: {
              title: '2-Month Rate Baseline',
              description: 'Freight fixture rates recorded two months ago',
            },
            rolling_mean_3: {
              title: 'Quarterly Moving Average',
              description: '3-month average spot freight price on this trade lane',
            },
            lag_3: {
              title: '3-Month Rate Baseline',
              description: 'Spot market fixture rate benchmark from three months ago',
            },
            rolling_std_3: {
              title: 'Short-Term Market Volatility',
              description: 'Level of price fluctuation and unpredictability over the last 90 days',
            },
            lag_6: {
              title: '6-Month Rate Baseline',
              description: 'Historical rate anchor from six months prior',
            },
            rolling_mean_6: {
              title: '6-Month Moving Average',
              description: 'Medium-term smoothed freight rate benchmark',
            },
            rolling_std_6: {
              title: 'Medium-Term Volatility',
              description: 'Extended volatility and variance in corridor fixture prices',
            },
            lag_12: {
              title: 'Annual Rate Comparison',
              description: 'Historical spot freight rate benchmark from exactly one year ago',
            },
          };

          const eligible = (forecast.featureContributions || [])
            .filter((fc) => PLAIN_FEATURE_MAP[fc.factor])
            .sort((a, b) => Math.abs(b.contributionPercent) - Math.abs(a.contributionPercent))
            .slice(0, 3);

          if (eligible.length === 0) {
            return (
              <div className="text-xs text-slate-500 font-sans italic p-4 bg-slate-50 rounded-xl border border-slate-200">
                Model factors are stabilizing for this corridor.
              </div>
            );
          }

          const maxWeight = Math.max(...eligible.map((e) => Math.abs(e.contributionPercent)), 1);

          return (
            <div className="grid grid-cols-1 gap-3">
              {eligible.map((fc, index) => {
                const info = PLAIN_FEATURE_MAP[fc.factor];
                const isUp = fc.direction === 'up';
                const absVal = Math.abs(fc.contributionPercent);
                const relativePct = Math.min(100, Math.max(15, Math.round((absVal / maxWeight) * 100)));

                return (
                  <div
                    key={index}
                    className="p-3.5 sm:p-4 rounded-xl bg-slate-50 border border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3.5"
                  >
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <div
                        className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-white mt-0.5 ${
                          isUp ? 'bg-[#12883E]' : 'bg-[#EB1515]'
                        }`}
                      >
                        {isUp ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-[#101828] font-heading">
                          {info.title}
                        </div>
                        <div className="text-xs text-[#2B3342] mt-0.5 leading-snug font-sans">
                          {info.description}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 sm:w-60 shrink-0 self-stretch sm:self-center">
                      <div className="flex-1 h-2 rounded-full bg-[#E3E9F5] overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            isUp ? 'bg-[#12883E]' : 'bg-[#EB1515]'
                          }`}
                          style={{ width: `${relativePct}%` }}
                        />
                      </div>

                      <span
                        className={`text-xs font-bold font-mono-data px-2.5 py-1 rounded-md min-w-[95px] text-center shrink-0 ${
                          isUp
                            ? 'bg-[#12883E]/15 text-[#12883E] border border-[#12883E]/30'
                            : 'bg-[#EB1515]/15 text-[#EB1515] border border-[#EB1515]/30'
                        }`}
                      >
                        {isUp ? 'Pushes up' : 'Pushes down'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}

        {/* Net Cumulative Impact Row */}
        <div className="mt-4 p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs sm:text-sm font-semibold text-[#101828]">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#0EA5E9]"></span>
            <span className="font-heading font-bold text-[#101828]">Net Expected Direction:</span>
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
              {forecast.netExpectedChangePercent}% Projected Rate Shift
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
