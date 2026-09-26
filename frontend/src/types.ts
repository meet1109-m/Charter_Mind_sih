export type CargoType = 'Coal' | 'Iron Ore' | 'Bauxite' | 'Grain';

export type OriginCountry = 'Australia' | 'Indonesia' | 'South Africa' | 'Mozambique' | 'Russia';

export type DestinationPort = 'Paradip' | 'Dhamra' | 'Vizag' | 'Haldia' | 'Kolkata';

export type VesselClassId = 'capesize' | 'panamax' | 'supramax' | 'handysize';

export type PriorityOption = 'Lowest cost' | 'Fastest delivery' | 'Lowest risk' | 'Balanced';

export type ContractDuration = 'Single voyage' | '3 months' | '6 months' | '12 months';

export type CongestionLevel = 'Low' | 'Medium' | 'High' | 'Critical';

export type WeatherCondition = 'Normal' | 'Rough' | 'Severe';

export type AvailabilityStatus = 'Available' | 'Limited' | 'Scarce';

export interface CargoRequest {
  cargoType: CargoType;
  cargoQuantity: number; // MT (e.g. 75,000)
  origin: OriginCountry;
  destinationPort: DestinationPort;
  requiredDeliveryDate: string;
  loadingWindowStart: string;
  loadingWindowEnd: string;
  dischargeWindowStart: string;
  dischargeWindowEnd: string;
  preferredVesselType: string; // 'Let AI decide' or vessel id
  maxAcceptableFreight: number; // $/MT
  numberOfVoyages: number;
  contractDuration: ContractDuration;
  priority: PriorityOption;
}

export interface VesselSpec {
  id: VesselClassId;
  name: string;
  categoryName: string;
  dwtMin: number;
  dwtMax: number;
  dwtAvg: number;
  draft: number; // meters
  loa: number; // meters (Length Overall)
  beam: number; // meters
  speed: number; // knots
  fuelConsumption: number; // MT/day
  baseFreightRate: number; // $/MT
  hourlyRate: number; // $/hour for idle
  demurrageRatePerDay: number; // $/day
  availability: AvailabilityStatus;
  description: string;
}

export interface PortSpec {
  id: DestinationPort;
  name: string;
  state: string;
  coordinates: [number, number]; // lat, lng
  maxDraft: number; // meters
  maxLoa: number; // meters
  maxBeam: number; // meters
  congestion: CongestionLevel;
  berthingWaitDays: number;
  handlingRateMTPerDay: number;
  handlingRating: 'Very High' | 'High' | 'Medium' | 'Moderate';
  weatherRisk: 'Low' | 'Low-Medium' | 'Medium' | 'High';
  basePortFeeUSD: number;
  cargoHandlingCostPerMT: number;
  description: string;
}

export interface PortCompatibilityResult {
  isCompatible: boolean;
  score: number; // 0-100%
  draftFit: { ok: boolean; vesselDraft: number; portMaxDraft: number; margin: number };
  loaFit: { ok: boolean; vesselLoa: number; portMaxLoa: number; margin: number };
  beamFit: { ok: boolean; vesselBeam: number; portMaxBeam: number; margin: number };
  warnings: string[];
}

export interface VesselScoreBreakdown {
  vessel: VesselSpec;
  finalScore: number; // 0-100
  capacityFitScore: number;
  portCompatibilityScore: number;
  costCompetitivenessScore: number;
  availabilityScore: number;
  idleTimeScore: number;
  isBestChoice: boolean;
  compatibility: PortCompatibilityResult;
  reasons: string[];
  estimatedFreightPerMT: number;
  estimatedTotalFreight: number;
}

export interface VoyageCostBreakdown {
  freightCostUSD: number;
  portChargesUSD: number;
  loadingDischargeCostUSD: number;
  idleWaitingCostUSD: number;
  delayDemurrageExposureUSD: number;
  totalCostUSD: number;
  freightRatePerMT: number;
  // INR Conversions (approx ₹83.5 per USD)
  totalCostINR: number;
  totalCostINRLakhs: number;
  totalCostINRCrores: number;
  costPerMTUSD: number;
  percentages: {
    freight: number;
    port: number;
    handling: number;
    idle: number;
    risk: number;
  };
}

export interface IdlePredictionResult {
  expectedIdleHours: number;
  idleCostUSD: number;
  factors: {
    name: string;
    impact: 'Low' | 'Medium' | 'High';
    hours: number;
    direction: 'up' | 'down';
  }[];
  explanation: string;
}

export interface RiskEngineResult {
  marketRisk: number;
  portRisk: number;
  weatherRisk: number;
  vesselRisk: number;
  commodityRisk: number;
  overallScore: number;
  bucket: 'Low' | 'Medium' | 'High' | 'Critical';
  primaryDriver: string;
  summarySentence: string;
  congestionRisk?: number;
  volatilityRisk?: number;
  draftRisk?: number;
}

export interface HistoricalBdiPoint {
  date: string;
  bdi: number;
}

export interface ForecastDataPoint {
  date: string;
  dayIndex: number;
  isForecast: boolean;
  predicted: number;
  lowerBound: number;
  upperBound: number;
  historical?: number;
}

export interface ForecastResult {
  route: string;
  currentRate: number;
  projectedRate14d: number;
  projectedRate30d: number;
  trend: 'Rising' | 'Falling' | 'Stable';
  trendPercent: number;
  confidenceScore: number; // Rule-based forecast reliability indicator (0-100) reflecting route, vessel, and operating risks
  horizonDays: 7 | 14 | 30 | 60;
  dataPoints: ForecastDataPoint[];
  historicalBdi?: HistoricalBdiPoint[];
  featureContributions: {
    factor: string;
    contributionPercent: number; // e.g. +18% or -9%
    direction: 'up' | 'down';
    description: string;
  }[];
  netExpectedChangePercent: number;
}

export interface OptimalCharterWindowResult {
  recommendation: 'Charter Now' | 'Wait' | 'Avoid / Reconsider';
  bestWindowStart: string;
  bestWindowEnd: string;
  potentialSavingsUSD: number;
  potentialSavingsINR: number;
  potentialSavingsLakhs: number;
  tradeOffSentence: string;
  detailedRationale: string;
}

export interface ContractComparisonResult {
  recommendedStrategy: 'Multiple-Voyage' | 'Spot';
  spotTotalCostUSD: number;
  multiVoyageTotalCostUSD: number;
  savingsUSD: number;
  savingsINR: number;
  savingsLakhs: number;
  savingsPercent: number;
  spotRiskScore: number;
  multiVoyageRiskScore: number;
  spotFreightRatePerMT: number;
  multiVoyageFreightRatePerMT: number;
  reasoning: string;
}

export interface SimulatorOverrides {
  congestion: CongestionLevel;
  weather: WeatherCondition;
  freightRateOffsetPercent: number; // e.g. -10% to +20%
  vesselAvailability: AvailabilityStatus;
}

export interface AlertItem {
  id: string;
  type: 'danger' | 'warning' | 'info' | 'success';
  title: string;
  message: string;
  timestamp: string;
  impactMetric?: string;
  actionRequired?: boolean;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  company: string;
  role: string;
  avatarUrl?: string;
  createdAt: string;
}

// -------------------------------------------------------------
// RE-EXPORTS FOR BACKWARD COMPATIBILITY
// Constants & domain calculation algorithms are housed in services/maritimeEngine.ts
// -------------------------------------------------------------
export * from './services/maritimeEngine';

