import React, { useState } from 'react';
import { CharterProvider, useCharter } from './context/CharterContext';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { DashboardView } from './components/pages/DashboardView';
import { VoyagePlannerView } from './components/pages/VoyagePlannerView';
import { FreightForecastView } from './components/pages/FreightForecastView';
import { VesselOptimizerView } from './components/pages/VesselOptimizerView';
import { PortIntelligenceView } from './components/pages/PortIntelligenceView';
import { CostIdleView } from './components/pages/CostIdleView';
import { RiskEngineView } from './components/pages/RiskEngineView';
import { WhatIfSimulatorView } from './components/pages/WhatIfSimulatorView';
import { ContractAdvisorView } from './components/pages/ContractAdvisorView';
import { AlertsView } from './components/pages/AlertsView';
import { ReportsView } from './components/pages/ReportsView';
import { CharterMindLogo } from './components/common/CharterMindLogo';
import { AuthView } from './components/auth/AuthView';

const MainAppContent: React.FC = () => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { activeTab, isGenerating, isAuthenticated } = useCharter();

  // If user is not authenticated, render the premium Maritime Authentication Page
  if (!isAuthenticated) {
    return <AuthView />;
  }

  const renderActiveView = () => {
    switch (activeTab) {
      case 'dashboard':
        return <DashboardView />;
      case 'voyage-planner':
        return <VoyagePlannerView />;
      case 'freight-forecast':
        return <FreightForecastView />;
      case 'vessel-optimizer':
        return <VesselOptimizerView />;
      case 'port-intelligence':
        return <PortIntelligenceView />;
      case 'cost-idle':
        return <CostIdleView />;
      case 'risk-engine':
        return <RiskEngineView />;
      case 'what-if':
        return <WhatIfSimulatorView />;
      case 'contract-advisor':
        return <ContractAdvisorView />;
      case 'alerts':
        return <AlertsView />;
      case 'reports':
        return <ReportsView />;
      default:
        return <DashboardView />;
    }
  };

  return (
    <div className="relative min-h-screen bg-[#F0F4F8] flex text-[#101828] overflow-x-clip">
      {/* ========================================================================= */}
      {/* 1. GLOBAL MARITIME PORT & CARGO VESSEL BACKGROUND                         */}
      {/* Fixed behind application, visible through margins/gutters with light wash */}
      {/* ========================================================================= */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden select-none print:hidden">
        {/* Natural ocean & sky base gradient */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#1C3D5A] via-[#2A527A] to-[#0A1A2F]" />

        {/* High-resolution realistic commercial cargo vessel in full natural color */}
        <div className="absolute inset-0 flex items-center justify-center">
          <img
            src="https://images.unsplash.com/photo-1494412574643-ff11b0a5c1c3?auto=format&fit=crop&w=2600&q=85"
            alt="Commercial container cargo ship sailing on deep blue ocean near port"
            className="w-full h-full object-cover object-[center_38%] filter brightness-[0.98] contrast-[1.05]"
          />
        </div>

        {/* Ambient Maritime Atmospheric Orbs for rich color depth */}
        <div className="absolute top-[12%] left-[22%] w-96 h-96 rounded-full bg-[#38BDF8]/20 blur-3xl pointer-events-none" />
        <div className="absolute top-[45%] right-[15%] w-[420px] h-[420px] rounded-full bg-[#0284C7]/25 blur-3xl pointer-events-none" />
        <div className="absolute bottom-[8%] left-[35%] w-80 h-80 rounded-full bg-[#06B6D4]/20 blur-3xl pointer-events-none" />

        {/* Subtle vignette around bottom to maintain contrast */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#061424]/40 via-transparent 60% to-transparent pointer-events-none" />
      </div>


      {/* Fixed Solid White Sidebar */}
      <Sidebar mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} />

      {/* Main Content Area */}
      <div className="relative z-10 flex-1 lg:pl-68 flex flex-col min-w-0">
        {/* Sticky Solid White Header */}
        <Header onToggleMobileMenu={() => setMobileOpen(true)} />

        {/* Dynamic Page Container with solid cards */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8">
          {/* AI Generating Loading Overlay in Solid White Card */}
          {isGenerating ? (
            <div className="h-96 flex flex-col items-center justify-center text-center p-8 bg-white rounded-[20px] border border-slate-200/80 shadow-md">
              <div className="mb-6">
                <CharterMindLogo variant="stacked" size="xl" loading={true} />
              </div>
              <h3 className="text-xl font-bold font-heading text-[#101828]">
                Synthesizing Maritime Intelligence...
              </h3>
              <p className="text-xs sm:text-sm text-[#2B3342] mt-1.5 max-w-md font-sans font-medium">
                Recalibrating vessel draught tolerances, running 60-day Baltic freight regressions, and computing multi-factor risk scores.
              </p>
            </div>
          ) : (
            <div key={activeTab} className="animate-fade-in">
              {renderActiveView()}
            </div>
          )}
        </main>
      </div>
    </div>
  );

};

export default function App() {
  return (
    <CharterProvider>
      <MainAppContent />
    </CharterProvider>
  );
}
