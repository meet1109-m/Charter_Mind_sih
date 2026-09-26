import React, { useState } from 'react';
import { useCharter } from '../../context/CharterContext';
import { DecisionCard } from '../common/DecisionCard';
import { IconChip } from '../common/IconChip';
import { StatusBadge } from '../common/StatusBadge';
import { formatFreightRate, formatSavings } from '../../utils/currency';
import {
  TrendingUp,
  Anchor,
  ShieldAlert,
  Coins,
  ArrowRight,
  Bell,
  ArrowUpRight,
  ArrowDownRight,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
} from 'recharts';

export const DashboardView: React.FC = () => {
  const {
    cargoRequest,
    selectedPort,
    topVesselBreakdown,
    idlePrediction,
    riskScores,
    forecast,
    optimalWindow,
    contractComparison,
    alerts,
    setActiveTab,
    currencyUnit,
  } = useCharter();

  // State to track expanded alert cards in live advisories
  const [expandedAlerts, setExpandedAlerts] = useState<Record<string, boolean>>({});

  const toggleAlertExpand = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedAlerts((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // Mini sparkline data matching the active forecast horizon and corridor
  const sparklineData = forecast.dataPoints
    .filter((p) => p.dayIndex >= 0 && p.dayIndex <= Math.min(forecast.horizonDays, 30))
    .map((p) => ({
      date: p.date.slice(5),
      rate: p.predicted,
      lower: p.isForecast ? p.lowerBound : p.predicted,
      upper: p.isForecast ? p.upperBound : p.predicted,
      isForecast: p.isForecast,
    }));

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* TOP SECTION: HERO AI DECISION CARD + 4 COMPACT STAT CARDS */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left 7 cols: AI Decision Card (Hero Anchor) */}
        <div className="lg:col-span-7">
          <DecisionCard />
        </div>

        {/* Right 5 cols: 4 Compact, Balanced Stat Cards in Solid White */}
        <div className="lg:col-span-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Card 1: Baltic Trajectory */}
          <div
            onClick={() => setActiveTab('freight-forecast')}
            className="rounded-[20px] bg-white p-4 sm:p-5 shadow-sm border border-slate-200/80 hover:bg-slate-50/80 hover:border-slate-300 transition-all cursor-pointer flex flex-col justify-between"
          >
            <div>
              {/* Standardized Header: Label Above Value with Icon + Pill */}
              <div className="flex items-center justify-between gap-1.5 mb-2 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <IconChip icon={<TrendingUp className="w-3.5 h-3.5 shrink-0" />} color="blue" size="sm" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#2B3342] font-mono-data">
                    Baltic Trajectory
                  </span>
                </div>
                <span
                  className={`text-[10px] font-bold font-mono-data px-2 py-0.5 rounded flex items-center gap-0.5 shrink-0 ${
                    forecast.trend === 'Rising'
                      ? 'bg-[#EB1515]/15 text-[#EB1515] border border-[#EB1515]/30'
                      : 'bg-[#12883E]/15 text-[#12883E] border border-[#12883E]/30'
                  }`}
                >
                  {forecast.trend === 'Rising' ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                  <span>{forecast.trendPercent}%</span>
                </span>
              </div>

              {/* Primary Value */}
              <div className="text-2xl font-bold font-heading text-[#101828] mt-0.5">
                {formatFreightRate(forecast.currentRate, currencyUnit)}
              </div>

              {/* Supporting Context (Rich, tightly wrapped) */}
              <div className="text-xs text-[#2B3342] mt-1 font-sans leading-snug">
                30d Target: <span className="font-semibold text-[#101828]">{formatFreightRate(forecast.projectedRate30d, currencyUnit)}</span> ({forecast.trend === 'Rising' ? '+' : ''}{forecast.trendPercent}%)
              </div>
            </div>

            {/* Footer Action Link */}
            <div className="text-[11px] text-[#0B5D63] font-semibold mt-3 pt-2.5 border-t border-slate-200/80 flex items-center justify-between font-mono-data">
              <span>View 60d forecast</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </div>
          </div>

          {/* Card 2: Berth Draught Clearance */}
          <div
            onClick={() => setActiveTab('vessel-optimizer')}
            className="rounded-[20px] bg-white p-4 sm:p-5 shadow-sm border border-slate-200/80 hover:bg-slate-50/80 hover:border-slate-300 transition-all cursor-pointer flex flex-col justify-between"
          >
            <div>
              {/* Standardized Header: Label Above Value with Icon + Pill */}
              <div className="flex items-center justify-between gap-1.5 mb-2 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <IconChip icon={<Anchor className="w-3.5 h-3.5 shrink-0" />} color="teal" size="sm" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#2B3342] font-mono-data">
                    Berth Draft Fit
                  </span>
                </div>
                <span className="text-[10px] font-bold font-mono-data px-2 py-0.5 rounded bg-[#12883E]/15 text-[#12883E] border border-[#12883E]/30 shrink-0">
                  +{topVesselBreakdown.compatibility.draftFit.margin.toFixed(1)}m Safe
                </span>
              </div>

              {/* Primary Value */}
              <div className="text-2xl font-bold font-heading text-[#101828] mt-0.5">
                {topVesselBreakdown.vessel.draft}m{' '}
                <span className="text-xs font-normal text-[#2B3342] font-sans">Draught</span>
              </div>

              {/* Supporting Context (Rich, tightly wrapped) */}
              <div className="text-xs text-[#2B3342] mt-1 font-sans leading-snug">
                {topVesselBreakdown.vessel.name} · {selectedPort.name} limit {selectedPort.maxDraft}m
              </div>
            </div>

            {/* Footer Action Link */}
            <div className="text-[11px] text-[#0B5D63] font-semibold mt-3 pt-2.5 border-t border-slate-200/80 flex items-center justify-between font-mono-data">
              <span>View fleet matrix</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </div>
          </div>

          {/* Card 3: Maritime Risk Index */}
          <div
            onClick={() => setActiveTab('risk-engine')}
            className="rounded-[20px] bg-white p-4 sm:p-5 shadow-sm border border-slate-200/80 hover:bg-slate-50/80 hover:border-slate-300 transition-all cursor-pointer flex flex-col justify-between"
          >
            <div>
              {/* Standardized Header: Label Above Value with Icon + Pill */}
              <div className="flex items-center justify-between gap-1.5 mb-2 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <IconChip icon={<ShieldAlert className="w-3.5 h-3.5 shrink-0" />} color="rose" size="sm" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#2B3342] font-mono-data">
                    Maritime Risk Index
                  </span>
                </div>
                <StatusBadge
                  label={riskScores.bucket}
                  variant={
                    riskScores.bucket === 'Low'
                      ? 'success'
                      : riskScores.bucket === 'Medium'
                      ? 'warning'
                      : 'danger'
                  }
                  size="sm"
                />
              </div>

              {/* Primary Value */}
              <div className="text-2xl font-bold font-mono-data text-[#101828] mt-0.5">
                {riskScores.overallScore} <span className="text-xs font-normal text-[#2B3342]">/ 100</span>
              </div>

              {/* Supporting Context */}
              <div className="text-xs text-[#2B3342] mt-1 font-sans leading-snug">
                Driver: <span className="font-semibold text-[#101828]">{riskScores.primaryDriver}</span>
              </div>
            </div>

            {/* Footer Action Link */}
            <div className="text-[11px] text-[#0B5D63] font-semibold mt-3 pt-2.5 border-t border-slate-200/80 flex items-center justify-between font-mono-data">
              <span>Audit 5 risk factors</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </div>
          </div>

          {/* Card 4: Hedging Savings */}
          <div
            onClick={() => setActiveTab('contract-advisor')}
            className="rounded-[20px] bg-white p-4 sm:p-5 shadow-sm border border-slate-200/80 hover:bg-slate-50/80 hover:border-slate-300 transition-all cursor-pointer flex flex-col justify-between"
          >
            <div>
              {/* Standardized Header: Label Above Value with Icon + Pill */}
              <div className="flex items-center justify-between gap-1.5 mb-2 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <IconChip icon={<Coins className="w-3.5 h-3.5 shrink-0" />} color="sky" size="sm" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#2B3342] font-mono-data">
                    Hedging Savings
                  </span>
                </div>
                <span className="text-[10px] font-bold font-mono-data px-2 py-0.5 rounded bg-[#12883E]/15 text-[#12883E] border border-[#12883E]/30 shrink-0">
                  COA Structure
                </span>
              </div>

              {/* Primary Value */}
              <div className="text-2xl font-bold font-mono-data text-[#101828] mt-0.5">
                {formatSavings(contractComparison.savingsUSD, currencyUnit)}
              </div>

              {/* Supporting Context */}
              <div className="text-xs text-[#2B3342] mt-1 font-sans leading-snug">
                Estimated ~{contractComparison.savingsPercent}% cost buffer vs. spot volatility
              </div>
            </div>

            {/* Footer Action Link */}
            <div className="text-[11px] text-[#0B5D63] font-semibold mt-3 pt-2.5 border-t border-slate-200/80 flex items-center justify-between font-mono-data">
              <span>Compare contract structures</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </div>
          </div>
        </div>
      </div>

      {/* MIDDLE SECTION: MINI SPARKLINE CARD + PORT INTELLIGENCE PREVIEW + ALERTS STREAM */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Mini 30-Day Rate Trajectory Sparkline (5 cols) */}
        <div className="lg:col-span-5 rounded-[20px] bg-white p-5 sm:p-6 shadow-sm border border-slate-200/80 flex flex-col">
          <div>
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <IconChip icon={<TrendingUp className="w-4 h-4" />} color="blue" size="sm" />
                <h3 className="text-sm sm:text-base font-bold font-heading text-[#101828]">
                  Freight Trajectory Corridor
                </h3>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-mono-data font-bold text-[#101828] bg-slate-100 px-2 py-0.5 rounded border border-slate-200/80">
                  {currencyUnit === 'INR' ? '₹/MT' : '$/MT'}
                </span>
                <span className="text-xs font-bold font-mono-data text-[#2B3342] hidden sm:inline">
                  {cargoRequest.origin} → {selectedPort.name}
                </span>
              </div>
            </div>

            <div className="h-44 w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={sparklineData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="dashSparkGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stopColor="#0EA5E9" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#0EA5E9" stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="dashCorridorGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stopColor="#38BDF8" stopOpacity={0.20} />
                      <stop offset="100%" stopColor="#38BDF8" stopOpacity={0.03} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="date"
                    stroke="#2B3342"
                    fontSize={11}
                    fontWeight={500}
                    tickLine={false}
                    interval={4}
                  />
                  <YAxis
                    stroke="#2B3342"
                    fontSize={11}
                    fontWeight={500}
                    tickLine={false}
                    domain={['auto', 'auto']}
                    tickFormatter={(val) => (currencyUnit === 'INR' ? `₹${Math.round(val * 83.5)}` : `$${Number(val).toFixed(1)}`)}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const d = payload[0].payload;
                        return (
                          <div className="bg-[#061B30] text-white p-2.5 rounded-lg text-xs font-mono-data shadow-md border border-[#334155]">
                            <div className="text-[#CBD5E1] flex items-center justify-between gap-2">
                              <span>{d.date}</span>
                              <span className="text-[10px] text-cyan-400 font-bold">{d.isForecast ? 'PROJECTION' : 'HISTORICAL'}</span>
                            </div>
                            <div className="font-bold text-[#0EA5E9] mt-0.5 text-sm">{formatFreightRate(d.rate, currencyUnit)}</div>
                            {d.isForecast && (
                              <div className="text-[10px] text-slate-400 mt-1 pt-1 border-t border-slate-700">
                                Corridor: {formatFreightRate(d.lower, currencyUnit)} – {formatFreightRate(d.upper, currencyUnit)}
                              </div>
                            )}
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="upper"
                    stroke="transparent"
                    fill="url(#dashCorridorGrad)"
                    isAnimationActive={false}
                  />
                  <Area
                    type="monotone"
                    dataKey="rate"
                    stroke="#0EA5E9"
                    strokeWidth={2.4}
                    fill="url(#dashSparkGrad)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

          </div>

          {/* Optimal Window Callout */}
          <div className="mt-3 pt-3 border-t border-slate-200/80 flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="text-[#2B3342] font-sans">Recommended Action:</span>
            <div className="flex items-center gap-2">
              <StatusBadge
                label={optimalWindow.recommendation}
                variant={
                  optimalWindow.recommendation === 'Charter Now'
                    ? 'success'
                    : optimalWindow.recommendation === 'Wait'
                    ? 'warning'
                    : 'danger'
                }
                size="sm"
                pulse={optimalWindow.recommendation === 'Charter Now'}
              />
              <span className="font-bold text-[#101828] font-mono-data">
                {optimalWindow.bestWindowStart} – {optimalWindow.bestWindowEnd}
              </span>
            </div>
          </div>
        </div>

        {/* Port Status & Turnaround Card (4 cols) */}
        <div className="lg:col-span-4 rounded-[20px] bg-white p-5 sm:p-6 shadow-sm border border-slate-200/80 flex flex-col">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <IconChip icon={<Anchor className="w-4 h-4" />} color="teal" size="sm" />
              <h3 className="text-sm sm:text-base font-bold font-heading text-[#101828]">
                {selectedPort.name}
              </h3>
            </div>
            <StatusBadge
              label={`${selectedPort.congestion} Queue`}
              variant={
                selectedPort.congestion === 'Low'
                  ? 'success'
                  : selectedPort.congestion === 'Medium'
                  ? 'warning'
                  : 'danger'
              }
              size="sm"
            />
          </div>

          <div className="space-y-2 text-xs mb-3">
            <div className="flex justify-between p-2 rounded-lg bg-slate-50 border border-slate-200/80">
              <span className="text-[#2B3342]">Max Permissible Draught</span>
              <span className="font-bold font-mono-data text-[#101828]">{selectedPort.maxDraft}m</span>
            </div>
            <div className="flex justify-between p-2 rounded-lg bg-slate-50 border border-slate-200/80">
              <span className="text-[#2B3342]">Expected Turnaround</span>
              <span className="font-bold font-mono-data text-[#A36907]">{idlePrediction.expectedIdleHours} hrs</span>
            </div>
            <div className="flex justify-between p-2 rounded-lg bg-slate-50 border border-slate-200/80">
              <span className="text-[#2B3342]">Discharging Speed</span>
              <span className="font-bold font-mono-data text-[#12883E]">{selectedPort.handlingRateMTPerDay.toLocaleString()} MT/day</span>
            </div>
          </div>

          <button
            onClick={() => setActiveTab('port-intelligence')}
            className="w-full py-2 px-3 rounded-xl bg-slate-50 hover:bg-slate-100 text-[#101828] border border-slate-200/80 text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 mt-auto shadow-xs cursor-pointer"
          >
            <span>Explore Coastal AIS Matrix</span>
            <ArrowRight className="w-3.5 h-3.5 text-[#2B3342]" strokeWidth={2.25} />
          </button>
        </div>

        {/* Live Advisories Quick Feed (3 cols) with Expandable 1-2 line truncation */}
        <div className="lg:col-span-3 rounded-[20px] bg-white p-5 sm:p-6 shadow-sm border border-slate-200/80 flex flex-col">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <IconChip icon={<Bell className="w-4 h-4" />} color="amber" size="sm" />
              <h3 className="text-sm font-bold font-heading text-[#101828]">
                Live Advisories
              </h3>
            </div>
            <span className="text-[10px] font-bold font-mono-data px-2 py-0.5 rounded bg-[#EB1515]/15 text-[#EB1515] border border-[#EB1515]/30">
              {alerts.length} Active
            </span>
          </div>

          <div className="space-y-2 mb-3">
            {alerts.slice(0, 2).map((a) => {
              const isExpanded = !!expandedAlerts[a.id];
              return (
                <div key={a.id} className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/80 text-xs">
                  <div className="font-bold text-[#101828] font-heading leading-snug">{a.title}</div>
                  <p className={`text-[11px] text-[#2B3342] mt-1 font-sans leading-relaxed ${isExpanded ? '' : 'line-clamp-2'}`}>
                    {a.message}
                  </p>
                  {a.message.length > 80 && (
                    <button
                      onClick={(e) => toggleAlertExpand(a.id, e)}
                      aria-expanded={isExpanded}
                      aria-label={isExpanded ? `Show less detail for ${a.title}` : `Read more detail for ${a.title}`}
                      className="text-[10px] text-[#0B5D63] font-semibold mt-1 hover:underline flex items-center gap-0.5 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0EA5E9]"
                    >
                      {isExpanded ? (
                        <>Show less <ChevronUp className="w-3 h-3" strokeWidth={2.25} /></>
                      ) : (
                        <>Read more <ChevronDown className="w-3 h-3" strokeWidth={2.25} /></>
                      )}
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          <button
            onClick={() => setActiveTab('alerts')}
            className="w-full py-2 px-3 rounded-xl bg-slate-50 hover:bg-slate-100 text-[#101828] border border-slate-200/80 text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 mt-auto shadow-xs cursor-pointer"
          >
            <span>View All Operational Alerts</span>
            <ArrowRight className="w-3.5 h-3.5 text-[#2B3342]" strokeWidth={2.25} />
          </button>
        </div>
      </div>
    </div>
  );
};
