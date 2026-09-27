import React, { createContext, useContext, useState, useMemo, useEffect, useCallback } from 'react';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
  updateProfile,
  sendPasswordResetEmail,
  User as FirebaseUser,
} from 'firebase/auth';
import { auth } from '../utils/firebase';

import {
  syncUserToFirestore,
  saveUserPlanToFirestore,
  getUserPlanFromFirestore,
} from '../utils/userService';
import {
  createCargoRequest,
  generateVoyagePlan,
  getVoyagePlans,
  fetchQuickForecast,
  evaluateVoyage,
  VoyageEvaluationPayload,
} from '../utils/api';
import {
  CargoRequest,
  VesselSpec,
  PortSpec,
  VesselScoreBreakdown,
  VoyageCostBreakdown,
  IdlePredictionResult,
  RiskEngineResult,
  ForecastResult,
  OptimalCharterWindowResult,
  ContractComparisonResult,
  SimulatorOverrides,
  AlertItem,
  DestinationPort,
  VesselClassId,
  AuthUser,
} from '../types';
import {
  VESSEL_SPECS,
  PORT_SPECS,
  ROUTE_BASELINE_RATES,
  recommendVessels,
  calculateVoyageCost,
  predictIdleTime,
  calculateRiskScores,
  generateForecast,
  determineOptimalWindow,
  compareContracts,
} from '../services/maritimeEngine';

export type NavigationTab =
  | 'dashboard'
  | 'voyage-planner'
  | 'freight-forecast'
  | 'vessel-optimizer'
  | 'port-intelligence'
  | 'cost-idle'
  | 'risk-engine'
  | 'what-if'
  | 'contract-advisor'
  | 'alerts'
  | 'reports';

export interface SavedVoyagePlan {
  id: string;
  cargo_request_id: string;
  recommended_vessel_class: string;
  final_vessel_class: string;
  vessel_score: number;
  freight_cost_usd: number;
  total_cost_usd: number;
  total_cost_inr: number;
  cost_per_mt_usd: number;
  freight_rate_per_mt: number;
  expected_idle_hours: number;
  risk_score_overall: number;
  risk_bucket: string;
  created_at: string;
  cargo_request?: any;
}

interface CharterContextType {
  // Navigation & UI
  activeTab: NavigationTab;
  setActiveTab: (tab: NavigationTab) => void;
  isGenerating: boolean;
  
  // Inputs & Shared State
  cargoRequest: CargoRequest;
  setCargoRequest: React.Dispatch<React.SetStateAction<CargoRequest>>;
  selectedPort: PortSpec;
  setSelectedPortId: (portId: DestinationPort) => void;
  selectedVessel: VesselSpec;
  setSelectedVesselId: (vesselId: VesselClassId) => void;
  
  // Simulator Controls
  simulatorOverrides: SimulatorOverrides;
  setSimulatorOverrides: React.Dispatch<React.SetStateAction<SimulatorOverrides>>;
  resetSimulatorOverrides: () => void;
  
  // Forecast Controls
  forecastHorizon: 7 | 14 | 30 | 60;
  setForecastHorizon: (h: 7 | 14 | 30 | 60) => void;
  
  // Derived / Calculated Results
  vesselRecommendations: VesselScoreBreakdown[];
  topVesselBreakdown: VesselScoreBreakdown;
  idlePrediction: IdlePredictionResult;
  riskScores: RiskEngineResult;
  voyageCost: VoyageCostBreakdown;
  forecast: ForecastResult;
  optimalWindow: OptimalCharterWindowResult;
  contractComparison: ContractComparisonResult;
  
  // Alerts Feed
  alerts: AlertItem[];
  dismissAlert: (id: string) => void;
  
  // Actions
  generateRecommendation: (updatedRequest?: CargoRequest) => void;
  currencyUnit: 'USD' | 'INR';
  setCurrencyUnit: (unit: 'USD' | 'INR') => void;

  // Backend Saved Plans
  savedPlans: SavedVoyagePlan[];
  fetchSavedPlans: () => Promise<void>;
  saveVoyagePlan: () => Promise<{ success: boolean; plan?: SavedVoyagePlan; error?: string }>;

  // Authentication State & Actions
  user: AuthUser | null;
  isAuthenticated: boolean;
  login: (email: string, password?: string, remember?: boolean, customUser?: Partial<AuthUser>) => Promise<{ success: boolean; error?: string }>;
  signup: (data: { name: string; email: string; company: string; role: string; password?: string }, remember?: boolean) => Promise<{ success: boolean; error?: string }>;
  loginWithGoogle: () => Promise<{ success: boolean; error?: string }>;
  forgotPassword: (email: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
}

const DEFAULT_CARGO_REQUEST: CargoRequest = {
  cargoType: 'Coal',
  cargoQuantity: 75000,
  origin: 'Indonesia',
  destinationPort: 'Paradip',
  requiredDeliveryDate: '2026-04-15',
  loadingWindowStart: '2026-03-24',
  loadingWindowEnd: '2026-03-29',
  dischargeWindowStart: '2026-04-10',
  dischargeWindowEnd: '2026-04-15',
  preferredVesselType: 'Let AI decide',
  maxAcceptableFreight: 14.5,
  numberOfVoyages: 1,
  contractDuration: 'Single voyage',
  priority: 'Balanced',
};

const DEFAULT_SIMULATOR_OVERRIDES: SimulatorOverrides = {
  congestion: 'Medium',
  weather: 'Normal',
  freightRateOffsetPercent: 0,
  vesselAvailability: 'Available',
};

const INITIAL_ALERTS: AlertItem[] = [
  {
    id: 'alt-1',
    type: 'warning',
    title: 'Paradip & Haldia Anchorage Queue Congestion',
    message: '18 dry bulk carriers waiting at Paradip outer anchorage; average berthing turnaround wait extended by +16 hours due to coastal thermal coal unloading priority.',
    timestamp: '12m ago',
    impactMetric: '+16 hrs idle exposure',
    actionRequired: true,
  },
  {
    id: 'alt-2',
    type: 'danger',
    title: 'Singapore Marine Bunker Spot Price Surge (+$22/MT)',
    message: 'VLSFO benchmark bunker quotes at Singapore bunkering hub reached $615/MT (+3.7%), adding approx. +$0.55/MT to prompt Indonesia-to-India voyage OPEX.',
    timestamp: '45m ago',
    impactMetric: '+3.7% fuel escalation',
    actionRequired: true,
  },
  {
    id: 'alt-3',
    type: 'info',
    title: 'Dhamra Deepwater Berth CQ-1 Prompt Availability',
    message: 'Mechanized berth CQ-1 (18.5m draught) confirmed clear for direct Capesize berthing with zero anchorage queue for next 5-day laycan.',
    timestamp: '2h ago',
    impactMetric: 'Save ~₹19.2L idle cost',
  },
  {
    id: 'alt-4',
    type: 'success',
    title: 'AI Contract Strategy: Multi-Voyage COA Lock-In',
    message: 'Securing a 3-voyage Contract of Affreightment (COA) locks in a 6.5% rate hedge against anticipated pre-monsoon rate spikes.',
    timestamp: '3h ago',
    impactMetric: '₹38.4L hedged savings',
  },
  {
    id: 'alt-5',
    type: 'warning',
    title: 'IMD Coastal Weather & Sea-State Advisory',
    message: 'Indian Meteorological Department issued rough sea advisory for Southwest Bay of Bengal; pilotage at Sandheads/Haldia restricted to daylight hours.',
    timestamp: '4h ago',
    impactMetric: 'Weather Risk +18%',
  },
];

const CharterContext = createContext<CharterContextType | undefined>(undefined);

export const CharterProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeTab, setActiveTab] = useState<NavigationTab>('voyage-planner');
  const [isGenerating, setIsGenerating] = useState(false);
  // Persistent Currency Unit
  const [currencyUnit, setCurrencyUnit] = useState<'USD' | 'INR'>(() => {
    try {
      const saved = localStorage.getItem('chartermind_currency_unit');
      if (saved === 'USD' || saved === 'INR') return saved;
    } catch {}
    return 'USD';
  });

  const [forecastHorizon, setForecastHorizon] = useState<7 | 14 | 30 | 60>(30);

  // Authentication State with persistent storage detection
  const [user, setUser] = useState<AuthUser | null>(() => {
    try {
      const storedLocal = localStorage.getItem('chartermind_auth_user');
      if (storedLocal) return JSON.parse(storedLocal);
      const storedSession = sessionStorage.getItem('chartermind_auth_user');
      if (storedSession) return JSON.parse(storedSession);
    } catch {
      // Storage access fallback
    }
    return null;
  });

  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    try {
      const storedLocal = localStorage.getItem('chartermind_auth_user');
      const storedSession = sessionStorage.getItem('chartermind_auth_user');
      return !!(storedLocal || storedSession);
    } catch {
      return false;
    }
  });

  // Persistent Cargo Request (Preserved across browser refreshes)
  const [cargoRequest, setCargoRequest] = useState<CargoRequest>(() => {
    try {
      const saved = localStorage.getItem('chartermind_cargo_request');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object' && parsed.origin && parsed.destinationPort) {
          return { ...DEFAULT_CARGO_REQUEST, ...parsed };
        }
      }
    } catch {}
    return DEFAULT_CARGO_REQUEST;
  });

  const [selectedPortId, setSelectedPortIdState] = useState<DestinationPort>(() => {
    try {
      const saved = localStorage.getItem('chartermind_cargo_request');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed?.destinationPort && (parsed.destinationPort in PORT_SPECS)) {
          return parsed.destinationPort;
        }
      }
    } catch {}
    return 'Paradip';
  });

  const [selectedVesselId, setSelectedVesselIdState] = useState<VesselClassId>(() => {
    try {
      const saved = localStorage.getItem('chartermind_selected_vessel_id');
      if (saved && (saved in VESSEL_SPECS)) {
        return saved as VesselClassId;
      }
    } catch {}
    return 'panamax';
  });

  const [simulatorOverrides, setSimulatorOverrides] = useState<SimulatorOverrides>(DEFAULT_SIMULATOR_OVERRIDES);
  const [alerts, setAlerts] = useState<AlertItem[]>(INITIAL_ALERTS);
  const [savedPlans, setSavedPlans] = useState<SavedVoyagePlan[]>([]);

  // Synchronize port when cargoRequest destination changes
  useEffect(() => {
    setSelectedPortIdState(cargoRequest.destinationPort);
  }, [cargoRequest.destinationPort]);

  // Persist cargoRequest to localStorage & Firestore whenever updated
  useEffect(() => {
    try {
      localStorage.setItem('chartermind_cargo_request', JSON.stringify(cargoRequest));
      if (user?.id && !user.id.startsWith('demo-')) {
        saveUserPlanToFirestore(user.id, cargoRequest);
      }
    } catch (err) {
      console.warn('Could not persist cargo request:', err);
    }
  }, [cargoRequest, user?.id]);

  // Persist selected vessel class
  useEffect(() => {
    try {
      localStorage.setItem('chartermind_selected_vessel_id', selectedVesselId);
    } catch {}
  }, [selectedVesselId]);

  // Persist currency preference
  useEffect(() => {
    try {
      localStorage.setItem('chartermind_currency_unit', currencyUnit);
    } catch {}
  }, [currencyUnit]);


  const selectedPort = PORT_SPECS[selectedPortId] || PORT_SPECS.Paradip;
  const selectedVessel = VESSEL_SPECS[selectedVesselId] || VESSEL_SPECS.panamax;

  const setSelectedPortId = (portId: DestinationPort) => {
    setSelectedPortIdState(portId);
    setCargoRequest((prev) => ({ ...prev, destinationPort: portId }));
  };

  const setSelectedVesselId = (vesselId: VesselClassId) => {
    setSelectedVesselIdState(vesselId);
  };

  const resetSimulatorOverrides = () => {
    setSimulatorOverrides(DEFAULT_SIMULATOR_OVERRIDES);
  };

  // 1. Vessel Ranking & Recommendation State (Booted instantly with local algorithm, synchronized with Python backend)
  const [vesselRecommendations, setVesselRecommendations] = useState<VesselScoreBreakdown[]>(() => {
    return recommendVessels(cargoRequest, selectedPort, simulatorOverrides);
  });

  const [topVesselBreakdown, setTopVesselBreakdown] = useState<VesselScoreBreakdown>(() => {
    const recs = recommendVessels(cargoRequest, selectedPort, simulatorOverrides);
    return recs[0] || recommendVessels(cargoRequest, selectedPort)[0];
  });

  // 2. Risk Engine State
  const [riskScores, setRiskScores] = useState<RiskEngineResult>(() => {
    return calculateRiskScores(cargoRequest, selectedVessel, selectedPort, simulatorOverrides);
  });

  // 3. Idle Time Prediction State
  const [idlePrediction, setIdlePrediction] = useState<IdlePredictionResult>(() => {
    const recs = recommendVessels(cargoRequest, selectedPort, simulatorOverrides);
    const compat = recs[0]?.compatibility;
    const congestion = simulatorOverrides.congestion || selectedPort.congestion;
    const weather = simulatorOverrides.weather || 'Normal';
    return predictIdleTime(selectedPort, selectedVessel, weather, congestion, compat);
  });

  // 4. Voyage Cost State
  const [voyageCost, setVoyageCost] = useState<VoyageCostBreakdown>(() => {
    const recs = recommendVessels(cargoRequest, selectedPort, simulatorOverrides);
    const compat = recs[0]?.compatibility;
    const congestion = simulatorOverrides.congestion || selectedPort.congestion;
    const weather = simulatorOverrides.weather || 'Normal';
    const idle = predictIdleTime(selectedPort, selectedVessel, weather, congestion, compat);
    const risk = calculateRiskScores(cargoRequest, selectedVessel, selectedPort, simulatorOverrides);
    return calculateVoyageCost(cargoRequest, selectedVessel, selectedPort, idle, risk, simulatorOverrides);
  });

  // 5. Freight Forecast Series State
  const [forecast, setForecast] = useState<ForecastResult>(() => {
    const route = `${cargoRequest.origin} → ${selectedPort.name}`;
    const baseRate = ROUTE_BASELINE_RATES[cargoRequest.origin]?.[cargoRequest.destinationPort] || 18.0;
    return generateForecast(
      route,
      baseRate,
      forecastHorizon,
      simulatorOverrides,
      selectedVessel.name,
      cargoRequest.cargoType
    );
  });

  // 6. Optimal Charter Window Advisory State
  const [optimalWindow, setOptimalWindow] = useState<OptimalCharterWindowResult>(() => {
    const route = `${cargoRequest.origin} → ${selectedPort.name}`;
    const baseRate = ROUTE_BASELINE_RATES[cargoRequest.origin]?.[cargoRequest.destinationPort] || 18.0;
    const initialForecast = generateForecast(
      route,
      baseRate,
      forecastHorizon,
      simulatorOverrides,
      selectedVessel.name,
      cargoRequest.cargoType
    );
    const initialRisk = calculateRiskScores(cargoRequest, selectedVessel, selectedPort, simulatorOverrides);
    return determineOptimalWindow(initialForecast, cargoRequest, initialRisk);
  });

  // 7. Contract Strategy State
  const [contractComparison, setContractComparison] = useState<ContractComparisonResult>(() => {
    const recs = recommendVessels(cargoRequest, selectedPort, simulatorOverrides);
    const compat = recs[0]?.compatibility;
    const congestion = simulatorOverrides.congestion || selectedPort.congestion;
    const weather = simulatorOverrides.weather || 'Normal';
    const idle = predictIdleTime(selectedPort, selectedVessel, weather, congestion, compat);
    const risk = calculateRiskScores(cargoRequest, selectedVessel, selectedPort, simulatorOverrides);
    const cost = calculateVoyageCost(cargoRequest, selectedVessel, selectedPort, idle, risk, simulatorOverrides);
    return compareContracts(cargoRequest, selectedVessel, cost, risk);
  });

  // Synchronize with authoritative Python FastAPI backend (/api/v1/voyage/evaluate),
  // with debouncing for high-frequency slider adjustments and automatic graceful fallback to local engine.
  useEffect(() => {
    let isCancelled = false;
    const timer = setTimeout(async () => {
      try {
        const payload: VoyageEvaluationPayload = {
          cargo_type: cargoRequest.cargoType,
          cargo_quantity_mt: cargoRequest.cargoQuantity,
          origin_country: cargoRequest.origin,
          destination_port: cargoRequest.destinationPort,
          required_delivery_date: cargoRequest.requiredDeliveryDate,
          loading_window_start: cargoRequest.loadingWindowStart,
          loading_window_end: cargoRequest.loadingWindowEnd,
          discharge_window_start: cargoRequest.dischargeWindowStart,
          discharge_window_end: cargoRequest.dischargeWindowEnd,
          preferred_vessel_type: cargoRequest.preferredVesselType,
          priority: cargoRequest.priority,
          max_acceptable_freight: cargoRequest.maxAcceptableFreight,
          number_of_voyages: cargoRequest.numberOfVoyages,
          contract_duration: cargoRequest.contractDuration,
          selected_vessel_id: selectedVesselId,
          simulator_overrides: {
            congestion: simulatorOverrides.congestion,
            weather: simulatorOverrides.weather,
            freight_rate_offset_percent: simulatorOverrides.freightRateOffsetPercent,
            vessel_availability: simulatorOverrides.vesselAvailability,
          },
          horizon_days: forecastHorizon,
        };

        const res = await evaluateVoyage(payload, selectedPort);
        if (!isCancelled && res) {
          if (res.vesselRecommendations?.length) {
            setVesselRecommendations(res.vesselRecommendations);
          }
          if (res.topVesselBreakdown) {
            setTopVesselBreakdown(res.topVesselBreakdown);
            if (cargoRequest.preferredVesselType === 'Let AI decide') {
              setSelectedVesselIdState(res.topVesselBreakdown.vessel.id);
            }
          }
          if (res.riskScores) setRiskScores(res.riskScores);
          if (res.idlePrediction) setIdlePrediction(res.idlePrediction);
          if (res.voyageCost) setVoyageCost(res.voyageCost);
          if (res.contractComparison) setContractComparison(res.contractComparison);
          if (res.forecast) setForecast(res.forecast);
          if (res.optimalWindow) setOptimalWindow(res.optimalWindow);
        }
      } catch (err) {
        console.warn('[CharterContext] Backend evaluation API unreachable, running local calculation engine fallback:', err);
        if (!isCancelled) {
          const localVessels = recommendVessels(cargoRequest, selectedPort, simulatorOverrides);
          const localTop = localVessels[0] || localVessels[0];
          if (cargoRequest.preferredVesselType === 'Let AI decide' && localTop) {
            setSelectedVesselIdState(localTop.vessel.id);
          }
          const localRisk = calculateRiskScores(cargoRequest, selectedVessel, selectedPort, simulatorOverrides);
          const localIdle = predictIdleTime(
            selectedPort,
            selectedVessel,
            simulatorOverrides.weather,
            simulatorOverrides.congestion || selectedPort.congestion,
            localTop.compatibility
          );
          const localCost = calculateVoyageCost(
            cargoRequest,
            selectedVessel,
            selectedPort,
            localIdle,
            localRisk,
            simulatorOverrides
          );
          const localContract = compareContracts(cargoRequest, selectedVessel, localCost, localRisk);
          const route = `${cargoRequest.origin} → ${selectedPort.name}`;
          const localForecast = generateForecast(
            route,
            localCost.freightRatePerMT,
            forecastHorizon,
            simulatorOverrides,
            selectedVessel.name,
            cargoRequest.cargoType
          );
          const localWindow = determineOptimalWindow(localForecast, cargoRequest, localRisk);

          setVesselRecommendations(localVessels);
          setTopVesselBreakdown(localTop);
          setRiskScores(localRisk);
          setIdlePrediction(localIdle);
          setVoyageCost(localCost);
          setContractComparison(localContract);
          setForecast(localForecast);
          setOptimalWindow(localWindow);
        }
      }
    }, 150);

    return () => {
      isCancelled = true;
      clearTimeout(timer);
    };
  }, [
    cargoRequest,
    selectedPort,
    selectedVesselId,
    selectedVessel,
    simulatorOverrides,
    forecastHorizon,
  ]);

  const dismissAlert = (id: string) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
    apiDismissAlert(id).catch((err) => {
      console.warn('[CharterContext] Could not dismiss alert on backend:', err);
    });
  };

  const generateRecommendation = (updatedRequest?: CargoRequest) => {
    setIsGenerating(true);
    if (updatedRequest) {
      setCargoRequest(updatedRequest);
      setSelectedPortIdState(updatedRequest.destinationPort);
    }
    setTimeout(() => {
      setIsGenerating(false);
      setActiveTab('dashboard');
    }, 600);
  };

  // ==========================================================================
  // Backend Integration: Fetch and Save Voyage Plans
  // ==========================================================================
  const fetchSavedPlans = useCallback(async () => {
    try {
      const plans = await getVoyagePlans();
      if (Array.isArray(plans)) {
        setSavedPlans(plans);
      }
    } catch (err) {
      console.warn('[CharterContext] Could not fetch saved plans from backend:', err);
    }
  }, []);

  const saveVoyagePlan = async (): Promise<{ success: boolean; plan?: SavedVoyagePlan; error?: string }> => {
    try {
      // 1. Create or ensure cargo parcel exists in PostgreSQL
      const cargoPayload = {
        cargo_type: cargoRequest.cargoType,
        cargo_quantity_mt: cargoRequest.cargoQuantity,
        origin_country: cargoRequest.origin,
        destination_port: cargoRequest.destinationPort,
        required_delivery_date: cargoRequest.requiredDeliveryDate,
        loading_window_start: cargoRequest.loadingWindowStart,
        loading_window_end: cargoRequest.loadingWindowEnd,
        discharge_window_start: cargoRequest.dischargeWindowStart,
        discharge_window_end: cargoRequest.dischargeWindowEnd,
        preferred_vessel_type: cargoRequest.preferredVesselType,
        max_acceptable_freight: cargoRequest.maxAcceptableFreight,
        number_of_voyages: cargoRequest.numberOfVoyages,
        contract_duration: cargoRequest.contractDuration,
        priority: cargoRequest.priority,
      };

      const cargoRecord = await createCargoRequest(cargoPayload);
      const cargoId = cargoRecord.id;

      // 2. Generate and persist voyage plan
      const planPayload = {
        cargo_request_id: cargoId,
        simulator_overrides: simulatorOverrides,
        final_vessel_class: selectedVessel.name,
      };

      const planRecord = await generateVoyagePlan(planPayload);
      await fetchSavedPlans();

      return { success: true, plan: planRecord };
    } catch (err: any) {
      console.error('[CharterContext] Failed to persist voyage plan to backend:', err);
      return { success: false, error: err?.message || 'Failed to save voyage plan' };
    }
  };

  // ==========================================================================
  // Firebase Auth + Firestore User Sync
  // ==========================================================================

  // Helper: convert Firebase error codes into friendly messages
  const firebaseErrorMessage = (code: string, message?: string): string => {
    // Always log the raw error in DevTools for debugging
    console.error('[Firebase Auth Error]', { code, message });
    const map: Record<string, string> = {
      // Email/Password errors
      'auth/user-not-found':            'No account found with this email.',
      'auth/wrong-password':            'Incorrect password. Please try again.',
      'auth/invalid-credential':        'Invalid email or password.',
      'auth/email-already-in-use':      'An account with this email already exists. Please sign in instead.',
      'auth/weak-password':             'Password must be at least 6 characters.',
      'auth/invalid-email':             'Please enter a valid email address.',
      'auth/too-many-requests':         'Too many failed attempts. Please try again later.',
      'auth/user-disabled':             'This account has been disabled.',
      // Provider & Permission errors
      'auth/operation-not-allowed':     'Sign-in provider is not enabled. In Firebase Console, go to Authentication → Sign-in method and enable "Email/Password" and "Google".',
      'auth/popup-blocked':             'Popup was blocked — please allow popups for this site in your browser.',
      'auth/popup-closed-by-user':      'Sign-in was cancelled.',
      'auth/cancelled-popup-request':   'Sign-in was cancelled.',
      'auth/unauthorized-domain':       'This domain is not authorised in Firebase Console. Add "localhost" or your IP under Authentication → Settings → Authorised domains.',
      'auth/configuration-not-found':   'Firebase project not configured correctly. Check your .env Firebase keys.',
      'auth/internal-error':            'Firebase internal error. Check the browser console for details.',
      // Network
      'auth/network-request-failed':    'Network error. Check your internet connection.',
    };
    return map[code] ?? `Authentication failed (${code}). Check the browser console for details.`;
  };


  // Called after every successful Firebase sign-in to sync user data to Firestore
  const handleAuthUserSync = useCallback(async (
    firebaseUser: FirebaseUser,
    extra?: { name?: string; company?: string; role?: string }
  ) => {
    let profile: any = null;
    try {
      profile = await syncUserToFirestore(firebaseUser, extra);
    } catch (err) {
      console.warn('[CharterContext] Firestore user sync notice (check if Cloud Firestore is enabled in Firebase Console):', err);
    }

    const authUser: AuthUser = {
      id:        profile?.uid || firebaseUser.uid,
      name:      profile?.name || extra?.name || firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'Maritime User',
      email:     profile?.email || firebaseUser.email || '',
      company:   profile?.company || extra?.company || 'Maritime Logistics Corp',
      role:      profile?.role || extra?.role || 'Chartering Lead & Voyage Operations',
      avatarUrl: profile?.avatarUrl || firebaseUser.photoURL || undefined,
      createdAt: new Date().toISOString().split('T')[0],
    };

    setUser(authUser);
    setIsAuthenticated(true);
    localStorage.setItem('chartermind_auth_user', JSON.stringify(authUser));
    fetchSavedPlans();

    // Restore user's saved active plan from Firestore if available
    if (firebaseUser?.uid && !firebaseUser.uid.startsWith('demo-')) {
      getUserPlanFromFirestore(firebaseUser.uid).then((savedPlan) => {
        if (savedPlan && savedPlan.origin && savedPlan.destinationPort) {
          setCargoRequest((prev) => ({ ...prev, ...savedPlan }));
          setSelectedPortIdState(savedPlan.destinationPort);
        }
      });
    }
  }, [fetchSavedPlans]);


  // Watch Firebase auth state — runs once on mount
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        handleAuthUserSync(firebaseUser);
      } else {
        // Only reset if NOT currently in an active demo persona session
        const storedToken = localStorage.getItem('chartermind_token');
        if (!storedToken || !storedToken.startsWith('demo-')) {
          setUser(null);
          setIsAuthenticated(false);
          localStorage.removeItem('chartermind_auth_user');
          localStorage.removeItem('chartermind_token');
        }
      }
    });
    return () => unsubscribe();
  }, [handleAuthUserSync]);

  // Initial load: fetch saved plans if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      fetchSavedPlans();
    }
  }, [isAuthenticated, fetchSavedPlans]);

  // --- Login with Email / Password or 1-Click Demo Persona ---
  const login = async (
    email: string,
    password?: string,
    _remember: boolean = true,
    customUser?: Partial<AuthUser>
  ): Promise<{ success: boolean; error?: string }> => {
    if (!email) {
      return { success: false, error: 'Email is required.' };
    }

    // 1. Instant 1-Click Demo Persona Bypass (Capt. Aryan Mehta, Elena Rostova, Arjun Singhal)
    if (password === 'demo-auth-token' || customUser?.company || customUser?.role) {
      const demoToken = `demo-${email}`;
      localStorage.setItem('chartermind_token', demoToken);

      const demoUser: AuthUser = {
        id: customUser?.id || `demo-${email.split('@')[0]}`,
        name:
          customUser?.name ||
          email
            .split('@')[0]
            .replace(/[._]/g, ' ')
            .replace(/\b\w/g, (c) => c.toUpperCase()),
        email: email.trim().toLowerCase(),
        company: customUser?.company || 'Maritime Logistics Corp',
        role: customUser?.role || 'Chartering Lead & Voyage Operations',
        avatarUrl: customUser?.avatarUrl,
        createdAt: customUser?.createdAt || new Date().toISOString().split('T')[0],
      };

      setUser(demoUser);
      setIsAuthenticated(true);
      localStorage.setItem('chartermind_auth_user', JSON.stringify(demoUser));
      setActiveTab('voyage-planner');
      fetchSavedPlans();
      return { success: true };
    }

    // 2. Standard Firebase Email & Password Authentication
    if (!password) {
      return { success: false, error: 'Password is required.' };
    }
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      await handleAuthUserSync(cred.user);
      setActiveTab('voyage-planner');
      return { success: true };
    } catch (err: any) {
      return { success: false, error: firebaseErrorMessage(err.code, err.message) };
    }
  };


  // --- Sign Up with Email / Password ---
  const signup = async (
    data: { name: string; email: string; company: string; role: string; password?: string },
    _remember: boolean = true
  ): Promise<{ success: boolean; error?: string }> => {
    if (!data.name || data.name.trim().length < 2) {
      return { success: false, error: 'Please enter your full name.' };
    }
    if (!data.email || !data.email.includes('@')) {
      return { success: false, error: 'Please provide a valid email address.' };
    }
    if (!data.company || data.company.trim().length < 2) {
      return { success: false, error: 'Please specify your organization.' };
    }
    if (!data.password) {
      return { success: false, error: 'Password is required.' };
    }
    try {
      const cred = await createUserWithEmailAndPassword(auth, data.email, data.password);
      // Set display name in Firebase Auth
      await updateProfile(cred.user, { displayName: data.name });
      // Sync to Firestore with company & role
      await handleAuthUserSync(cred.user, {
        name:    data.name,
        company: data.company,
        role:    data.role,
      });
      setActiveTab('voyage-planner');
      return { success: true };
    } catch (err: any) {
      return { success: false, error: firebaseErrorMessage(err.code, err.message) };
    }
  };

  // --- Login with Google ---
  const loginWithGoogle = async (): Promise<{ success: boolean; error?: string }> => {
    try {
      const provider = new GoogleAuthProvider();
      provider.addScope('email');
      provider.addScope('profile');
      const cred = await signInWithPopup(auth, provider);
      await handleAuthUserSync(cred.user);
      setActiveTab('voyage-planner');
      return { success: true };
    } catch (err: any) {
      return { success: false, error: firebaseErrorMessage(err.code, err.message) };
    }
  };

  // --- Forgot Password (sends reset email via Firebase) ---
  const forgotPassword = async (email: string): Promise<{ success: boolean; error?: string }> => {
    if (!email || !email.includes('@')) {
      return { success: false, error: 'Please enter a valid email address.' };
    }
    try {
      await sendPasswordResetEmail(auth, email);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: firebaseErrorMessage(err.code) };
    }
  };

  // --- Logout ---
  const logout = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.warn('[CharterContext] Firebase signOut error:', err);
    }
    setUser(null);
    setIsAuthenticated(false);
    try {
      localStorage.removeItem('chartermind_auth_user');
      localStorage.removeItem('chartermind_token');
      localStorage.removeItem('chartermind_cargo_request');
      localStorage.removeItem('chartermind_selected_vessel_id');
      sessionStorage.removeItem('chartermind_auth_user');
      sessionStorage.removeItem('chartermind_token');
    } catch {
      // ignore storage errors
    }
    setCargoRequest(DEFAULT_CARGO_REQUEST);
    setSelectedPortIdState('Paradip');
    setSelectedVesselIdState('panamax');
    setActiveTab('voyage-planner');
  };


  const value: CharterContextType = {
    activeTab,
    setActiveTab,
    isGenerating,
    cargoRequest,
    setCargoRequest,
    selectedPort,
    setSelectedPortId,
    selectedVessel,
    setSelectedVesselId,
    simulatorOverrides,
    setSimulatorOverrides,
    resetSimulatorOverrides,
    forecastHorizon,
    setForecastHorizon,
    vesselRecommendations,
    topVesselBreakdown,
    idlePrediction,
    riskScores,
    voyageCost,
    forecast,
    optimalWindow,
    contractComparison,
    alerts,
    dismissAlert,
    generateRecommendation,
    currencyUnit,
    setCurrencyUnit,
    savedPlans,
    fetchSavedPlans,
    saveVoyagePlan,
    user,
    isAuthenticated,
    login,
    signup,
    loginWithGoogle,
    forgotPassword,
    logout,
  };

  return <CharterContext.Provider value={value}>{children}</CharterContext.Provider>;
};

export const useCharter = () => {
  const context = useContext(CharterContext);
  if (!context) {
    throw new Error('useCharter must be used within a CharterProvider');
  }
  return context;
};
