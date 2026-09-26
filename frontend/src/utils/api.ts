import { auth } from './firebase';
import {
  ForecastResult,
  OptimalCharterWindowResult,
  SimulatorOverrides,
  VesselScoreBreakdown,
  VesselSpec,
  PortCompatibilityResult,
  VoyageCostBreakdown,
  IdlePredictionResult,
  RiskEngineResult,
  ContractComparisonResult,
  PortSpec,
  VesselClassId,
} from '../types';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

/**
 * Custom API error containing HTTP status and response payload
 */
export class ApiError extends Error {
  status: number;
  data: any;

  constructor(message: string, status: number, data: any) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

/**
 * Retrieve current bearer token from Firebase client SDK or local storage fallback
 */
export async function getAuthToken(): Promise<string | null> {
  try {
    const currentUser = auth.currentUser;
    if (currentUser) {
      return await currentUser.getIdToken(true);
    }
  } catch (err) {
    console.warn('[API] Could not retrieve Firebase ID token:', err);
  }

  // Fallback for local development or demo user sessions
  try {
    const savedToken = localStorage.getItem('chartermind_token');
    if (savedToken) return savedToken;

    const savedUser = localStorage.getItem('chartermind_auth_user');
    if (savedUser) {
      const parsed = JSON.parse(savedUser);
      const emailPrefix = parsed.email ? parsed.email.split('@')[0] : 'charterer';
      return `demo-${emailPrefix}`;
    }
  } catch {
    // Ignore storage errors
  }

  return 'demo-charterer';
}

/**
 * Central authenticated fetch wrapper
 */
export async function apiFetch<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = endpoint.startsWith('http') ? endpoint : `${BASE_URL}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;

  const token = await getAuthToken();
  const headers = new Headers(options.headers || {});

  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  try {
    const response = await fetch(url, {
      ...options,
      headers,
    });

    // Handle 204 No Content
    if (response.status === 204) {
      return {} as T;
    }

    const contentType = response.headers.get('content-type');
    const isJson = contentType && contentType.includes('application/json');
    const data = isJson ? await response.json() : await response.text();

    if (!response.ok) {
      const detailMsg = typeof data === 'object' && data?.detail ? data.detail : response.statusText;
      const errorMsg = `API Error [${response.status}] ${endpoint}: ${detailMsg}`;
      console.error(`[API Error ${response.status}]`, data);
      throw new ApiError(errorMsg, response.status, data);
    }

    return data as T;
  } catch (error: any) {
    if (error instanceof ApiError) {
      throw error;
    }
    // Network errors (backend down)
    console.warn(`[API Network Notice] Backend at ${url} is unreachable. Operating in local computation mode.`);
    throw new ApiError(error?.message || 'Network error connecting to freight API', 0, null);
  }
}

/**
 * Typed HTTP methods object
 */
export const api = {
  get: <T = any>(path: string) => apiFetch<T>(path, { method: 'GET' }),
  post: <T = any>(path: string, body?: any) =>
    apiFetch<T>(path, {
      method: 'POST',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),
  put: <T = any>(path: string, body?: any) =>
    apiFetch<T>(path, {
      method: 'PUT',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),
  delete: <T = any>(path: string) => apiFetch<T>(path, { method: 'DELETE' }),
};

// ============================================================================
// Typed Maritime Domain API Endpoint Functions
// ============================================================================

/**
 * 1. Authentication Endpoints
 */
export async function verifyFirebaseToken(
  idToken: string,
  profile?: { name?: string; company?: string; role?: string; email?: string }
) {
  return api.post('/auth/verify-token', {
    id_token: idToken,
    ...(profile || {}),
  });
}

export async function getMyProfile() {
  return api.get('/auth/me');
}

/**
 * 2. Cargo Demand Management
 */
export interface CargoRequestCreate {
  cargo_type: string;
  cargo_quantity_mt: number;
  origin_country: string;
  destination_port: string;
  required_delivery_date?: string | null;
  loading_window_start?: string | null;
  loading_window_end?: string | null;
  discharge_window_start?: string | null;
  discharge_window_end?: string | null;
  preferred_vessel_type?: string | null;
  max_acceptable_freight?: number | null;
  number_of_voyages?: number;
  contract_duration?: string;
  priority?: string;
}

export async function createCargoRequest(data: CargoRequestCreate) {
  return api.post('/cargo', data);
}

export async function getCargoRequests() {
  return api.get('/cargo');
}

/**
 * 3. Vessel Intelligence & Recommendation
 */
export async function getVesselSpecs() {
  return api.get('/vessel/specs');
}

export async function recommendVessels(cargoRequestId: string, overrides?: any) {
  return api.post('/vessel/recommend', {
    cargo_request_id: cargoRequestId,
    simulator_overrides: overrides,
  });
}

/**
 * 4. Port Intelligence & Congestion
 */
export async function getPorts() {
  return api.get('/port');
}

export async function getPortSnapshot(portId: string) {
  return api.get(`/port/${portId}/snapshot`);
}

/**
 * 5. Voyage Planning & Simulation
 */
export interface VoyagePlanRequestPayload {
  cargo_request_id: string;
  simulator_overrides?: any;
  final_vessel_class?: string | null;
}

export async function generateVoyagePlan(data: VoyagePlanRequestPayload) {
  return api.post('/voyage/plan', data);
}

export async function getVoyagePlans() {
  return api.get('/voyage/plans');
}

export async function runSimulation(cargoRequestId: string, overrides: any) {
  return api.post('/simulator/run', {
    cargo_request_id: cargoRequestId,
    simulator_overrides: overrides,
  });
}

export interface VoyageEvaluationPayload {
  cargo_type: string;
  cargo_quantity_mt: number;
  origin_country: string;
  destination_port: string;
  required_delivery_date?: string | null;
  loading_window_start?: string | null;
  loading_window_end?: string | null;
  discharge_window_start?: string | null;
  discharge_window_end?: string | null;
  preferred_vessel_type?: string | null;
  priority?: string | null;
  max_acceptable_freight?: number | null;
  number_of_voyages?: number;
  contract_duration?: string | null;
  selected_vessel_id?: string | null;
  simulator_overrides?: {
    congestion?: string | null;
    weather?: string | null;
    freight_rate_offset_percent?: number | null;
    vessel_availability?: string | null;
  } | null;
  horizon_days?: number;
}

export interface VoyageEvaluationResult {
  vesselRecommendations: VesselScoreBreakdown[];
  topVesselBreakdown: VesselScoreBreakdown;
  idlePrediction: IdlePredictionResult;
  riskScores: RiskEngineResult;
  voyageCost: VoyageCostBreakdown;
  contractComparison: ContractComparisonResult;
  forecast: ForecastResult;
  optimalWindow: OptimalCharterWindowResult;
}

export function mapVesselScoreBreakdown(raw: any, portFallback?: PortSpec): VesselScoreBreakdown {
  const v = raw?.vessel || {};
  const compat = raw?.compatibility || {};

  const vDraft = Number(v.draft ?? 0);
  const pDraft = Number(portFallback?.maxDraft ?? 16.5);
  const dMargin = compat.draft_margin !== undefined && compat.draft_margin !== null
    ? Number(compat.draft_margin)
    : Number((pDraft - vDraft).toFixed(2));

  const vLoa = Number(v.loa ?? 0);
  const pLoa = Number(portFallback?.maxLoa ?? 285.0);
  const lMargin = compat.loa_margin !== undefined && compat.loa_margin !== null
    ? Number(compat.loa_margin)
    : Number((pLoa - vLoa).toFixed(2));

  const vBeam = Number(v.beam ?? 0);
  const pBeam = Number(portFallback?.maxBeam ?? 48.0);
  const bMargin = compat.beam_margin !== undefined && compat.beam_margin !== null
    ? Number(compat.beam_margin)
    : Number((pBeam - vBeam).toFixed(2));

  const vesselSpec: VesselSpec = {
    id: (v.id || 'panamax').toLowerCase() as VesselClassId,
    name: v.name || 'Bulk Carrier',
    categoryName: v.category_name || v.categoryName || '',
    dwtMin: Number(v.dwt_min ?? v.dwtMin ?? 0),
    dwtMax: Number(v.dwt_max ?? v.dwtMax ?? 0),
    dwtAvg: Number(v.dwt_avg ?? v.dwtAvg ?? 0),
    draft: vDraft,
    loa: vLoa,
    beam: vBeam,
    speed: Number(v.speed ?? 14.0),
    fuelConsumption: Number(v.fuel_consumption ?? v.fuelConsumption ?? 25.0),
    baseFreightRate: Number(v.base_freight_rate ?? v.baseFreightRate ?? 18.0),
    hourlyRate: Number(v.hourly_rate ?? v.hourlyRate ?? 800.0),
    demurrageRatePerDay: Number(v.demurrage_rate_per_day ?? v.demurrageRatePerDay ?? 20000.0),
    availability: v.availability || 'Available',
    description: v.description || '',
  };

  const portCompatibility: PortCompatibilityResult = {
    isCompatible: Boolean(compat.is_compatible ?? compat.isCompatible),
    score: Number(compat.score ?? 0),
    draftFit: {
      ok: Boolean(compat.draft_fit ?? compat.draftFit?.ok ?? dMargin >= 0),
      vesselDraft: vDraft,
      portMaxDraft: pDraft,
      margin: dMargin,
    },
    loaFit: {
      ok: Boolean(compat.loa_fit ?? compat.loaFit?.ok ?? lMargin >= 0),
      vesselLoa: vLoa,
      portMaxLoa: pLoa,
      margin: lMargin,
    },
    beamFit: {
      ok: Boolean(compat.beam_fit ?? compat.beamFit?.ok ?? bMargin >= 0),
      vesselBeam: vBeam,
      portMaxBeam: pBeam,
      margin: bMargin,
    },
    warnings: Array.isArray(compat.warnings) ? compat.warnings : [],
  };

  return {
    vessel: vesselSpec,
    finalScore: Number(raw?.final_score ?? raw?.finalScore ?? 0),
    capacityFitScore: Number(raw?.capacity_fit_score ?? raw?.capacityFitScore ?? 0),
    portCompatibilityScore: Number(raw?.port_compatibility_score ?? raw?.portCompatibilityScore ?? 0),
    costCompetitivenessScore: Number(raw?.cost_competitiveness_score ?? raw?.costCompetitivenessScore ?? 0),
    availabilityScore: Number(raw?.availability_score ?? raw?.availabilityScore ?? 0),
    idleTimeScore: Number(raw?.idle_time_score ?? raw?.idleTimeScore ?? 0),
    isBestChoice: Boolean(raw?.is_best_choice ?? raw?.isBestChoice),
    compatibility: portCompatibility,
    reasons: Array.isArray(raw?.reasons) ? raw.reasons : [],
    estimatedFreightPerMT: Number(raw?.estimated_freight_per_mt ?? raw?.estimatedFreightPerMT ?? 0),
    estimatedTotalFreight: Number(raw?.estimated_total_freight ?? raw?.estimatedTotalFreight ?? 0),
  };
}

export function mapVoyageCostBreakdown(raw: any): VoyageCostBreakdown {
  const freightCostUSD = Number(raw?.freight_cost_usd ?? raw?.freightCostUSD ?? 0);
  const portChargesUSD = Number(raw?.port_charges_usd ?? raw?.portChargesUSD ?? 0);
  const loadingDischargeCostUSD = Number(raw?.loading_discharge_cost_usd ?? raw?.loadingDischargeCostUSD ?? 0);
  const idleWaitingCostUSD = Number(raw?.idle_waiting_cost_usd ?? raw?.idleWaitingCostUSD ?? 0);
  const delayDemurrageExposureUSD = Number(raw?.demurrage_exposure_usd ?? raw?.delayDemurrageExposureUSD ?? 0);
  const totalCostUSD = Number(raw?.total_cost_usd ?? raw?.totalCostUSD ?? 0);
  const totalCostINR = Number(raw?.total_cost_inr ?? raw?.totalCostINR ?? totalCostUSD * 83.5);
  const totalCostINRLakhs = Number(raw?.total_cost_inr_lakhs ?? raw?.totalCostINRLakhs ?? (totalCostINR / 100000));
  const totalCostINRCrores = Number(raw?.total_cost_inr_crores ?? raw?.totalCostINRCrores ?? (totalCostINR / 10000000));
  const costPerMTUSD = Number(raw?.cost_per_mt_usd ?? raw?.costPerMTUSD ?? 0);
  const freightRatePerMT = Number(raw?.freight_rate_per_mt ?? raw?.freightRatePerMT ?? 0);

  const rawPercentages = raw?.percentages || {};
  const percentages = {
    freight: Number(rawPercentages.freight ?? 0),
    port: Number(rawPercentages.port ?? 0),
    handling: Number(rawPercentages.handling ?? 0),
    idle: Number(rawPercentages.idle ?? 0),
    risk: Number(rawPercentages.risk ?? rawPercentages.demurrage ?? 0),
  };

  return {
    freightCostUSD,
    portChargesUSD,
    loadingDischargeCostUSD,
    idleWaitingCostUSD,
    delayDemurrageExposureUSD,
    totalCostUSD,
    freightRatePerMT,
    totalCostINR,
    totalCostINRLakhs,
    totalCostINRCrores,
    costPerMTUSD,
    percentages,
  };
}

export function mapRiskScores(raw: any): RiskEngineResult {
  return {
    marketRisk: Number(raw?.market_risk ?? raw?.marketRisk ?? 0),
    portRisk: Number(raw?.port_risk ?? raw?.portRisk ?? 0),
    weatherRisk: Number(raw?.weather_risk ?? raw?.weatherRisk ?? 0),
    vesselRisk: Number(raw?.vessel_risk ?? raw?.vesselRisk ?? 0),
    commodityRisk: Number(raw?.commodity_risk ?? raw?.commodityRisk ?? 0),
    overallScore: Number(raw?.overall_score ?? raw?.overallScore ?? 0),
    bucket: (raw?.bucket || 'Medium') as ('Low' | 'Medium' | 'High' | 'Critical'),
    primaryDriver: raw?.primary_driver || raw?.primaryDriver || 'Market Risk',
    summarySentence: raw?.summary_sentence || raw?.summarySentence || '',
    congestionRisk: raw?.congestion_risk ? Number(raw.congestion_risk) : undefined,
    volatilityRisk: raw?.volatility_risk ? Number(raw.volatility_risk) : undefined,
    draftRisk: raw?.draft_risk ? Number(raw.draft_risk) : undefined,
  };
}

export function mapIdlePrediction(raw: any): IdlePredictionResult {
  return {
    expectedIdleHours: Number(raw?.expected_idle_hours ?? raw?.expectedIdleHours ?? 0),
    idleCostUSD: Number(raw?.idle_cost_usd ?? raw?.idleCostUSD ?? 0),
    factors: Array.isArray(raw?.factors)
      ? raw.factors.map((f: any) => ({
          name: f.name || '',
          impact: (f.impact || 'Low') as ('Low' | 'Medium' | 'High'),
          hours: Number(f.hours ?? 0),
          direction: (f.direction || 'up') as ('up' | 'down'),
        }))
      : [],
    explanation: raw?.explanation || '',
  };
}

export function mapContractComparison(raw: any): ContractComparisonResult {
  return {
    recommendedStrategy: (raw?.recommended_strategy || raw?.recommendedStrategy || 'Multiple-Voyage') as ('Multiple-Voyage' | 'Spot'),
    spotTotalCostUSD: Number(raw?.spot_total_cost_usd ?? raw?.spotTotalCostUSD ?? 0),
    multiVoyageTotalCostUSD: Number(raw?.multi_voyage_total_cost_usd ?? raw?.multiVoyageTotalCostUSD ?? 0),
    savingsUSD: Number(raw?.savings_usd ?? raw?.savingsUSD ?? 0),
    savingsINR: Number(raw?.savings_inr ?? raw?.savingsINR ?? 0),
    savingsLakhs: Number(raw?.savings_lakhs ?? raw?.savingsLakhs ?? 0),
    savingsPercent: Number(raw?.savings_percent ?? raw?.savingsPercent ?? 0),
    spotRiskScore: Number(raw?.spot_risk_score ?? raw?.spotRiskScore ?? 0),
    multiVoyageRiskScore: Number(raw?.multi_voyage_risk_score ?? raw?.multiVoyageRiskScore ?? 0),
    spotFreightRatePerMT: Number(raw?.spot_freight_rate_per_mt ?? raw?.spotFreightRatePerMT ?? 0),
    multiVoyageFreightRatePerMT: Number(raw?.multi_voyage_freight_rate_per_mt ?? raw?.multiVoyageFreightRatePerMT ?? 0),
    reasoning: raw?.reasoning || '',
  };
}

export function mapForecastResult(rawForecast: any, fallbackRoute: string = '', fallbackHorizon: number = 30): ForecastResult {
  return {
    route: rawForecast.route || fallbackRoute,
    currentRate: Number(rawForecast.current_rate ?? rawForecast.currentRate ?? 0),
    projectedRate14d: Number(rawForecast.projected_rate_14d ?? rawForecast.projectedRate14d ?? 0),
    projectedRate30d: Number(rawForecast.projected_rate_30d ?? rawForecast.projectedRate30d ?? 0),
    trend: rawForecast.trend || 'Stable',
    trendPercent: Number(rawForecast.trend_percent ?? rawForecast.trendPercent ?? 0),
    confidenceScore: Number(rawForecast.confidence_score ?? rawForecast.confidenceScore ?? 85),
    horizonDays: (rawForecast.horizon_days || rawForecast.horizonDays || fallbackHorizon || 30) as (7 | 14 | 30 | 60),
    dataPoints: Array.isArray(rawForecast.data_points || rawForecast.dataPoints)
      ? (rawForecast.data_points || rawForecast.dataPoints).map((pt: any) => ({
          date: pt.date,
          dayIndex: Number(pt.day_index ?? pt.dayIndex ?? 0),
          isForecast: Boolean(pt.is_forecast ?? pt.isForecast),
          predicted: Number(pt.predicted ?? 0),
          lowerBound: Number(pt.lower_bound ?? pt.lowerBound ?? 0),
          upperBound: Number(pt.upper_bound ?? pt.upperBound ?? 0),
          historical: pt.historical !== undefined && pt.historical !== null ? Number(pt.historical) : undefined,
        }))
      : [],
    historicalBdi: Array.isArray(rawForecast.historical_bdi || rawForecast.historicalBdi)
      ? (rawForecast.historical_bdi || rawForecast.historicalBdi).map((pt: any) => ({
          date: String(pt.date || ''),
          bdi: Number(pt.bdi ?? pt.Price ?? 0),
        }))
      : [],
    featureContributions: Array.isArray(rawForecast.feature_contributions || rawForecast.featureContributions)
      ? (rawForecast.feature_contributions || rawForecast.featureContributions).map((fc: any) => ({
          factor: fc.factor,
          contributionPercent: Number(fc.contribution_percent ?? fc.contributionPercent ?? 0),
          direction: fc.direction || 'up',
          description: fc.description || '',
        }))
      : [],
    netExpectedChangePercent: Number(rawForecast.net_expected_change_percent ?? rawForecast.netExpectedChangePercent ?? rawForecast.trend_percent ?? 0),
  };
}

export function mapOptimalWindow(rawWindow: any): OptimalCharterWindowResult {
  const rawRec = rawWindow.recommendation;
  const recommendation = (rawRec === 'Avoid' || rawRec === 'Avoid / Reconsider')
    ? 'Avoid / Reconsider'
    : (rawRec === 'Wait' ? 'Wait' : 'Charter Now');

  return {
    recommendation,
    bestWindowStart: rawWindow.best_window_start || rawWindow.bestWindowStart || '',
    bestWindowEnd: rawWindow.best_window_end || rawWindow.bestWindowEnd || '',
    potentialSavingsUSD: Number(rawWindow.potential_savings_usd ?? rawWindow.potentialSavingsUSD ?? 0),
    potentialSavingsINR: Number(rawWindow.potential_savings_inr ?? rawWindow.potentialSavingsINR ?? 0),
    potentialSavingsLakhs: Number(rawWindow.potential_savings_lakhs ?? rawWindow.potentialSavingsLakhs ?? 0),
    tradeOffSentence: rawWindow.trade_off_sentence || rawWindow.tradeOffSentence || '',
    detailedRationale: rawWindow.detailed_rationale || rawWindow.detailedRationale || '',
  };
}

/**
 * Call backend real-time evaluation endpoint POST /voyage/evaluate
 * Returns the comprehensive mathematical domain results computed in Python.
 */
export async function evaluateVoyage(
  payload: VoyageEvaluationPayload,
  portFallback?: PortSpec
): Promise<VoyageEvaluationResult> {
  const data = await api.post('/voyage/evaluate', payload);

  const rawRecs = Array.isArray(data?.vessel_recommendations) ? data.vessel_recommendations : [];
  const vesselRecommendations = rawRecs.map((r: any) => mapVesselScoreBreakdown(r, portFallback));

  const topVesselBreakdown = data?.top_vessel_breakdown
    ? mapVesselScoreBreakdown(data.top_vessel_breakdown, portFallback)
    : (vesselRecommendations[0] || ({} as VesselScoreBreakdown));

  const voyageCost = mapVoyageCostBreakdown(data?.voyage_cost || {});
  const riskScores = mapRiskScores(data?.risk_scores || {});
  const idlePrediction = mapIdlePrediction(data?.idle_prediction || {});
  const contractComparison = mapContractComparison(data?.contract_comparison || {});

  const routeName = `${payload.origin_country} → ${payload.destination_port}`;
  const forecast = mapForecastResult(data?.forecast || {}, routeName, payload.horizon_days || 30);
  const optimalWindow = mapOptimalWindow(data?.optimal_window || {});

  return {
    vesselRecommendations,
    topVesselBreakdown,
    idlePrediction,
    riskScores,
    voyageCost,
    contractComparison,
    forecast,
    optimalWindow,
  };
}

/**
 * 6. Freight Forecasting & Risk
 */
export interface QuickForecastPayload {
  origin: string;
  destination_port: string;
  cargo_type: string;
  cargo_quantity_mt: number;
  preferred_vessel_type?: string | null;
  horizon_days: number;
  simulator_overrides?: Partial<SimulatorOverrides> | null;
}

export interface QuickForecastResponse {
  forecast: ForecastResult;
  optimalWindow: OptimalCharterWindowResult;
}

/**
 * Call backend ML freight forecasting endpoint POST /forecast/quick
 * Maps snake_case backend fields into typed frontend camelCase ForecastResult and OptimalCharterWindowResult
 */
export async function fetchQuickForecast(payload: QuickForecastPayload): Promise<QuickForecastResponse> {
  const data = await api.post('/forecast/quick', payload);

  const rawForecast = data?.forecast || {};
  const rawWindow = data?.optimal_window || rawForecast?.optimal_charter_window || {};
  const fallbackRoute = `${payload.origin} → ${payload.destination_port}`;

  const forecast = mapForecastResult(rawForecast, fallbackRoute, payload.horizon_days);
  const optimalWindow = mapOptimalWindow(rawWindow);

  return { forecast, optimalWindow };
}

export async function generateForecast(cargoRequestId: string, horizonDays: number, overrides?: any) {
  return api.post('/forecast/generate', {
    cargo_request_id: cargoRequestId,
    horizon_days: horizonDays,
    simulator_overrides: overrides,
  });
}

export async function getRiskScore(cargoRequestId: string, overrides?: any) {
  return api.post('/risk/score', {
    cargo_request_id: cargoRequestId,
    simulator_overrides: overrides,
  });
}

/**
 * 7. Contract Advisory
 */
export async function compareContracts(cargoRequestId: string, overrides?: any) {
  return api.post('/contract/compare', {
    cargo_request_id: cargoRequestId,
    simulator_overrides: overrides,
  });
}

/**
 * 8. Operational Alerts
 */
export async function getAlerts() {
  return api.get('/alerts');
}

export async function dismissAlert(alertId: string) {
  return api.post(`/alerts/${alertId}/dismiss`);
}

/**
 * 9. Reports & Dossiers
 */
export async function generateReport(voyagePlanId: string, reportType: string = 'voyage_cost', title: string) {
  return api.post('/reports/generate', {
    voyage_plan_id: voyagePlanId,
    report_type: reportType,
    title,
  });
}

export async function getReports() {
  return api.get('/reports');
}

// ============================================================================
// State Persistence & Refresh Restoration Helpers
// ============================================================================

export function mapPriorityToBackend(priority?: string): string {
  if (!priority) return 'medium';
  const p = priority.toLowerCase();
  if (p.includes('cost')) return 'low';
  if (p.includes('fast') || p.includes('delivery')) return 'high';
  if (p.includes('risk')) return 'critical';
  if (p.includes('balanced')) return 'medium';
  if (['low', 'medium', 'high', 'critical'].includes(p)) return p;
  return 'medium';
}

export function mapBackendPriorityToFrontend(priority?: string): any {
  if (!priority) return 'Balanced';
  const p = priority.toLowerCase();
  if (p === 'low') return 'Lowest cost';
  if (p === 'high') return 'Fastest delivery';
  if (p === 'critical') return 'Lowest risk';
  return 'Balanced';
}

/**
 * Persist cargo request parcel to PostgreSQL database
 * Silently handles backend failure and returns null if unreachable
 */
export async function saveCargoRequest(data: any): Promise<any> {
  try {
    const payload: CargoRequestCreate = {
      cargo_type: data.cargoType || data.cargo_type || 'Coal',
      cargo_quantity_mt: Number(data.cargoQuantity ?? data.cargo_quantity_mt ?? 75000),
      origin_country: data.origin || data.origin_country || 'Indonesia',
      destination_port: data.destinationPort || data.destination_port || 'Paradip',
      required_delivery_date: data.requiredDeliveryDate || data.required_delivery_date || null,
      loading_window_start: data.loadingWindowStart || data.loading_window_start || null,
      loading_window_end: data.loadingWindowEnd || data.loading_window_end || null,
      discharge_window_start: data.dischargeWindowStart || data.discharge_window_start || null,
      discharge_window_end: data.dischargeWindowEnd || data.discharge_window_end || null,
      preferred_vessel_type:
        data.preferredVesselType && data.preferredVesselType !== 'Let AI decide'
          ? (data.preferredVesselType.charAt(0).toUpperCase() + data.preferredVesselType.slice(1).toLowerCase())
          : (data.preferred_vessel_type && data.preferred_vessel_type !== 'Let AI decide' ? data.preferred_vessel_type : null),
      max_acceptable_freight: data.maxAcceptableFreight ?? data.max_acceptable_freight ?? null,
      number_of_voyages: Number(data.numberOfVoyages ?? data.number_of_voyages ?? 1),
      contract_duration: data.contractDuration || data.contract_duration || 'Spot',
      priority: mapPriorityToBackend(data.priority),
    };

    const res = await createCargoRequest(payload);
    return res;
  } catch (err) {
    console.warn('[API] saveCargoRequest failed or backend unreachable, continuing with local state:', err);
    return null;
  }
}

/**
 * Fetch a specific cargo request by UUID from PostgreSQL
 */
export async function fetchCargoRequest(id: string): Promise<any> {
  try {
    const res = await api.get(`/cargo/${id}`);
    return res;
  } catch (err) {
    console.warn(`[API] fetchCargoRequest(${id}) failed or unreachable:`, err);
    return null;
  }
}

/**
 * Save an optimized voyage plan to PostgreSQL
 */
export async function saveVoyagePlan(data: VoyagePlanRequestPayload): Promise<any> {
  try {
    const res = await generateVoyagePlan(data);
    return res;
  } catch (err) {
    console.warn('[API] saveVoyagePlan failed or backend unreachable, continuing with local state:', err);
    return null;
  }
}

/**
 * Fetch latest saved voyage plan for the current user (first result from /voyage/plans)
 */
export async function fetchLatestVoyagePlan(): Promise<any> {
  try {
    const plans = await getVoyagePlans();
    if (Array.isArray(plans) && plans.length > 0) {
      return plans[0];
    }
    return null;
  } catch (err) {
    console.warn('[API] fetchLatestVoyagePlan failed or backend unreachable:', err);
    return null;
  }
}

/**
 * Fetch current authenticated user profile to validate session with backend
 * Throws on 401 Unauthorized so auth handlers can clear expired tokens
 */
export async function fetchUserProfile(): Promise<any> {
  try {
    const user = await getMyProfile();
    return user;
  } catch (err: any) {
    if (err?.status === 401) {
      throw err;
    }
    console.warn('[API] fetchUserProfile backend unreachable, falling back to cached user:', err);
    return null;
  }
}
