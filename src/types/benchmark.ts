export type ActionType = 'JUMP' | 'NO_JUMP' | 'DUCK';

export type ObstacleType = 
  | 'CACTUS_SMALL'
  | 'CACTUS_DOUBLE'
  | 'CACTUS_TRIPLE'
  | 'CACTUS_TALL'
  | 'PTERODACTYL_LOW'
  | 'PTERODACTYL_HIGH';

export interface Obstacle {
  id: number;
  type: ObstacleType;
  x: number;
  y: number;
  width: number;
  height: number;
  passedByJev?: boolean;
  passedByGemini?: boolean;
}

export interface DecisionPayload {
  obstacleType: ObstacleType;
  distance: number;
  speed: number;
  timeToImpactMs: number;
  criticalReactionWindowMs: [number, number];
  grounded: boolean;
  dinoY: number;
}

export interface DecisionResult {
  decision: ActionType;
  latencyMs: number;
  confidence?: number;
  model: string;
  costUsd: number;
  tokens?: { prompt: number; completion: number; total: number };
  idealAction: ActionType;
  timestamp: number;
  isTooLate: boolean;
  timeDeltaToDeadlineMs: number;
  isRealApi?: boolean;
}

export interface AgentMetrics {
  name: string;
  modelName: string;
  score: number;
  highScore: number;
  survivalTimeSec: number;
  totalDecisions: number;
  successfulDecisions: number;
  lateTimeouts: number;
  hallucinationsOrErrors: number;
  currentLatencyMs: number;
  avgLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  totalCostUsd: number;
  costPerDecisionUsd: number;
  costPerSuccessUsd: number;
  decisionsPerSec: number;
  status: 'READY' | 'RUNNING' | 'CRASHED_TIMEOUT' | 'CRASHED_OBSTACLE' | 'SURVIVED';
  crashReason?: string;
  latencyHistory: number[];
  recentDecisions: DecisionResult[];
}

export interface TrialResult {
  trialNumber: number;
  seed: number;
  jev: {
    score: number;
    survivalTimeSec: number;
    decisions: number;
    successfulDecisions: number;
    timeouts: number;
    avgLatencyMs: number;
    p50LatencyMs: number;
    p95LatencyMs: number;
    costUsd: number;
    status: string;
  };
  gemini: {
    score: number;
    survivalTimeSec: number;
    decisions: number;
    successfulDecisions: number;
    timeouts: number;
    avgLatencyMs: number;
    p50LatencyMs: number;
    p95LatencyMs: number;
    costUsd: number;
    status: string;
    crashReason: string;
  };
}

export interface BatchSummary {
  trialsCount: number;
  baseSeed: number;
  jev: {
    avgScore: number;
    avgSurvivalTimeSec: number;
    avgLatencyMs: number;
    p50LatencyMs: number;
    p95LatencyMs: number;
    totalCostUsd: number;
    costPerSuccessfulDecision: number;
    winRate: number;
    timeoutRate: string;
  };
  gemini: {
    avgScore: number;
    avgSurvivalTimeSec: number;
    avgLatencyMs: number;
    p50LatencyMs: number;
    p95LatencyMs: number;
    totalCostUsd: number;
    costPerSuccessfulDecision: number;
    winRate: number;
    timeoutRate: string;
  };
  latencyRatio: string;
  costRatio: string;
}

export interface BestOf5RoundResult {
  round: number;
  dino1Score: number;
  dino2Score: number;
  winner: 'DINO 1' | 'DINO 2' | 'DRAW';
  dino1LatencyMs: number;
  dino2LatencyMs: number;
  dino1Cost: number;
  dino2Cost: number;
  totalCost: number;
  dino1Crashed: boolean;
  dino2Crashed: boolean;
  dino1CrashReason: string;
  dino2CrashReason: string;
}

export interface BestOf5Summary {
  dino1Wins: number;
  dino2Wins: number;
  draws: number;
  dino1TotalScore: number;
  dino2TotalScore: number;
  dino1AvgScore: number;
  dino2AvgScore: number;
  dino1BestScore: number;
  dino2BestScore: number;
  dino1AvgLatencyMs: number;
  dino2AvgLatencyMs: number;
  dino1TotalCost: number;
  dino2TotalCost: number;
  totalCost: number;
  dino1Crashes: number;
  dino2Crashes: number;
  overallWinner: 'DINO 1' | 'DINO 2' | 'DRAW';
}
