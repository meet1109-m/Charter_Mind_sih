import React from 'react';
import { useCharter, NavigationTab } from '../context/CharterContext';
import { CharterMindLogo } from './common/CharterMindLogo';
import {
  LayoutDashboard,
  Compass,
  TrendingUp,
  Ship,
  Anchor,
  Calculator,
  ShieldAlert,
  Sliders,
  FileCheck,
  Bell,
  FileText,
  Sparkles,
  ChevronRight,
  LogOut,
  User,
} from 'lucide-react';

interface SidebarProps {
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
}

interface NavItemDef {
  id: NavigationTab;
  label: string;
  icon: React.ReactNode;
  badge?: string;
}

export const Sidebar: React.FC<SidebarProps> = ({ mobileOpen, setMobileOpen }) => {
  const { activeTab, setActiveTab, alerts, riskScores, cargoRequest, user, logout } = useCharter();

  // 1. Dynamic active alerts count (excluding dismissed alerts)
  const activeAlertsCount = (alerts || []).filter((a: any) => !a.dismissed).length;

  // 2. Dynamic high/critical risk factors count (sub-scores >= 70)
  const highRiskCount = riskScores
    ? [
        riskScores.marketRisk,
        riskScores.portRisk,
        riskScores.weatherRisk,
        riskScores.vesselRisk,
        riskScores.commodityRisk,
      ].filter((score) => typeof score === 'number' && score >= 70).length
    : 0;

  const navItems: NavItemDef[] = [
    { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="w-5 h-5" strokeWidth={2.25} /> },
    { id: 'voyage-planner', label: 'Voyage Planner', icon: <Compass className="w-5 h-5" strokeWidth={2.25} /> },
    { id: 'freight-forecast', label: 'Freight Forecast', icon: <TrendingUp className="w-5 h-5" strokeWidth={2.25} /> },
    { id: 'vessel-optimizer', label: 'Vessel Optimizer', icon: <Ship className="w-5 h-5" strokeWidth={2.25} /> },
    { id: 'port-intelligence', label: 'Port Intelligence', icon: <Anchor className="w-5 h-5" strokeWidth={2.25} /> },
    { id: 'cost-idle', label: 'Cost & Idle', icon: <Calculator className="w-5 h-5" strokeWidth={2.25} /> },
    {
      id: 'risk-engine',
      label: 'Risk Engine',
      icon: <ShieldAlert className="w-5 h-5" strokeWidth={2.25} />,
      badge: highRiskCount > 0 ? String(highRiskCount) : undefined,
    },
    { id: 'what-if', label: 'What-If Simulator', icon: <Sliders className="w-5 h-5" strokeWidth={2.25} /> },
    { id: 'contract-advisor', label: 'Contract Advisor', icon: <FileCheck className="w-5 h-5" strokeWidth={2.25} /> },
    {
      id: 'alerts',
      label: 'Alerts & Risks',
      icon: <Bell className="w-5 h-5" strokeWidth={2.25} />,
      badge: activeAlertsCount > 0 ? (activeAlertsCount > 99 ? '99+' : String(activeAlertsCount)) : undefined,
    },
    { id: 'reports', label: 'Decision Reports', icon: <FileText className="w-5 h-5" strokeWidth={2.25} /> },
  ];

  const handleSelect = (tab: NavigationTab) => {
    setActiveTab(tab);
    setMobileOpen(false);
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-50 bg-[#101828]/60 lg:hidden transition-opacity"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar Container: Crisp White Maritime Container */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 lg:z-40 w-68 bg-white border-r border-slate-200 shadow-sm flex flex-col transition-transform duration-300 ease-in-out lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0 z-[60]' : '-translate-x-full'
        }`}
      >
        {/* Brand Logo Header */}
        <div className="h-20 px-5 flex items-center border-b border-slate-200/80 bg-white">
          <CharterMindLogo variant="horizontal" size="md" animated={true} />
        </div>

        {/* Active Cargo Indicator Chip - Solid Light Card */}
        <div className="mx-4 my-3 p-3 rounded-2xl bg-slate-50 border border-slate-200 shadow-2xs flex items-center justify-between">
          <div className="min-w-0">
            <div className="text-[9px] uppercase font-bold text-[#0B5D63] tracking-widest font-mono-data">Active Fixture</div>
            <div className="text-xs font-bold text-[#101828] truncate font-sans">
              {cargoRequest.cargoQuantity.toLocaleString()} MT {cargoRequest.cargoType}
            </div>
            <div className="text-[11px] text-[#64748B] truncate font-mono-data">
              {cargoRequest.origin} → {cargoRequest.destinationPort}
            </div>
          </div>
          <button
            onClick={() => handleSelect('voyage-planner')}
            className="p-1.5 rounded-lg bg-white text-[#64748B] hover:text-[#101828] hover:bg-slate-100 shadow-2xs border border-slate-200 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0EA5E9]"
            title="Edit Voyage Parameters"
            aria-label="Edit voyage parameters"
          >
            <ChevronRight className="w-4 h-4 text-[#64748B]" strokeWidth={2.25} />
          </button>
        </div>

        {/* Navigation Items List */}
        <div className="flex-1 px-3 py-2 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleSelect(item.id)}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm transition-all duration-200 group text-left cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0EA5E9] focus-visible:ring-offset-2 ${
                  isActive
                    ? 'bg-[#0B5D63] text-white font-semibold shadow-xs'
                    : 'text-[#475467] hover:bg-slate-100 hover:text-[#101828] font-medium'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`transition-colors duration-200 ${
                      isActive ? 'text-white' : 'text-[#64748B] group-hover:text-[#101828]'
                    }`}
                  >
                    {item.icon}
                  </span>
                  <span className="font-medium">{item.label}</span>
                </div>

                {item.badge && (
                  <span
                    className={`text-[10px] font-bold min-w-5 px-1.5 py-0.5 rounded-md font-mono-data text-center ${
                      isActive
                        ? 'bg-white/25 text-white'
                        : item.id === 'alerts'
                        ? 'bg-[#EF4444] text-white'
                        : item.id === 'risk-engine'
                        ? 'bg-[#F97316] text-white'
                        : 'bg-slate-200/80 text-[#475467] border border-slate-200'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Footer AI Status Info & Active User Profile - Solid White/Light Card */}
        <div className="p-3 border-t border-slate-200/80 bg-slate-50/80 space-y-2">
          <div className="p-2.5 rounded-xl bg-white border border-slate-200 shadow-2xs flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-sky-50 text-[#0284C7] flex items-center justify-center border border-sky-100 shrink-0">
              <Sparkles className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-bold text-[#101828] truncate">Baltic & Port Feeds</div>
              <div className="text-[10px] text-[#12883E] font-semibold flex items-center gap-1.5 font-mono-data">
                <span className="w-1.5 h-1.5 rounded-full bg-[#12883E] animate-ping"></span>
                <span>Connected · Live</span>
              </div>
            </div>
          </div>

          {user && (
            <div className="p-2.5 rounded-xl bg-white border border-slate-200 shadow-2xs flex items-center justify-between">
              <div className="min-w-0 pr-2">
                <div className="text-xs font-bold text-[#101828] truncate font-sans">
                  {user.name}
                </div>
                <div className="text-[10px] text-[#64748B] truncate font-mono-data">
                  {user.role.split('&')[0]}
                </div>
              </div>
              <button
                onClick={logout}
                className="p-1.5 rounded-lg text-[#64748B] hover:text-[#EF4444] hover:bg-red-50 bg-slate-50 border border-slate-200 transition-colors cursor-pointer shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0EA5E9]"
                title="Sign Out"
                aria-label="Sign out"
              >
                <LogOut className="w-3.5 h-3.5" strokeWidth={2.25} />
              </button>
            </div>
          )}
        </div>
      </aside>

    </>
  );
};
