import React from 'react';
import { useCharter, NavigationTab } from '../context/CharterContext';
import { CharterMindLogo } from './common/CharterMindLogo';
import {
  Menu,
  Bell,
  Sparkles,
  Compass,
  ArrowRight,
  TrendingUp,
  DollarSign,
  IndianRupee,
  Ship,
  FileDown,
  LogOut,
  User,
} from 'lucide-react';

interface HeaderProps {
  onToggleMobileMenu: () => void;
}

const tabTitles: Record<NavigationTab, { title: string; subtitle: string }> = {
  dashboard: {
    title: 'Charter Decision Dashboard',
    subtitle: 'Unified AI freight intelligence, vessel scoring, and risk radar overview',
  },
  'voyage-planner': {
    title: 'Voyage Planner & Requirement Input',
    subtitle: 'Define cargo specs, delivery windows, and optimization goals',
  },
  'freight-forecast': {
    title: 'Freight Rate Forecasting & AI Attribution',
    subtitle: 'Predictive 60-day Baltic corridor trajectory with explainable feature impacts',
  },
  'vessel-optimizer': {
    title: 'AI Vessel Optimizer & Class Ranking',
    subtitle: 'Multi-criteria deadweight matching, draft clearance, and fuel efficiency scoring',
  },
  'port-intelligence': {
    title: 'Port Intelligence & Compatibility Matrix',
    subtitle: 'Live terminal constraints, berthing queue wait times, and handling ratings',
  },
  'cost-idle': {
    title: 'Total Voyage Cost & Idle-Time Ledger',
    subtitle: 'Granular freight, port fee, stevedoring, and demurrage cost breakdown',
  },
  'risk-engine': {
    title: 'Maritime Risk Engine & Freight Radar',
    subtitle: 'Five-dimensional risk decomposition across market, port, weather, vessel, and cargo',
  },
  'what-if': {
    title: 'What-If Dynamic Scenario Simulator',
    subtitle: 'Stress-test voyage economics with live congestion, weather, and rate sensitivity',
  },
  'contract-advisor': {
    title: 'Spot vs. Multiple-Voyage Contract Advisor',
    subtitle: 'Hedging volume discounts, COA commitments, and risk exposure comparison',
  },
  alerts: {
    title: 'Live Alerts & Operational Advisories',
    subtitle: 'Critical port queues, freight spike notices, and weather warnings',
  },
  reports: {
    title: 'Executive AI Decision Report',
    subtitle: 'Printable executive summary and charter party justification audit trail',
  },
};

const solidButtonStyle =
  'p-2 rounded-xl text-[#334155] hover:text-[#0F172A] hover:bg-slate-100 border border-slate-200 bg-white shadow-2xs transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0EA5E9] focus-visible:ring-offset-2';

export const Header: React.FC<HeaderProps> = ({ onToggleMobileMenu }) => {
  const {
    activeTab,
    setActiveTab,
    cargoRequest,
    selectedPort,
    alerts,
    currencyUnit,
    setCurrencyUnit,
    user,
    logout,
  } = useCharter();

  const currentInfo = tabTitles[activeTab] || tabTitles.dashboard;

  const activeAlertsCount = (alerts || []).filter((a: any) => !a.dismissed).length;

  return (
    <header className="sticky top-0 z-50 bg-white shadow-xs border-b border-slate-200 px-4 sm:px-8 py-3.5 flex items-center justify-between transition-all">
      {/* Left: Mobile Menu & Page Title */}
      <div className="flex items-center gap-3 sm:gap-4 min-w-0">
        <button
          onClick={onToggleMobileMenu}
          className={`${solidButtonStyle} lg:hidden`}
          aria-label="Open Sidebar Menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Mobile Header Logo */}
        <div className="lg:hidden shrink-0 flex items-center">
          <CharterMindLogo variant="icon" size="sm" animated={false} />
        </div>

        <div className="min-w-0">
          <h1 className="text-base sm:text-xl font-bold font-heading text-[#101828] tracking-tight truncate">
            {currentInfo.title}
          </h1>
          <p className="text-[11px] sm:text-xs text-[#64748B] truncate hidden sm:block font-sans">
            {currentInfo.subtitle}
          </p>
        </div>
      </div>

      {/* Right: Controls, Active Route Badge, Currency Toggle, & Actions */}
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        {/* Active Route Quick Chip */}
        <div className="hidden lg:flex items-center gap-1.5 xl:gap-2 px-2.5 xl:px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 shadow-2xs text-xs text-[#101828]">
          <Ship className="w-4 h-4 text-[#0284C7] shrink-0" />
          <span className="font-semibold truncate max-w-[85px] xl:max-w-none text-[#101828]">{cargoRequest.origin}</span>
          <ArrowRight className="w-3 h-3 text-[#94A3B8] shrink-0" strokeWidth={2.25} />
          <span className="font-semibold text-[#101828] truncate max-w-[85px] xl:max-w-none">{selectedPort.name.split(' ')[0]}</span>
          <span className="hidden xl:inline text-[11px] font-mono-data text-[#0284C7] font-bold">
            {cargoRequest.cargoQuantity.toLocaleString()} MT
          </span>
        </div>

        {/* Currency Toggle (USD / INR) - Solid Light Pill */}
        <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200 text-xs font-bold font-mono-data" role="group" aria-label="Currency selection">
          <button
            onClick={() => setCurrencyUnit('USD')}
            aria-pressed={currencyUnit === 'USD'}
            aria-label="Set currency to US Dollars"
            className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0EA5E9] ${
              currencyUnit === 'USD'
                ? 'bg-white text-[#0369A1] shadow-2xs border border-slate-200/80 font-bold'
                : 'text-[#64748B] hover:text-[#101828]'
            }`}
          >
            <span>USD</span>
          </button>
          <button
            onClick={() => setCurrencyUnit('INR')}
            aria-pressed={currencyUnit === 'INR'}
            aria-label="Set currency to Indian Rupees"
            className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0EA5E9] ${
              currencyUnit === 'INR'
                ? 'bg-white text-[#12883E] shadow-2xs border border-slate-200/80 font-bold'
                : 'text-[#64748B] hover:text-[#101828]'
            }`}
          >
            <span>INR (₹)</span>
          </button>
        </div>

        {/* Alerts Bell - Solid Button */}
        <button
          onClick={() => setActiveTab('alerts')}
          className={`relative ${solidButtonStyle}`}
          title="View Alerts & Risks"
          aria-label="View alerts and risks"
        >
          <Bell className="w-5 h-5 text-[#334155]" />
          {activeAlertsCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 bg-[#EB1515] text-white text-[10px] font-bold rounded-full flex items-center justify-center font-mono-data border-2 border-white shadow-xs">
              {activeAlertsCount > 99 ? '99+' : activeAlertsCount}
            </span>
          )}
        </button>

        {/* Primary Action Button */}
        {activeTab !== 'voyage-planner' ? (
          <button
            onClick={() => setActiveTab('voyage-planner')}
            className="px-3.5 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold text-white bg-[#0EA5E9] hover:bg-[#0284C7] shadow-xs transition-all flex items-center gap-1.5 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0EA5E9] focus-visible:ring-offset-2"
          >
            <Compass className="w-4 h-4 text-white" />
            <span className="hidden sm:inline font-sans">Plan Voyage</span>
            <span className="sm:hidden font-sans">Plan</span>
          </button>
        ) : (
          <button
            onClick={() => setActiveTab('reports')}
            className="px-3.5 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold text-[#101828] bg-white hover:bg-slate-50 border border-slate-200 shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0EA5E9] focus-visible:ring-offset-2"
          >
            <FileDown className="w-4 h-4 text-[#0284C7]" />
            <span className="hidden sm:inline font-sans">Reports</span>
          </button>
        )}

        {/* User Profile & Sign Out Controls */}
        {user && (
          <div className="flex items-center gap-1.5 pl-2 border-l border-slate-200">
            <div className="hidden xl:flex flex-col text-right">
              <span className="text-xs font-bold text-[#101828] truncate max-w-[130px] font-sans">
                {user.name}
              </span>
              <span className="text-[10px] text-[#64748B] truncate max-w-[130px] font-mono-data">
                {user.role.split('&')[0]}
              </span>
            </div>
            <button
              onClick={logout}
              className="p-2 rounded-xl text-[#64748B] hover:text-[#EF4444] hover:bg-red-50 border border-slate-200 bg-white shadow-2xs transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0EA5E9]"
              title={`Sign Out (${user.name})`}
              aria-label={`Sign out (${user.name})`}
            >
              <LogOut className="w-4 h-4" strokeWidth={2.25} />
            </button>
          </div>
        )}
      </div>
    </header>
  );
};

