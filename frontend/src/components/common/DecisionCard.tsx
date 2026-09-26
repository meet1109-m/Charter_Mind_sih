import React from 'react';
import { useCharter } from '../../context/CharterContext';
import { formatFreightRate, formatSavings } from '../../utils/currency';
import { IconChip } from './IconChip';
import { StatusBadge } from './StatusBadge';
import {
  Compass,
  Package,
  Ship,
  Calendar,
  ShieldAlert,
  FileCheck,
  Sparkles,
  Check,
  AlertTriangle,
  ArrowRight,
} from 'lucide-react';

interface DecisionCardProps {
  onExploreMore?: () => void;
  className?: string;
  showActions?: boolean;
}

export const DecisionCard: React.FC<DecisionCardProps> = ({
  onExploreMore,
  className = '',
  showActions = true,
}) => {
  const {
    cargoRequest,
    selectedPort,
    topVesselBreakdown,
    optimalWindow,
    riskScores,
    contractComparison,
    forecast,
    setActiveTab,
    currencyUnit,
  } = useCharter();

  const isLowConfidence = forecast.confidenceScore < 72;

  const savingsFormatted = formatSavings(contractComparison.savingsUSD, currencyUnit);

  // Composite AI reasons (concise one-line statements)
  const keyReasons = [
    `Rank #1 Vessel: ${topVesselBreakdown.vessel.name} provides +${topVesselBreakdown.compatibility.draftFit.margin.toFixed(1)}m berth draught clearance at ${selectedPort.name}.`,
    `Optimal Timing: ${optimalWindow.recommendation} captures projected ${forecast.trend === 'Rising' ? '+' : ''}${forecast.trendPercent}% rate movement, securing lowest 30-day baseline.`,
    `Contract Strategy: ${contractComparison.recommendedStrategy} structure hedges an estimated ${savingsFormatted} (${contractComparison.savingsPercent}%) against spot volatility.`,
  ];

  return (
    <div
      className={`relative rounded-[20px] bg-white p-6 sm:p-7 transition-all duration-300 border border-slate-200/80 shadow-sm ${className}`}
    >
      {/* Top Header Badge & Title */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-slate-200/80">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-[#101828] text-[#0EA5E9] flex items-center justify-center shadow-sm border border-[#101828]">
            <Sparkles className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-bold font-heading text-[#101828] tracking-tight">
              AI Charter Recommendation
            </h2>
            <p className="text-xs sm:text-sm text-[#2B3342] mt-0.5 font-sans">
              Optimized fixture analysis for <span className="font-semibold text-[#101828]">{cargoRequest.cargoQuantity.toLocaleString()} MT {cargoRequest.cargoType}</span>
            </p>
          </div>
        </div>

        {/* Forecast Reliability Indicator Meter */}
        <div className="flex items-center gap-3" title="Rule-based indicator reflecting known route, vessel, and cargo risk factors rather than a machine-learned probability">
          <div className="text-right block">
            <div className="text-[10px] uppercase tracking-wider font-bold font-mono-data text-[#2B3342]">
              Reliability Indicator
            </div>
            <div className="text-base font-bold font-mono-data text-[#101828]">
              {forecast.confidenceScore}%
            </div>
          </div>
          <div className="relative w-12 h-12 flex items-center justify-center">
            <svg className="w-12 h-12 -rotate-90" viewBox="0 0 36 36">
              <path
                className="text-slate-100"
                strokeWidth="3.5"
                stroke="currentColor"
                fill="none"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              />
              <path
                className="text-[#0EA5E9] transition-all duration-1000"
                strokeDasharray={`${forecast.confidenceScore}, 100`}
                strokeWidth="3.5"
                strokeLinecap="round"
                stroke="currentColor"
                fill="none"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              />
            </svg>
            <span className="absolute text-xs font-bold text-[#101828] font-mono-data">
              {forecast.confidenceScore}%
            </span>
          </div>
        </div>
      </div>

      {/* 2x3 Grid of Decision Elements in Solid Sub-Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 py-5">
        {/* 1. Route Corridor */}
        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 shadow-2xs hover:border-slate-300 hover:bg-slate-100/70 transition-all flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <IconChip icon={<Compass className="w-3.5 h-3.5" />} color="blue" size="sm" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#2B3342] font-mono-data">
                Route Corridor
              </span>
            </div>
            <div className="text-sm font-bold text-[#101828] font-heading leading-snug">
              {cargoRequest.origin} → {selectedPort.name}
            </div>
          </div>
          <div className="text-[11px] text-[#2B3342] font-mono-data mt-2 pt-2 border-t border-slate-200/80">
            ~{cargoRequest.origin === 'Australia' ? '3,850' : cargoRequest.origin === 'Indonesia' ? '2,100' : '4,900'} nm sea voyage
          </div>
        </div>

        {/* 2. Top-Ranked Vessel */}
        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 shadow-2xs hover:border-slate-300 hover:bg-slate-100/70 transition-all flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-1.5 mb-1.5 flex-wrap">
              <div className="flex items-center gap-1.5">
                <IconChip icon={<Ship className="w-3.5 h-3.5 shrink-0" />} color="teal" size="sm" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#2B3342] font-mono-data">
                  Top-Ranked Vessel
                </span>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded-md bg-[#12883E] text-white border border-[#12883E]/80 font-bold font-mono-data shrink-0 shadow-xs">
                {topVesselBreakdown.finalScore} pts
              </span>
            </div>
            <div className="text-sm font-bold text-[#101828] font-heading leading-snug">
              {topVesselBreakdown.vessel.name}
            </div>
          </div>
          <div className="text-[11px] text-[#2B3342] font-mono-data mt-2 pt-2 border-t border-slate-200/80">
            {formatFreightRate(topVesselBreakdown.estimatedFreightPerMT, currencyUnit)} est. freight
          </div>
        </div>

        {/* 3. Optimal Window */}
        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 shadow-2xs hover:border-slate-300 hover:bg-slate-100/70 transition-all flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-1.5 mb-1.5 flex-wrap">
              <div className="flex items-center gap-1.5">
                <IconChip icon={<Calendar className="w-3.5 h-3.5 shrink-0" />} color="amber" size="sm" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#2B3342] font-mono-data">
                  Optimal Window
                </span>
              </div>
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
              />
            </div>
            <div className="text-sm font-bold text-[#101828] font-heading leading-snug">
              {optimalWindow.bestWindowStart} – {optimalWindow.bestWindowEnd}
            </div>
          </div>
          <div className="text-[11px] text-[#2B3342] font-mono-data mt-2 pt-2 border-t border-slate-200/80">
            Lowest 30-day rate corridor
          </div>
        </div>

        {/* 4. Cargo Parcel */}
        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 shadow-2xs hover:border-slate-300 hover:bg-slate-100/70 transition-all flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <IconChip icon={<Package className="w-3.5 h-3.5 shrink-0" />} color="indigo" size="sm" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#2B3342] font-mono-data">
                Cargo Parcel
              </span>
            </div>
            <div className="text-sm font-bold text-[#101828] font-heading leading-snug">
              {cargoRequest.cargoQuantity.toLocaleString()} MT {cargoRequest.cargoType}
            </div>
          </div>
          <div className="text-[11px] text-[#2B3342] font-mono-data mt-2 pt-2 border-t border-slate-200/80">
            {cargoRequest.numberOfVoyages}x shipment · {cargoRequest.contractDuration}
          </div>
        </div>

        {/* 5. Primary Risk Driver */}
        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 shadow-2xs hover:border-slate-300 hover:bg-slate-100/70 transition-all flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-1.5 mb-1.5 flex-wrap">
              <div className="flex items-center gap-1.5">
                <IconChip icon={<ShieldAlert className="w-3.5 h-3.5 shrink-0" />} color="rose" size="sm" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#2B3342] font-mono-data">
                  Primary Risk Factor
                </span>
              </div>
              <StatusBadge
                label={`${riskScores.bucket} Risk`}
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
            <div className="text-sm font-bold text-[#101828] font-heading leading-snug" title={riskScores.primaryDriver}>
              {riskScores.primaryDriver}
            </div>
          </div>
          <div className="text-[11px] text-[#2B3342] font-mono-data mt-2 pt-2 border-t border-slate-200/80">
            Weather & Congestion: Normal
          </div>
        </div>

        {/* 6. Contract Strategy */}
        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 shadow-2xs hover:border-slate-300 hover:bg-slate-100/70 transition-all flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 mb-1.5 flex-wrap">
              <div className="flex items-center gap-2">
                <IconChip icon={<FileCheck className="w-3.5 h-3.5" />} color="sky" size="sm" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#2B3342] font-mono-data">
                  Contract Strategy
                </span>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded-md bg-[#0B5D63] text-white border border-[#0B5D63]/80 font-bold font-mono-data shrink-0 shadow-xs">
                {contractComparison.recommendedStrategy === 'Spot' ? 'Spot Fixture' : `${contractComparison.savingsPercent}% Savings`}
              </span>
            </div>
            <div className="text-sm font-bold text-[#101828] font-heading leading-snug">
              Recommended: {contractComparison.recommendedStrategy}
            </div>
          </div>
          <div className="text-[11px] text-[#2B3342] font-mono-data mt-2 pt-2 border-t border-slate-200/80">
            {contractComparison.recommendedStrategy === 'Spot'
              ? `${contractComparison.savingsPercent}% cheaper than Multi-Voyage`
              : `Save ~${savingsFormatted} vs Spot baseline`}
          </div>
        </div>
      </div>

      {/* Low Reliability Banner (Conditional) */}
      {isLowConfidence && (
        <div className="mb-5 p-4 rounded-xl bg-[#F59E0B]/20 border border-[#F59E0B]/35 flex items-start gap-3 text-[#101828]">
          <AlertTriangle className="w-5 h-5 text-[#A36907] shrink-0 mt-0.5" />
          <div className="text-xs sm:text-sm">
            <span className="font-bold">Elevated Market Uncertainty Detected: </span>
            Forecast reliability indicator is at {forecast.confidenceScore}%. Consider hedging with a split fixture (50% spot tonnage today / 50% multiple-voyage parcel in 10 days).
          </div>
        </div>
      )}

      {/* Explainable AI Reasoning */}
      <div className="pt-4 border-t border-slate-200/80">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-[11px] font-bold uppercase tracking-wider text-[#2B3342] font-mono-data">
            Explainable AI Reasoning & Audit Trail
          </span>
        </div>
        <div className="space-y-2.5">
          {keyReasons.map((reason, index) => (
            <div key={index} className="flex items-start gap-2.5 text-xs sm:text-sm text-[#101828] leading-relaxed">
              <span className="w-5 h-5 rounded-full bg-[#101828] text-[#0EA5E9] flex items-center justify-center shrink-0 mt-0.5 shadow-xs border border-[#101828]">
                <Check className="w-3.5 h-3.5 stroke-[3]" />
              </span>
              <span className="font-sans">{reason}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Action Footnotes */}
      {showActions && (
        <div className="mt-5 pt-4 border-t border-slate-200/80 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-[#2B3342] font-mono-data">
            <span className="w-2 h-2 rounded-full bg-[#12883E] animate-pulse"></span>
            <span>Live voyage recalculation active</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('what-if')}
              className="px-3.5 py-2 rounded-xl text-xs font-semibold text-[#101828] bg-slate-50 hover:bg-slate-100 border border-slate-200/80 shadow-xs transition-colors cursor-pointer"
            >
              Simulate What-If
            </button>
            <button
              onClick={() => setActiveTab('reports')}
              className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-[#101828] hover:bg-[#0B5D63] border border-[#101828] shadow-sm transition-all flex items-center gap-1.5 group cursor-pointer"
            >
              <span>View Executive Report</span>
              <ArrowRight className="w-3.5 h-3.5 text-[#0EA5E9] group-hover:text-white transition-colors" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
