import React from 'react';
import { useCharter } from '../../context/CharterContext';
import { VESSEL_SPECS, VesselClassId } from '../../types';
import { IconChip } from '../common/IconChip';
import {
  formatFreightRate,
  formatMoney,
  formatHourlyRate,
  formatDailyRate,
  getDualCurrency,
} from '../../utils/currency';
import {
  Clock,
  Coins,
  ArrowUpRight,
  ArrowDownRight,
  Sparkles,
  Ship,
} from 'lucide-react';

export const CostIdleView: React.FC = () => {
  const {
    voyageCost,
    idlePrediction,
    cargoRequest,
    selectedVessel,
    setSelectedVesselId,
    selectedPort,
    currencyUnit,
  } = useCharter();

  const dualCost = getDualCurrency(voyageCost.totalCostUSD, currencyUnit);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Banner with Active Route Info & Sleek Vessel Class Switcher */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 p-4 sm:p-5 rounded-[20px] bg-white border border-slate-200/80 shadow-sm">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-[#0B5D63] font-mono-data bg-[#0B5D63]/10 px-2.5 py-0.5 rounded-md">
              Voyage Economics Engine
            </span>
            <span className="text-xs text-[#64748B] font-mono-data font-semibold">
              {cargoRequest.origin} → {selectedPort.name} ({cargoRequest.cargoQuantity.toLocaleString()} MT {cargoRequest.cargoType})
            </span>
          </div>
          <p className="text-xs sm:text-sm text-[#2B3342] font-sans">
            Itemized cost accounting across ocean freight rates, port tariffs, stevedoring handling, and quantified demurrage idle exposure.
          </p>
        </div>

        {/* Segmented Interactive Vessel Switcher */}
        <div className="flex flex-wrap sm:flex-nowrap items-center gap-1.5 p-1.5 bg-slate-100/90 rounded-2xl border border-slate-200/80 shrink-0">
          {Object.values(VESSEL_SPECS).map((v) => {
            const isSelected = selectedVessel.id === v.id;
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => setSelectedVesselId(v.id)}
                className={`flex-1 sm:flex-initial flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs transition-all duration-200 cursor-pointer text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0EA5E9] ${
                  isSelected
                    ? 'bg-[#101828] text-white shadow-xs font-bold'
                    : 'text-[#475467] hover:text-[#101828] hover:bg-white/80 font-medium'
                }`}
              >
                <Ship
                  className={`w-4 h-4 shrink-0 transition-colors ${
                    isSelected ? 'text-[#0EA5E9]' : 'text-[#64748B]'
                  }`}
                  strokeWidth={2.25}
                />
                <div className="leading-tight">
                  <div className="font-heading font-bold text-xs">{v.name.split(' ')[0]}</div>
                  <div
                    className={`text-[10px] font-mono-data ${
                      isSelected ? 'text-slate-300 font-semibold' : 'text-[#64748B]'
                    }`}
                  >
                    {Math.round(v.dwtMin / 1000)}k–{Math.round(v.dwtMax / 1000)}k DWT
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2-Column Layout: Cost Ledger (Left 7) + Idle-Time Engine (Right 5) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* LEFT 7 COLS: TOTAL VOYAGE COST LEDGER */}
        <div className="lg:col-span-7 rounded-[20px] bg-white p-5 sm:p-7 shadow-sm border border-slate-200/80 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 mb-4 pb-3 border-b border-slate-200/80">
              <div className="flex items-center gap-2.5">
                <IconChip icon={<Coins className="w-4 h-4 text-[#101828]" />} color="teal" size="sm" />
                <h3 className="text-base sm:text-lg font-bold font-heading text-[#101828]">
                  Itemized Voyage Expense Breakdown
                </h3>
              </div>
              <span className="text-xs font-bold font-mono-data text-[#101828] bg-slate-100 px-2.5 py-1 rounded-md border border-slate-200/80">
                {formatFreightRate(voyageCost.costPerMTUSD, currencyUnit)} Net
              </span>
            </div>

            {/* SEGMENTED PILL BAR */}
            <div className="mb-5">
              <div className="text-xs font-bold text-[#2B3342] mb-2 flex items-center justify-between font-mono-data">
                <span className="uppercase text-[10px] tracking-wider text-[#2B3342]">Cost Weight Distribution</span>
                <span className="text-[#2B3342]">Total Allocation: 100%</span>
              </div>
              <div className="h-3.5 rounded-full p-0.5 bg-slate-100 border border-slate-200/80 flex overflow-hidden gap-0.5">
                <div
                  className="h-full bg-[#101828] rounded-l-full transition-all duration-500"
                  style={{ width: `${voyageCost.percentages.freight}%` }}
                  title={`Ocean Freight: ${voyageCost.percentages.freight}%`}
                />
                <div
                  className="h-full bg-[#0EA5E9] transition-all duration-500"
                  style={{ width: `${voyageCost.percentages.port}%` }}
                  title={`Port Dues: ${voyageCost.percentages.port}%`}
                />
                <div
                  className="h-full bg-[#6366F1] transition-all duration-500"
                  style={{ width: `${voyageCost.percentages.handling}%` }}
                  title={`Handling: ${voyageCost.percentages.handling}%`}
                />
                <div
                  className="h-full bg-[#A36907] transition-all duration-500"
                  style={{ width: `${voyageCost.percentages.idle}%` }}
                  title={`Idle Time: ${voyageCost.percentages.idle}%`}
                />
                <div
                  className="h-full bg-[#EB1515] rounded-r-full transition-all duration-500"
                  style={{ width: `${voyageCost.percentages.risk}%` }}
                  title={`Demurrage Buffer: ${voyageCost.percentages.risk}%`}
                />
              </div>

              {/* Segmented Legend */}
              <div className="flex flex-wrap items-center gap-3 mt-2.5 text-[11px] font-mono-data">
                <span className="flex items-center gap-1.5 font-semibold text-[#101828]">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#101828]"></span> Freight ({voyageCost.percentages.freight}%)
                </span>
                <span className="flex items-center gap-1.5 font-semibold text-[#101828]">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#0EA5E9]"></span> Port Dues ({voyageCost.percentages.port}%)
                </span>
                <span className="flex items-center gap-1.5 font-semibold text-[#101828]">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#6366F1]"></span> Handling ({voyageCost.percentages.handling}%)
                </span>
                <span className="flex items-center gap-1.5 font-semibold text-[#101828]">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#A36907]"></span> Idle Wait ({voyageCost.percentages.idle}%)
                </span>
                <span className="flex items-center gap-1.5 font-semibold text-[#101828]">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#EB1515]"></span> Buffer ({voyageCost.percentages.risk}%)
                </span>
              </div>
            </div>

            {/* Granular Table Rows */}
            <div className="space-y-2 text-xs sm:text-sm">
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-200/80">
                <div>
                  <div className="font-bold text-[#101828] font-heading">1. Ocean Freight (Rate × Quantity)</div>
                  <div className="text-[11px] text-[#2B3342] font-mono-data">
                    {formatFreightRate(voyageCost.freightRatePerMT, currencyUnit)} × {cargoRequest.cargoQuantity.toLocaleString()} MT
                  </div>
                </div>
                <div className="text-right font-bold font-mono-data text-[#101828]">
                  {formatMoney(voyageCost.freightCostUSD, currencyUnit)}
                </div>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-200/80">
                <div>
                  <div className="font-bold text-[#101828] font-heading">2. Port & Conservancy Charges</div>
                  <div className="text-[11px] text-[#2B3342] font-mono-data">
                    Tariffs at {selectedPort.name}
                  </div>
                </div>
                <div className="text-right font-bold font-mono-data text-[#101828]">
                  {formatMoney(voyageCost.portChargesUSD, currencyUnit)}
                </div>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-200/80">
                <div>
                  <div className="font-bold text-[#101828] font-heading">3. Cargo Loading & Discharging Handling</div>
                  <div className="text-[11px] text-[#2B3342] font-mono-data">
                    {formatFreightRate(selectedPort.cargoHandlingCostPerMT, currencyUnit)} stevedoring handling rate
                  </div>
                </div>
                <div className="text-right font-bold font-mono-data text-[#101828]">
                  {formatMoney(voyageCost.loadingDischargeCostUSD, currencyUnit)}
                </div>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-200/80">
                <div>
                  <div className="font-bold text-[#101828] font-heading">4. Estimated Idle / Anchorage Waiting Cost</div>
                  <div className="text-[11px] text-[#2B3342] font-mono-data">
                    {idlePrediction.expectedIdleHours} hrs × {formatHourlyRate(selectedVessel.hourlyRate, currencyUnit)}
                  </div>
                </div>
                <div className="text-right font-bold font-mono-data text-[#A36907]">
                  {formatMoney(voyageCost.idleWaitingCostUSD, currencyUnit)}
                </div>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-200/80">
                <div>
                  <div className="font-bold text-[#101828] font-heading">5. Quantified Demurrage / Delay Exposure</div>
                  <div className="text-[11px] text-[#2B3342] font-mono-data">
                    Demurrage rate {formatDailyRate(selectedVessel.demurrageRatePerDay, currencyUnit)} buffer
                  </div>
                </div>
                <div className="text-right font-bold font-mono-data text-[#EB1515]">
                  {formatMoney(voyageCost.delayDemurrageExposureUSD, currencyUnit)}
                </div>
              </div>
            </div>
          </div>

          {/* TOTAL ROW */}
          <div className="mt-5 p-4 rounded-xl bg-slate-50 border-2 border-slate-300 flex items-center justify-between shadow-xs">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#2B3342] font-mono-data">
                Estimated Total Voyage Budget
              </div>
              <div className="text-xs text-[#2B3342] font-mono-data mt-0.5">
                Equivalent: <span className="font-semibold text-[#101828]">{dualCost.secondary}</span>
              </div>
            </div>

            <div className="text-right">
              <div className="text-2xl sm:text-3xl font-bold font-mono-data text-[#101828]">
                {dualCost.primary}
              </div>
              <div className="text-xs font-bold font-mono-data text-[#12883E]">
                {formatFreightRate(voyageCost.costPerMTUSD, currencyUnit)} all-in
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT 5 COLS: IDLE-TIME PREDICTION ENGINE */}
        <div className="lg:col-span-5 rounded-[20px] bg-white p-5 sm:p-7 shadow-sm border border-slate-200/80 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-200/80">
              <IconChip icon={<Clock className="w-4 h-4 text-[#101828]" />} color="amber" size="sm" />
              <h3 className="text-base sm:text-lg font-bold font-heading text-[#101828]">
                Idle-Time & Berthing Turnaround Predictor
              </h3>
            </div>

            {/* BOLD READOUT */}
            <div className="my-3 p-5 rounded-2xl bg-slate-50 border border-slate-200/80 text-center">
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#2B3342] mb-1 font-mono-data">
                Expected Total Idle Buffer
              </div>
              <div className="text-3xl sm:text-4xl font-bold font-heading text-[#101828] my-1 tracking-tight">
                {idlePrediction.expectedIdleHours}{' '}
                <span className="text-lg sm:text-xl font-bold text-[#2B3342]">hrs</span>
              </div>
              <div className="text-xs font-semibold text-[#2B3342] font-mono-data">
                ~{(idlePrediction.expectedIdleHours / 24).toFixed(1)} Days turnaround at {selectedPort.name}
              </div>
              <div className="mt-2.5 inline-block px-3 py-1 rounded-md bg-white text-xs font-bold text-[#12883E] border border-slate-200/80 shadow-xs font-mono-data">
                Idle Expense: {formatMoney(idlePrediction.idleCostUSD, currencyUnit)}
              </div>
            </div>

            {/* Attribution Factors */}
            <div className="space-y-2 mt-4">
              <div className="text-[10px] font-bold text-[#2B3342] uppercase tracking-wider font-mono-data">
                Turnaround Sensitivity Breakdown
              </div>
              {idlePrediction.factors.map((factor, index) => {
                const isUp = factor.direction === 'up';
                return (
                  <div
                    key={index}
                    className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/80 flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span
                        className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 text-white ${
                          isUp ? 'bg-[#EB1515]' : 'bg-[#12883E]'
                        }`}
                      >
                        {isUp ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                      </span>
                      <span className="font-semibold text-[#101828] font-heading">{factor.name}</span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-md font-mono-data ${
                          factor.impact === 'High'
                            ? 'bg-[#EB1515]/15 text-[#EB1515] border border-[#EB1515]/30'
                            : factor.impact === 'Medium'
                            ? 'bg-[#A36907]/15 text-[#A36907] border border-[#A36907]/30'
                            : 'bg-[#12883E]/15 text-[#12883E] border border-[#12883E]/30'
                        }`}
                      >
                        {factor.impact}
                      </span>
                      <span className="font-bold font-mono-data text-[#101828]">
                        {isUp ? '+' : '-'}
                        {factor.hours}h
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-5 pt-3 border-t border-slate-200/80 text-[11px] text-[#2B3342] font-mono-data flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-[#0EA5E9]" />
            <span>Idle parameters update live in What-If Simulator</span>
          </div>
        </div>
      </div>
    </div>
  );
};
