import React, { useState, useEffect, useRef, useCallback } from 'react';
import { DualDinoSimulation, DINO_X, DINO_WIDTH } from './game/dinoEngine';
import { DinoCanvas } from './components/DinoCanvas';
import { BestOf5RoundResult, BestOf5Summary } from './types/benchmark';

interface AgentConfig {
  name: string;
  engine: 'jev' | 'gemini' | 'openai' | 'claude' | 'openrouter';
  modelName: string;
  apiKey: string;
}

interface TestState {
  status: 'idle' | 'testing' | 'verified' | 'failed';
  message?: string;
  latencyMs?: number;
}

const DEFAULT_DINO_1: AgentConfig = {
  name: 'Dino 1',
  engine: 'jev',
  modelName: 'typesafe/jev-1.13',
  apiKey: '',
};

const DEFAULT_DINO_2: AgentConfig = {
  name: 'Dino 2',
  engine: 'gemini',
  modelName: 'gemini-3.8-flash',
  apiKey: '',
};

const ENGINE_OPTIONS = [
  { id: 'jev', label: 'TypeSafe JEV (Dedicated Decisions API)', defaultModel: 'typesafe/jev-1.13' },
  { id: 'gemini', label: 'Google Gemini (gemini-3.8-flash)', defaultModel: 'gemini-3.8-flash' },
  { id: 'openrouter', label: 'OpenRouter (Mistral, Llama, Qwen, Jev)', defaultModel: 'mistralai/mistral-small-3.2-24b-instruct' },
  { id: 'openai', label: 'OpenAI (gpt-4o-mini)', defaultModel: 'gpt-4o-mini' },
  { id: 'claude', label: 'Anthropic Claude (3.5 Haiku)', defaultModel: 'claude-3-5-haiku-20241022' },
];

export default function App() {
  const [dino1Config, setDino1Config] = useState<AgentConfig>(DEFAULT_DINO_1);
  const [dino2Config, setDino2Config] = useState<AgentConfig>(DEFAULT_DINO_2);
  const [isConfigOpen, setIsConfigOpen] = useState<boolean>(true); // Pre-game setup modal
  const [isPlaying, setIsPlaying] = useState<boolean>(false);

  // Pre-flight API test states
  const [dino1Test, setDino1Test] = useState<TestState>({ status: 'idle' });
  const [dino2Test, setDino2Test] = useState<TestState>({ status: 'idle' });

  // Simulation engine
  const simRef = useRef<DualDinoSimulation>(new DualDinoSimulation(1337));
  const lastFrameTimeRef = useRef<number>(0);

  // Real-time metrics
  const [elapsedTime, setElapsedTime] = useState<number>(0);
  const [speedMultiplier, setSpeedMultiplier] = useState<number>(1.0);
  const [speed, setSpeed] = useState<number>(6.2);
  const [dino1Cost, setDino1Cost] = useState<number>(0);
  const [dino2Cost, setDino2Cost] = useState<number>(0);
  const [dino1Latency, setDino1Latency] = useState<number>(24);
  const [dino2Latency, setDino2Latency] = useState<number>(580);
  const [dino1Pending, setDino1Pending] = useState<boolean>(false);
  const [dino2Pending, setDino2Pending] = useState<boolean>(false);
  const [dino1Score, setDino1Score] = useState<number>(0);
  const [dino2Score, setDino2Score] = useState<number>(0);
  const [winnerMessage, setWinnerMessage] = useState<string>('Setup Ready (Test APIs & Start)');

  // Best-of-5 Benchmark Mode state
  const [isBo5Active, setIsBo5Active] = useState<boolean>(false);
  const [bo5CurrentRound, setBo5CurrentRound] = useState<number>(0); // 1 to 5
  const [bo5Rounds, setBo5Rounds] = useState<BestOf5RoundResult[]>([]);
  const [bo5Summary, setBo5Summary] = useState<BestOf5Summary | null>(null);
  const [bo5StatusMessage, setBo5StatusMessage] = useState<string>('');

  // Refs for Best-of-5 tracking inside animation and timeout loops
  const isBo5ActiveRef = useRef<boolean>(false);
  const bo5CurrentRoundRef = useRef<number>(0);
  const bo5RoundTransitionRef = useRef<boolean>(false);
  const roundDino1LatenciesRef = useRef<number[]>([]);
  const roundDino2LatenciesRef = useRef<number[]>([]);
  const roundStartDino1CostRef = useRef<number>(0);
  const roundStartDino2CostRef = useRef<number>(0);
  const fixedSeriesSpeedMultiplierRef = useRef<number>(1.0);

  const handleSpeedChange = (newMult: number) => {
    // Speed cannot be changed while a Best-of-5 round or series is active
    if (isBo5ActiveRef.current) return;
    const clamped = Math.max(0.1, Math.min(3.0, Math.round(newMult * 20) / 20));
    setSpeedMultiplier(clamped);
    simRef.current.setSpeedMultiplier(clamped);
    setSpeed(simRef.current.speed);
  };

  // Test individual Dino API connection
  const testConnection = async (side: 1 | 2) => {
    const config = side === 1 ? dino1Config : dino2Config;
    const setTest = side === 1 ? setDino1Test : setDino2Test;

    setTest({ status: 'testing', message: 'Testing connection...' });

    try {
      const res = await fetch('/api/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          engine: config.engine,
          modelName: config.modelName,
          apiKey: config.apiKey,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setTest({
          status: 'verified',
          latencyMs: data.latencyMs,
          message: data.message || `Verified (${data.latencyMs}ms)`,
        });
      } else {
        setTest({
          status: 'failed',
          message: data.error || 'Connection failed. Check API key/model.',
        });
      }
    } catch (err: any) {
      setTest({
        status: 'failed',
        message: err?.message || 'Network error testing API connection',
      });
    }
  };

  const testBothConnections = async () => {
    await Promise.all([testConnection(1), testConnection(2)]);
  };

  // Dispatch Dino 1 decision
  const dispatchDino1Decision = useCallback(async (actionData: any) => {
    setDino1Pending(true);
    const start = performance.now();

    try {
      const res = await fetch('/api/decide/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          obstacle: actionData.obstacle.type,
          distance: actionData.distance,
          speed: simRef.current.speed,
          timeToImpactMs: actionData.timeToImpactMs,
          grounded: simRef.current.jevDino.isGrounded,
          engine: dino1Config.engine,
          modelName: dino1Config.modelName,
          apiKey: dino1Config.apiKey,
        }),
      });

      const data = await res.json();
      const latencyMs = data.latencyMs || Math.round(performance.now() - start);

      const sim = simRef.current;
      const dino = sim.jevDino;

      // Track latencies for Best-of-5 round statistics
      if (isBo5ActiveRef.current) {
        roundDino1LatenciesRef.current.push(latencyMs);
      }

      // Check current position of the obstacle at the moment response arrives
      const obs = sim.obstacles.find((o) => o.id === actionData.obstacle.id);
      const currentDist = obs ? obs.x - (DINO_X + DINO_WIDTH) : -999;
      const takeoffDist = sim.getTakeoffDistance();

      // Check if response arrived after physical collision bounds (takeoff is 82px, allow emergency jump down to 35px)
      const arrivedTooLate = currentDist < 35;

      dino.lastDecisionText = data.decision;
      dino.lastDecisionLatencyMs = latencyMs;
      dino.lastDecisionOnTime = !arrivedTooLate;
      dino.lastDecisionLate = arrivedTooLate;
      dino.lastDecisionHallucinated = !!data.isHallucinated;

      setDino1Latency(latencyMs);
      setDino1Cost((prev) => prev + (data.costUsd || 0.0000008));

      if (arrivedTooLate) {
        dino.isAlive = false;
        dino.finalScore = sim.score;
        const lateByMs = Math.round(((takeoffDist - currentDist) / (sim.speed * 60)) * 1000);
        dino.crashReason = `TIMEOUT: +${Math.max(1, lateByMs)}ms late for takeoff`;
      } else if (data.isHallucinated || data.decision === 'NO_JUMP') {
        // Dino will not jump and crashes into cactus on impact
        dino.scheduledJump = null;
      } else if (dino.isAlive && data.decision === 'JUMP') {
        if (currentDist <= takeoffDist && currentDist >= 20) {
          // In takeoff or emergency zone: trigger jump immediately
          dino.jump(sim.speed);
          dino.scheduledJump = null;
        } else {
          // Still ahead of takeoff zone: arm scheduled jump
          dino.scheduledJump = { obstacleId: actionData.obstacle.id, takeoffDistance: takeoffDist };
        }
      }
    } catch {
      // fallback
    } finally {
      setDino1Pending(false);
    }
  }, [dino1Config]);

  // Dispatch Dino 2 decision
  const dispatchDino2Decision = useCallback(async (actionData: any) => {
    setDino2Pending(true);
    const start = performance.now();

    try {
      const res = await fetch('/api/decide/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          obstacle: actionData.obstacle.type,
          distance: actionData.distance,
          speed: simRef.current.speed,
          timeToImpactMs: actionData.timeToImpactMs,
          grounded: simRef.current.geminiDino.isGrounded,
          engine: dino2Config.engine,
          modelName: dino2Config.modelName,
          apiKey: dino2Config.apiKey,
        }),
      });

      const data = await res.json();
      const latencyMs = data.latencyMs || Math.round(performance.now() - start);

      const sim = simRef.current;
      const dino = sim.geminiDino;

      // Track latencies for Best-of-5 round statistics
      if (isBo5ActiveRef.current) {
        roundDino2LatenciesRef.current.push(latencyMs);
      }

      // Check current position of the obstacle at the moment response arrives
      const obs = sim.obstacles.find((o) => o.id === actionData.obstacle.id);
      const currentDist = obs ? obs.x - (DINO_X + DINO_WIDTH) : -999;
      const takeoffDist = sim.getTakeoffDistance();

      // Check if response arrived after physical collision bounds (takeoff is 82px, allow emergency jump down to 35px)
      const arrivedTooLate = currentDist < 35;

      dino.lastDecisionText = data.decision;
      dino.lastDecisionLatencyMs = latencyMs;
      dino.lastDecisionOnTime = !arrivedTooLate;
      dino.lastDecisionLate = arrivedTooLate;
      dino.lastDecisionHallucinated = !!data.isHallucinated;

      setDino2Latency(latencyMs);
      setDino2Cost((prev) => prev + (data.costUsd || 0.000075));

      if (arrivedTooLate) {
        dino.isAlive = false;
        dino.finalScore = sim.score;
        const lateByMs = Math.round(((takeoffDist - currentDist) / (sim.speed * 60)) * 1000);
        dino.crashReason = `TIMEOUT: +${Math.max(1, lateByMs)}ms late for takeoff`;
      } else if (data.isHallucinated || data.decision === 'NO_JUMP') {
        // Dino will not jump and crashes into cactus on impact
        dino.scheduledJump = null;
      } else if (dino.isAlive && data.decision === 'JUMP') {
        if (currentDist <= takeoffDist && currentDist >= 20) {
          // In takeoff or emergency zone: trigger jump immediately
          dino.jump(sim.speed);
          dino.scheduledJump = null;
        } else {
          // Still ahead of takeoff zone: arm scheduled jump
          dino.scheduledJump = { obstacleId: actionData.obstacle.id, takeoffDistance: takeoffDist };
        }
      }
    } catch {
      // fallback
    } finally {
      setDino2Pending(false);
    }
  }, [dino2Config]);

  // Launch a fresh synchronized Best-of-5 round
  const launchBo5Round = useCallback((roundNum: number, currentAccumulatedRounds: BestOf5RoundResult[]) => {
    bo5CurrentRoundRef.current = roundNum;
    setBo5CurrentRound(roundNum);
    bo5RoundTransitionRef.current = false;

    // Reset round latency trackers
    roundDino1LatenciesRef.current = [];
    roundDino2LatenciesRef.current = [];

    // Capture starting costs
    roundStartDino1CostRef.current = dino1Cost;
    roundStartDino2CostRef.current = dino2Cost;

    // Reset the simulation with a unique deterministic seed per round so both dinos face identical scenarios
    const roundSeed = 10000 + roundNum * 1337;
    const sim = simRef.current;
    sim.setSeed(roundSeed);
    sim.setSpeedMultiplier(fixedSeriesSpeedMultiplierRef.current);

    setElapsedTime(0);
    setDino1Score(0);
    setDino2Score(0);

    // Synchronize both players at start
    sim.isRunning = true;
    sim.isPaused = false;
    setIsPlaying(true);
    setBo5StatusMessage(`ROUND ${roundNum} OF 5 RUNNING`);
    setWinnerMessage(`BEST OF 5 — ROUND ${roundNum}/5 IN PROGRESS`);
  }, [dino1Cost, dino2Cost]);

  // Conclude the series after round 5 and compute comprehensive statistics
  const finalizeBo5Series = useCallback((finalRounds: BestOf5RoundResult[]) => {
    let d1Wins = 0;
    let d2Wins = 0;
    let draws = 0;
    let d1TotalScore = 0;
    let d2TotalScore = 0;
    let d1BestScore = 0;
    let d2BestScore = 0;
    let d1LatSum = 0;
    let d2LatSum = 0;
    let d1LatCount = 0;
    let d2LatCount = 0;
    let d1TotalCost = 0;
    let d2TotalCost = 0;
    let d1Crashes = 0;
    let d2Crashes = 0;

    finalRounds.forEach((r) => {
      if (r.winner === 'DINO 1') d1Wins++;
      else if (r.winner === 'DINO 2') d2Wins++;
      else draws++;

      d1TotalScore += r.dino1Score;
      d2TotalScore += r.dino2Score;

      if (r.dino1Score > d1BestScore) d1BestScore = r.dino1Score;
      if (r.dino2Score > d2BestScore) d2BestScore = r.dino2Score;

      if (r.dino1LatencyMs > 0) {
        d1LatSum += r.dino1LatencyMs;
        d1LatCount++;
      }
      if (r.dino2LatencyMs > 0) {
        d2LatSum += r.dino2LatencyMs;
        d2LatCount++;
      }

      d1TotalCost += r.dino1Cost;
      d2TotalCost += r.dino2Cost;

      if (r.dino1Crashed) d1Crashes++;
      if (r.dino2Crashed) d2Crashes++;
    });

    // Overall winner calculation:
    // 1. Most round wins
    // 2. Tiebreaker: Higher total score
    // 3. Otherwise: DRAW
    let overallWinner: 'DINO 1' | 'DINO 2' | 'DRAW' = 'DRAW';
    if (d1Wins > d2Wins) {
      overallWinner = 'DINO 1';
    } else if (d2Wins > d1Wins) {
      overallWinner = 'DINO 2';
    } else {
      if (d1TotalScore > d2TotalScore) {
        overallWinner = 'DINO 1';
      } else if (d2TotalScore > d1TotalScore) {
        overallWinner = 'DINO 2';
      } else {
        overallWinner = 'DRAW';
      }
    }

    const summary: BestOf5Summary = {
      dino1Wins: d1Wins,
      dino2Wins: d2Wins,
      draws,
      dino1TotalScore: d1TotalScore,
      dino2TotalScore: d2TotalScore,
      dino1AvgScore: Math.round(d1TotalScore / finalRounds.length),
      dino2AvgScore: Math.round(d2TotalScore / finalRounds.length),
      dino1BestScore: d1BestScore,
      dino2BestScore: d2BestScore,
      dino1AvgLatencyMs: d1LatCount > 0 ? Math.round(d1LatSum / d1LatCount) : 0,
      dino2AvgLatencyMs: d2LatCount > 0 ? Math.round(d2LatSum / d2LatCount) : 0,
      dino1TotalCost: d1TotalCost,
      dino2TotalCost: d2TotalCost,
      totalCost: d1TotalCost + d2TotalCost,
      dino1Crashes: d1Crashes,
      dino2Crashes: d2Crashes,
      overallWinner,
    };

    setBo5Summary(summary);
    isBo5ActiveRef.current = false;
    setIsBo5Active(false);
    setIsPlaying(false);

    const winnerName =
      overallWinner === 'DINO 1'
        ? `DINO 1 (${dino1Config.name.toUpperCase()})`
        : overallWinner === 'DINO 2'
        ? `DINO 2 (${dino2Config.name.toUpperCase()})`
        : 'DRAW';

    setBo5StatusMessage(`BEST OF 5 COMPLETE — OVERALL WINNER: ${winnerName}`);
    setWinnerMessage(`BEST OF 5 COMPLETE: ${winnerName} (${d1Wins}-${d2Wins}-${draws})`);
  }, [dino1Config.name, dino2Config.name]);

  // Handle conclusion of a single round within Best of 5
  const handleBo5RoundOver = useCallback(() => {
    if (!isBo5ActiveRef.current || bo5RoundTransitionRef.current) return;
    bo5RoundTransitionRef.current = true;

    const roundNum = bo5CurrentRoundRef.current;
    const sim = simRef.current;

    // Both players must be stopped
    sim.isRunning = false;
    sim.isPaused = false;
    setIsPlaying(false);

    // Get final scores achieved in this round
    const s1 = sim.jevDino.isAlive ? sim.score : sim.jevDino.finalScore || sim.score;
    const s2 = sim.geminiDino.isAlive ? sim.score : sim.geminiDino.finalScore || sim.score;

    // Determine round winner based on HIGHER SCORE
    let roundWinner: 'DINO 1' | 'DINO 2' | 'DRAW' = 'DRAW';
    if (s1 > s2) {
      roundWinner = 'DINO 1';
    } else if (s2 > s1) {
      roundWinner = 'DINO 2';
    } else {
      roundWinner = 'DRAW';
    }

    // Calculate average latencies for this round
    const d1Lats = roundDino1LatenciesRef.current;
    const d2Lats = roundDino2LatenciesRef.current;
    const d1AvgLat = d1Lats.length > 0 ? Math.round(d1Lats.reduce((a, b) => a + b, 0) / d1Lats.length) : dino1Latency;
    const d2AvgLat = d2Lats.length > 0 ? Math.round(d2Lats.reduce((a, b) => a + b, 0) / d2Lats.length) : dino2Latency;

    // Round costs
    const d1RoundCost = Math.max(0, dino1Cost - roundStartDino1CostRef.current);
    const d2RoundCost = Math.max(0, dino2Cost - roundStartDino2CostRef.current);

    const roundResult: BestOf5RoundResult = {
      round: roundNum,
      dino1Score: s1,
      dino2Score: s2,
      winner: roundWinner,
      dino1LatencyMs: d1AvgLat,
      dino2LatencyMs: d2AvgLat,
      dino1Cost: d1RoundCost,
      dino2Cost: d2RoundCost,
      totalCost: d1RoundCost + d2RoundCost,
      dino1Crashed: !sim.jevDino.isAlive,
      dino2Crashed: !sim.geminiDino.isAlive,
      dino1CrashReason: sim.jevDino.crashReason || (sim.jevDino.isAlive ? 'SURVIVED' : 'CRASHED'),
      dino2CrashReason: sim.geminiDino.crashReason || (sim.geminiDino.isAlive ? 'SURVIVED' : 'CRASHED'),
    };

    setBo5Rounds((prev) => {
      const updated = [...prev, roundResult];
      if (roundNum < 5) {
        setBo5StatusMessage(`ROUND ${roundNum} OVER (${roundWinner} WON). NEXT ROUND IN 2 SECONDS...`);
        setTimeout(() => {
          if (isBo5ActiveRef.current) {
            launchBo5Round(roundNum + 1, updated);
          }
        }, 2000);
      } else {
        finalizeBo5Series(updated);
      }
      return updated;
    });
  }, [dino1Cost, dino2Cost, dino1Latency, dino2Latency, finalizeBo5Series, launchBo5Round]);

  // Start Best-of-5 Series
  const handleStartBestOf5 = () => {
    if (dino1Test.status !== 'verified' || dino2Test.status !== 'verified') return;

    // Lock in game speed for all 5 rounds
    fixedSeriesSpeedMultiplierRef.current = speedMultiplier;
    isBo5ActiveRef.current = true;
    setIsBo5Active(true);
    setBo5Rounds([]);
    setBo5Summary(null);
    setBo5StatusMessage('STARTING BEST-OF-5 BENCHMARK (5 ROUNDS)...');

    // Reset total metrics
    setDino1Cost(0);
    setDino2Cost(0);

    launchBo5Round(1, []);
  };

  // Stop Best-of-5 Series
  const handleStopSeries = () => {
    isBo5ActiveRef.current = false;
    setIsBo5Active(false);
    bo5RoundTransitionRef.current = false;
    const sim = simRef.current;
    sim.isRunning = false;
    sim.isPaused = false;
    setIsPlaying(false);
    setBo5StatusMessage('BEST OF 5 SERIES STOPPED');
    setWinnerMessage('SERIES STOPPED BY USER');
  };

  // Reset Best-of-5 Series
  const handleResetSeries = () => {
    isBo5ActiveRef.current = false;
    setIsBo5Active(false);
    bo5RoundTransitionRef.current = false;
    setBo5CurrentRound(0);
    setBo5Rounds([]);
    setBo5Summary(null);
    setBo5StatusMessage('');
    handleReset();
  };

  // 60FPS Game Loop
  useEffect(() => {
    let animId: number;

    const loop = (timestamp: number) => {
      if (lastFrameTimeRef.current === 0) lastFrameTimeRef.current = timestamp;
      const dt = Math.min(0.05, (timestamp - lastFrameTimeRef.current) / 1000);
      lastFrameTimeRef.current = timestamp;

      const sim = simRef.current;

      if (sim.isRunning && !sim.isPaused) {
        sim.update(dt);

        setSpeed(sim.speed);
        setElapsedTime(sim.elapsedSeconds);

        if (sim.jevDino.isAlive) setDino1Score(sim.score);
        if (sim.geminiDino.isAlive) setDino2Score(sim.score);

        // Synchronized sensory evaluation: provide identical approaching obstacle input to both AIs
        const actionData = sim.getNextActionableObstacle(sim.jevDino);
        if (actionData) {
          const obsId = actionData.obstacle.id;

          if (sim.jevDino.isAlive && !dino1Pending && obsId !== sim.jevDino.lastEvaluatedObstacleId) {
            sim.jevDino.lastEvaluatedObstacleId = obsId;
            dispatchDino1Decision(actionData);
          }

          if (sim.geminiDino.isAlive && !dino2Pending && obsId !== sim.geminiDino.lastEvaluatedObstacleId) {
            sim.geminiDino.lastEvaluatedObstacleId = obsId;
            dispatchDino2Decision(actionData);
          }
        }

        // Check winner status
        const d1Alive = sim.jevDino.isAlive;
        const d2Alive = sim.geminiDino.isAlive;

        // Best-of-5 round completion check: when both dinos have finished their run
        if (isBo5ActiveRef.current) {
          if (!d1Alive && !d2Alive) {
            handleBo5RoundOver();
          } else if (d1Alive && !d2Alive) {
            setWinnerMessage(`ROUND ${bo5CurrentRoundRef.current}/5: DINO 1 ALIVE (Dino 2 crashed)`);
          } else if (!d1Alive && d2Alive) {
            setWinnerMessage(`ROUND ${bo5CurrentRoundRef.current}/5: DINO 2 ALIVE (Dino 1 crashed)`);
          } else {
            setWinnerMessage(`ROUND ${bo5CurrentRoundRef.current}/5 IN PROGRESS`);
          }
        } else {
          // Standard single match winner status
          if (d1Alive && !d2Alive) {
            setWinnerMessage(`WINNER: DINO 1 (${dino1Config.name.toUpperCase()}) — Dino 2 crashed!`);
          } else if (!d1Alive && d2Alive) {
            setWinnerMessage(`WINNER: DINO 2 (${dino2Config.name.toUpperCase()}) — Dino 1 crashed!`);
          } else if (!d1Alive && !d2Alive) {
            setWinnerMessage('MATCH OVER: BOTH CRASHED');
          } else {
            setWinnerMessage('RUNNING (Both Alive)');
          }
        }
      }

      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [dino1Pending, dino2Pending, dispatchDino1Decision, dispatchDino2Decision, dino1Config.name, dino2Config.name, handleBo5RoundOver]);

  const togglePlay = () => {
    const sim = simRef.current;
    if (!sim.isRunning) {
      sim.isRunning = true;
      sim.isPaused = false;
      setIsPlaying(true);
      setWinnerMessage('RUNNING (Both Alive)');
    } else {
      sim.isPaused = !sim.isPaused;
      setIsPlaying(!sim.isPaused);
    }
  };

  const handleReset = () => {
    const sim = simRef.current;
    sim.reset();
    sim.setSpeedMultiplier(speedMultiplier);
    setIsPlaying(false);
    setElapsedTime(0);
    setDino1Cost(0);
    setDino2Cost(0);
    setDino1Score(0);
    setDino2Score(0);
    setWinnerMessage('READY (Press Start)');
  };

  const startFromModal = () => {
    setIsConfigOpen(false);
    handleReset();
    simRef.current.isRunning = true;
    simRef.current.isPaused = false;
    setIsPlaying(true);
    setWinnerMessage('RUNNING (Both Alive)');
  };

  const renderSpeedMeterBars = (currentSpeed: number, maxRef: number = 20) => {
    const totalBars = 16;
    const filledBars = Math.min(totalBars, Math.max(1, Math.round((currentSpeed / maxRef) * totalBars)));
    return (
      <div className="flex items-center gap-0.5" title={`Engine Speed: ${currentSpeed.toFixed(1)} px/f`}>
        {Array.from({ length: totalBars }).map((_, i) => (
          <span
            key={i}
            className={`h-2.5 w-1 transition-colors ${
              i < filledBars ? 'bg-white' : 'bg-neutral-800'
            }`}
          />
        ))}
      </div>
    );
  };

  const canStartMatch = dino1Test.status === 'verified' && dino2Test.status === 'verified';

  return (
    <div className="min-h-screen bg-black text-white flex flex-col justify-between font-mono selection:bg-neutral-800 selection:text-white p-3 sm:p-6">
      {/* Top Header & Controls */}
      <header className="border-b border-neutral-800 pb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-sm sm:text-base font-bold tracking-wider uppercase">
            CHROME DINO AI SHOWDOWN
          </h1>
          <p className="text-[11px] text-neutral-500">
            Synchronized Millisecond Reaction & Hallucination Benchmark
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setIsConfigOpen(true)}
            className="px-3 py-1.5 bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-xs font-bold transition-colors"
          >
            CONFIGURE APIS
          </button>

          {/* Standard Single Match Play/Pause */}
          <button
            onClick={togglePlay}
            disabled={!canStartMatch || isBo5Active}
            className={`px-4 py-1.5 text-xs font-bold border transition-colors ${
              !canStartMatch || isBo5Active
                ? 'opacity-30 cursor-not-allowed bg-neutral-900 border-neutral-800 text-neutral-500'
                : isPlaying
                ? 'bg-neutral-800 border-neutral-600 text-white'
                : 'bg-white border-white text-black'
            }`}
            title={canStartMatch ? 'Toggle match running state' : 'Requires API verification before playing'}
          >
            {isPlaying && !isBo5Active ? 'PAUSE' : 'START MATCH'}
          </button>

          {/* BEST OF 5 Button */}
          {!isBo5Active ? (
            <button
              onClick={handleStartBestOf5}
              disabled={!canStartMatch}
              className={`px-3 py-1.5 text-xs font-bold border transition-colors ${
                !canStartMatch
                  ? 'opacity-30 cursor-not-allowed bg-neutral-900 border-neutral-800 text-neutral-500'
                  : 'bg-neutral-900 hover:bg-white hover:text-black border-neutral-500 text-white'
              }`}
              title="Run automated 5-round benchmark across identical obstacle seeds"
            >
              BEST OF 5
            </button>
          ) : (
            <button
              onClick={handleStopSeries}
              className="px-3 py-1.5 bg-neutral-900 hover:bg-red-950 border border-neutral-600 hover:border-red-600 text-white hover:text-red-300 text-xs font-bold transition-colors"
              title="Stop ongoing Best-of-5 series"
            >
              STOP SERIES
            </button>
          )}

          {/* Series Reset / Match Reset */}
          {bo5Rounds.length > 0 || isBo5Active ? (
            <button
              onClick={handleResetSeries}
              className="px-3 py-1.5 bg-neutral-950 hover:bg-neutral-900 border border-neutral-700 text-neutral-300 hover:text-white text-xs font-bold transition-colors"
              title="Reset Best of 5 series and scores"
            >
              RESET SERIES
            </button>
          ) : (
            <button
              onClick={handleReset}
              className="px-3 py-1.5 bg-neutral-950 hover:bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-white text-xs transition-colors"
            >
              RESET
            </button>
          )}
        </div>
      </header>

      {/* Best-of-5 Active Round Progress Banner */}
      {isBo5Active && (
        <div className="mt-2 px-3 py-1.5 bg-neutral-950 border border-neutral-700 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <span className="inline-block w-2 h-2 bg-white animate-pulse" />
            <span className="font-bold text-white tracking-wider uppercase">
              BEST OF 5 IN PROGRESS — ROUND {bo5CurrentRound} / 5
            </span>
          </div>
          <span className="text-neutral-400 text-[11px]">
            Speed locked at {fixedSeriesSpeedMultiplierRef.current.toFixed(1)}x • Seed {10000 + bo5CurrentRound * 1337}
          </span>
        </div>
      )}

      {/* Speed Meter Control Bar */}
      <div className="mt-3 p-3 bg-neutral-950 border border-neutral-800 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-white uppercase tracking-wider">
              SPEED METER:
            </span>
            <span className="px-2 py-0.5 bg-neutral-900 border border-neutral-700 font-bold text-white text-xs">
              {speedMultiplier.toFixed(1)}x
            </span>
          </div>

          <div className="hidden sm:block">
            {renderSpeedMeterBars(speed)}
          </div>

          <span className="text-neutral-400 text-[11px]">
            {(speed * 60).toFixed(0)} px/s • {speed.toFixed(1)} px/f
          </span>
        </div>

        <div className="flex items-center gap-2 flex-1 max-w-sm sm:max-w-md">
          <button
            onClick={() => handleSpeedChange(speedMultiplier <= 0.3 ? speedMultiplier - 0.05 : speedMultiplier - 0.1)}
            disabled={speedMultiplier <= 0.1 || isBo5Active}
            className="px-2.5 py-1 bg-neutral-900 hover:bg-neutral-800 disabled:opacity-30 border border-neutral-700 text-white font-bold text-xs transition-colors"
            title={isBo5Active ? 'Speed locked during Best-of-5' : 'Decrease Speed (-0.1x)'}
          >
            - SLOWER
          </button>

          <input
            type="range"
            min="0.1"
            max="3.0"
            step="0.05"
            disabled={isBo5Active}
            value={speedMultiplier}
            onChange={(e) => handleSpeedChange(parseFloat(e.target.value))}
            className="flex-1 h-1.5 bg-neutral-800 rounded-none appearance-none cursor-pointer accent-white disabled:opacity-30"
            title={isBo5Active ? 'Speed locked during Best-of-5' : `Speed: ${speedMultiplier.toFixed(2)}x`}
          />

          <button
            onClick={() => handleSpeedChange(speedMultiplier < 0.3 ? speedMultiplier + 0.05 : speedMultiplier + 0.1)}
            disabled={speedMultiplier >= 3.0 || isBo5Active}
            className="px-2.5 py-1 bg-neutral-900 hover:bg-neutral-800 disabled:opacity-30 border border-neutral-700 text-white font-bold text-xs transition-colors"
            title={isBo5Active ? 'Speed locked during Best-of-5' : 'Increase Speed (+0.1x)'}
          >
            + FASTER
          </button>
        </div>

        {/* Quick Speed Presets including ultra-slow */}
        <div className="flex items-center gap-1">
          {[0.1, 0.25, 0.5, 1.0, 2.0].map((preset) => (
            <button
              key={preset}
              disabled={isBo5Active}
              onClick={() => handleSpeedChange(preset)}
              className={`px-2 py-0.5 text-[10px] border transition-colors disabled:opacity-30 ${
                Math.abs(speedMultiplier - preset) < 0.04
                  ? 'bg-white text-black border-white font-bold'
                  : 'bg-neutral-900 text-neutral-400 border-neutral-800 hover:text-white hover:border-neutral-600'
              }`}
            >
              {preset}x
            </button>
          ))}
        </div>
      </div>

      {/* Main Dual Game Viewports (Side-by-side) */}
      <main className="my-auto py-4">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Dino 1 Viewport */}
          <DinoCanvas
            player={simRef.current.jevDino}
            obstacles={simRef.current.obstacles}
            clouds={simRef.current.clouds}
            groundBumps={simRef.current.groundBumps}
            speed={speed}
            score={dino1Score}
            name="DINO 1 (LEFT)"
            engineName={`${dino1Config.engine.toUpperCase()}: ${dino1Config.modelName}`}
            modelLatency={dino1Latency}
            isPending={dino1Pending}
            costUsd={dino1Cost}
          />

          {/* Dino 2 Viewport */}
          <DinoCanvas
            player={simRef.current.geminiDino}
            obstacles={simRef.current.obstacles}
            clouds={simRef.current.clouds}
            groundBumps={simRef.current.groundBumps}
            speed={speed}
            score={dino2Score}
            name="DINO 2 (RIGHT)"
            engineName={`${dino2Config.engine.toUpperCase()}: ${dino2Config.modelName}`}
            modelLatency={dino2Latency}
            isPending={dino2Pending}
            costUsd={dino2Cost}
          />
        </div>
      </main>

      {/* Best of 5 Results Table & Final Benchmark Statistics */}
      {bo5Rounds.length > 0 && (
        <section className="mt-3 p-3 bg-neutral-950 border border-neutral-800 text-xs">
          <div className="flex flex-wrap items-center justify-between pb-2 mb-2 border-b border-neutral-800 gap-2">
            <div className="flex items-center gap-2">
              <span className="font-bold text-white uppercase tracking-wider">
                BEST OF 5 BENCHMARK RESULTS
              </span>
              <span className="text-[11px] px-2 py-0.5 bg-neutral-900 border border-neutral-700 text-neutral-300">
                {bo5Rounds.length}/5 ROUNDS COMPLETED
              </span>
            </div>

            {bo5StatusMessage && (
              <span className="text-[11px] text-neutral-400 font-mono">
                {bo5StatusMessage}
              </span>
            )}
          </div>

          {/* Table: ROUND | DINO 1 SCORE | DINO 2 SCORE | ROUND WINNER | DINO 1 LATENCY | DINO 2 LATENCY | COST */}
          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono border-collapse text-[11px]">
              <thead>
                <tr className="border-b border-neutral-800 text-neutral-500 uppercase text-[10px]">
                  <th className="py-1.5 px-2">ROUND</th>
                  <th className="py-1.5 px-2">DINO 1 SCORE</th>
                  <th className="py-1.5 px-2">DINO 2 SCORE</th>
                  <th className="py-1.5 px-2">ROUND WINNER</th>
                  <th className="py-1.5 px-2">DINO 1 LATENCY</th>
                  <th className="py-1.5 px-2">DINO 2 LATENCY</th>
                  <th className="py-1.5 px-2">COST</th>
                </tr>
              </thead>
              <tbody>
                {bo5Rounds.map((r) => (
                  <tr key={r.round} className="border-b border-neutral-900 hover:bg-neutral-900/50">
                    <td className="py-1.5 px-2 font-bold text-white">ROUND {r.round}</td>
                    <td className="py-1.5 px-2">
                      <span className="font-bold text-white">{String(r.dino1Score).padStart(5, '0')}</span>
                      {r.dino1Crashed && (
                        <span className="text-[9px] text-neutral-400 ml-1.5" title={r.dino1CrashReason}>
                          (CRASHED)
                        </span>
                      )}
                    </td>
                    <td className="py-1.5 px-2">
                      <span className="font-bold text-white">{String(r.dino2Score).padStart(5, '0')}</span>
                      {r.dino2Crashed && (
                        <span className="text-[9px] text-neutral-400 ml-1.5" title={r.dino2CrashReason}>
                          (CRASHED)
                        </span>
                      )}
                    </td>
                    <td className="py-1.5 px-2">
                      <span
                        className={`font-bold px-1.5 py-0.5 border ${
                          r.winner === 'DINO 1'
                            ? 'text-white border-white bg-neutral-900'
                            : r.winner === 'DINO 2'
                            ? 'text-white border-neutral-600 bg-neutral-900'
                            : 'text-neutral-400 border-neutral-800'
                        }`}
                      >
                        {r.winner}
                      </span>
                    </td>
                    <td className="py-1.5 px-2 text-neutral-300">{r.dino1LatencyMs}ms</td>
                    <td className="py-1.5 px-2 text-neutral-300">{r.dino2LatencyMs}ms</td>
                    <td className="py-1.5 px-2 text-neutral-400">
                      ${r.totalCost.toFixed(6)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Series Completion Summary Card */}
          {bo5Summary && (
            <div className="mt-3 p-3 bg-black border border-neutral-700 space-y-2">
              <div className="flex flex-wrap items-center justify-between border-b border-neutral-800 pb-2">
                <div>
                  <div className="text-xs font-bold text-white tracking-widest uppercase">
                    BEST OF 5 COMPLETE
                  </div>
                  <div className="text-[11px] text-neutral-400 mt-0.5">
                    DINO 1: {bo5Summary.dino1Wins} WINS &nbsp;|&nbsp; DINO 2: {bo5Summary.dino2Wins} WINS &nbsp;|&nbsp; DRAWS: {bo5Summary.draws}
                  </div>
                  <div className="text-[11px] text-neutral-300">
                    TOTAL SCORE: {bo5Summary.dino1TotalScore} vs {bo5Summary.dino2TotalScore}
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-[10px] text-neutral-500 uppercase">OVERALL WINNER</div>
                  <div className="text-sm font-bold text-white px-2 py-0.5 bg-neutral-900 border border-neutral-600 inline-block mt-0.5">
                    {bo5Summary.overallWinner === 'DRAW' ? 'DRAW (TIE)' : `${bo5Summary.overallWinner}`}
                  </div>
                </div>
              </div>

              {/* Comprehensive Comparative Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-[11px]">
                <div className="p-2 bg-neutral-950 border border-neutral-900">
                  <div className="text-[10px] text-neutral-500 uppercase">AVG / BEST SCORE</div>
                  <div className="font-bold text-white mt-0.5">
                    D1: {bo5Summary.dino1AvgScore} (Best: {bo5Summary.dino1BestScore})
                  </div>
                  <div className="text-neutral-400">
                    D2: {bo5Summary.dino2AvgScore} (Best: {bo5Summary.dino2BestScore})
                  </div>
                </div>

                <div className="p-2 bg-neutral-950 border border-neutral-900">
                  <div className="text-[10px] text-neutral-500 uppercase">AVG REACTION LATENCY</div>
                  <div className="font-bold text-white mt-0.5">
                    Dino 1: {bo5Summary.dino1AvgLatencyMs}ms
                  </div>
                  <div className="text-neutral-400">
                    Dino 2: {bo5Summary.dino2AvgLatencyMs}ms
                  </div>
                </div>

                <div className="p-2 bg-neutral-950 border border-neutral-900">
                  <div className="text-[10px] text-neutral-500 uppercase">TOTAL API COST</div>
                  <div className="font-bold text-white mt-0.5">
                    ${bo5Summary.totalCost.toFixed(6)}
                  </div>
                  <div className="text-neutral-400 text-[10px]">
                    D1: ${bo5Summary.dino1TotalCost.toFixed(6)} | D2: ${bo5Summary.dino2TotalCost.toFixed(6)}
                  </div>
                </div>

                <div className="p-2 bg-neutral-950 border border-neutral-900">
                  <div className="text-[10px] text-neutral-500 uppercase">CRASHES / TIMEOUTS</div>
                  <div className="font-bold text-white mt-0.5">
                    Dino 1: {bo5Summary.dino1Crashes} crashes
                  </div>
                  <div className="text-neutral-400">
                    Dino 2: {bo5Summary.dino2Crashes} crashes
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Required Bottom Bar: Speed, Cost, Time, Who Wins At Last */}
      <footer className="border-t border-neutral-800 pt-3">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-neutral-950 border border-neutral-800 p-3 text-xs">
          {/* 1. Speed Meter */}
          <div className="border-r border-neutral-900 pr-2 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-neutral-500 uppercase">SPEED METER</span>
              <span className="text-[10px] text-white font-bold">{speedMultiplier.toFixed(1)}x</span>
            </div>

            <div className="flex items-center justify-between my-1">
              <div>
                <div className="text-sm font-bold text-white mt-0.5">
                  {(speed * 60).toFixed(0)} <span className="text-[10px] font-normal text-neutral-400">px/s</span>
                </div>
                <div className="text-[10px] text-neutral-400">
                  {speed.toFixed(1)} px/frame
                </div>
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleSpeedChange(speedMultiplier <= 0.3 ? speedMultiplier - 0.05 : speedMultiplier - 0.1)}
                  disabled={speedMultiplier <= 0.1 || isBo5Active}
                  className="w-6 h-6 flex items-center justify-center bg-neutral-900 hover:bg-neutral-800 disabled:opacity-30 border border-neutral-700 text-white font-bold text-xs transition-colors"
                  title={isBo5Active ? 'Speed locked during Best-of-5' : 'Decrease Speed (-0.1x)'}
                >
                  -
                </button>
                <button
                  onClick={() => handleSpeedChange(speedMultiplier < 0.3 ? speedMultiplier + 0.05 : speedMultiplier + 0.1)}
                  disabled={speedMultiplier >= 3.0 || isBo5Active}
                  className="w-6 h-6 flex items-center justify-center bg-neutral-900 hover:bg-neutral-800 disabled:opacity-30 border border-neutral-700 text-white font-bold text-xs transition-colors"
                  title={isBo5Active ? 'Speed locked during Best-of-5' : 'Increase Speed (+0.1x)'}
                >
                  +
                </button>
              </div>
            </div>

            <div className="mt-1">
              {renderSpeedMeterBars(speed)}
            </div>
          </div>

          {/* 2. Cost */}
          <div className="border-r border-neutral-900 pr-2">
            <div className="text-[10px] text-neutral-500 uppercase">TOTAL COST</div>
            <div className="text-[11px] font-bold text-white mt-0.5">
              Dino 1: ${dino1Cost.toFixed(6)}
            </div>
            <div className="text-[11px] text-neutral-400">
              Dino 2: ${dino2Cost.toFixed(6)}
            </div>
          </div>

          {/* 3. Time */}
          <div className="border-r border-neutral-900 pr-2">
            <div className="text-[10px] text-neutral-500 uppercase">TIME</div>
            <div className="text-sm font-bold text-white mt-0.5">
              {elapsedTime.toFixed(1)}s
            </div>
            <div className="text-[10px] text-neutral-400">
              Elapsed Run Time
            </div>
          </div>

          {/* 4. Who Wins */}
          <div>
            <div className="text-[10px] text-neutral-500 uppercase">WINNER / RESULT</div>
            <div className="text-xs font-bold text-white mt-0.5 break-words">
              {winnerMessage}
            </div>
          </div>
        </div>
      </footer>

      {/* Pre-Game API Key & Engine Selection Modal */}
      {isConfigOpen && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-neutral-950 border border-neutral-700 p-5 space-y-4">
            <div className="border-b border-neutral-800 pb-3 flex items-start justify-between">
              <div>
                <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                  API Key & Model Setup (Both Sides)
                </h2>
                <p className="text-xs text-neutral-400 mt-1">
                  You can put any API key on both sides. Any LLM will work on either side as well as JEV.
                </p>
                <p className="text-[11px] text-neutral-500 mt-0.5">
                  Pre-flight verification required before match starts.
                </p>
              </div>

              <button
                onClick={testBothConnections}
                className="px-3 py-1 bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-white font-bold text-xs transition-colors shrink-0"
              >
                TEST BOTH APIS
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              {/* Dino 1 Setup */}
              <div className="p-3 bg-black border border-neutral-800 space-y-3">
                <div className="flex items-center justify-between border-b border-neutral-900 pb-1">
                  <span className="font-bold text-white">DINO 1 (LEFT SIDE)</span>
                  {dino1Test.status === 'verified' && (
                    <span className="text-[10px] text-white bg-neutral-900 px-1.5 py-0.5 border border-neutral-700">
                      VERIFIED ({dino1Test.latencyMs}ms)
                    </span>
                  )}
                  {dino1Test.status === 'testing' && (
                    <span className="text-[10px] text-neutral-400 animate-pulse">TESTING...</span>
                  )}
                  {dino1Test.status === 'failed' && (
                    <span className="text-[10px] text-neutral-300 bg-neutral-900 px-1.5 py-0.5 border border-neutral-700">FAILED</span>
                  )}
                  {dino1Test.status === 'idle' && (
                    <span className="text-[10px] text-neutral-500">UNTESTED</span>
                  )}
                </div>

                <div>
                  <label className="block text-[10px] text-neutral-400 uppercase mb-1">
                    Select Engine
                  </label>
                  <select
                    value={dino1Config.engine}
                    onChange={(e) => {
                      const eng = e.target.value as any;
                      const opt = ENGINE_OPTIONS.find((o) => o.id === eng);
                      setDino1Config((prev) => ({
                        ...prev,
                        engine: eng,
                        modelName: opt?.defaultModel || prev.modelName,
                      }));
                      setDino1Test({ status: 'idle' });
                    }}
                    className="w-full bg-neutral-900 border border-neutral-700 p-1.5 text-white font-mono focus:outline-none"
                  >
                    {ENGINE_OPTIONS.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] text-neutral-400 uppercase mb-1">
                    Model Name
                  </label>
                  <input
                    type="text"
                    value={dino1Config.modelName}
                    onChange={(e) => {
                      setDino1Config((prev) => ({ ...prev, modelName: e.target.value }));
                      setDino1Test({ status: 'idle' });
                    }}
                    className="w-full bg-neutral-900 border border-neutral-700 p-1.5 text-white font-mono focus:outline-none"
                  />
                  <div className="flex flex-wrap gap-1 mt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setDino1Config((prev) => ({ ...prev, engine: 'jev', modelName: 'typesafe/jev-1.13' }));
                        setDino1Test({ status: 'idle' });
                      }}
                      className="text-[9px] bg-neutral-800 hover:bg-neutral-700 text-neutral-300 px-1.5 py-0.5 border border-neutral-700 font-mono"
                    >
                      + typesafe/jev-1.13
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDino1Config((prev) => ({ ...prev, engine: 'openrouter', modelName: 'mistralai/mistral-small-3.2-24b-instruct' }));
                        setDino1Test({ status: 'idle' });
                      }}
                      className="text-[9px] bg-neutral-800 hover:bg-neutral-700 text-neutral-300 px-1.5 py-0.5 border border-neutral-700 font-mono"
                    >
                      + mistral-small-3.2
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] text-neutral-400 uppercase mb-1">
                    API Key (Optional / Any Key)
                  </label>
                  <input
                    type="password"
                    placeholder="Leave empty for calibrated/env key"
                    value={dino1Config.apiKey}
                    onChange={(e) => {
                      setDino1Config((prev) => ({ ...prev, apiKey: e.target.value }));
                      setDino1Test({ status: 'idle' });
                    }}
                    className="w-full bg-neutral-900 border border-neutral-700 p-1.5 text-white font-mono focus:outline-none text-xs"
                  />
                </div>

                <div className="pt-1 flex items-center justify-between">
                  <button
                    onClick={() => testConnection(1)}
                    disabled={dino1Test.status === 'testing'}
                    className="px-2.5 py-1 bg-neutral-900 hover:bg-neutral-800 disabled:opacity-40 border border-neutral-700 text-white font-bold text-[11px] transition-colors"
                  >
                    {dino1Test.status === 'testing' ? 'TESTING...' : 'TEST CONNECTION'}
                  </button>

                  <span className="text-[10px] text-neutral-400 max-w-[140px] truncate" title={dino1Test.message}>
                    {dino1Test.message}
                  </span>
                </div>
              </div>

              {/* Dino 2 Setup */}
              <div className="p-3 bg-black border border-neutral-800 space-y-3">
                <div className="flex items-center justify-between border-b border-neutral-900 pb-1">
                  <span className="font-bold text-white">DINO 2 (RIGHT SIDE)</span>
                  {dino2Test.status === 'verified' && (
                    <span className="text-[10px] text-white bg-neutral-900 px-1.5 py-0.5 border border-neutral-700">
                      VERIFIED ({dino2Test.latencyMs}ms)
                    </span>
                  )}
                  {dino2Test.status === 'testing' && (
                    <span className="text-[10px] text-neutral-400 animate-pulse">TESTING...</span>
                  )}
                  {dino2Test.status === 'failed' && (
                    <span className="text-[10px] text-neutral-300 bg-neutral-900 px-1.5 py-0.5 border border-neutral-700">FAILED</span>
                  )}
                  {dino2Test.status === 'idle' && (
                    <span className="text-[10px] text-neutral-500">UNTESTED</span>
                  )}
                </div>

                <div>
                  <label className="block text-[10px] text-neutral-400 uppercase mb-1">
                    Select Engine
                  </label>
                  <select
                    value={dino2Config.engine}
                    onChange={(e) => {
                      const eng = e.target.value as any;
                      const opt = ENGINE_OPTIONS.find((o) => o.id === eng);
                      setDino2Config((prev) => ({
                        ...prev,
                        engine: eng,
                        modelName: opt?.defaultModel || prev.modelName,
                      }));
                      setDino2Test({ status: 'idle' });
                    }}
                    className="w-full bg-neutral-900 border border-neutral-700 p-1.5 text-white font-mono focus:outline-none"
                  >
                    {ENGINE_OPTIONS.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] text-neutral-400 uppercase mb-1">
                    Model Name
                  </label>
                  <input
                    type="text"
                    value={dino2Config.modelName}
                    onChange={(e) => {
                      setDino2Config((prev) => ({ ...prev, modelName: e.target.value }));
                      setDino2Test({ status: 'idle' });
                    }}
                    className="w-full bg-neutral-900 border border-neutral-700 p-1.5 text-white font-mono focus:outline-none"
                  />
                  <div className="flex flex-wrap gap-1 mt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setDino2Config((prev) => ({ ...prev, engine: 'gemini', modelName: 'gemini-3.8-flash' }));
                        setDino2Test({ status: 'idle' });
                      }}
                      className="text-[9px] bg-neutral-800 hover:bg-neutral-700 text-neutral-300 px-1.5 py-0.5 border border-neutral-700 font-mono"
                    >
                      + gemini-3.8-flash
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDino2Config((prev) => ({ ...prev, engine: 'openrouter', modelName: 'mistralai/mistral-small-3.2-24b-instruct' }));
                        setDino2Test({ status: 'idle' });
                      }}
                      className="text-[9px] bg-neutral-800 hover:bg-neutral-700 text-neutral-300 px-1.5 py-0.5 border border-neutral-700 font-mono"
                    >
                      + mistral-small-3.2
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDino2Config((prev) => ({ ...prev, engine: 'jev', modelName: 'typesafe/jev-1.13' }));
                        setDino2Test({ status: 'idle' });
                      }}
                      className="text-[9px] bg-neutral-800 hover:bg-neutral-700 text-neutral-300 px-1.5 py-0.5 border border-neutral-700 font-mono"
                    >
                      + typesafe/jev-1.13
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] text-neutral-400 uppercase mb-1">
                    API Key (Optional / Any Key)
                  </label>
                  <input
                    type="password"
                    placeholder="Leave empty for calibrated/env key"
                    value={dino2Config.apiKey}
                    onChange={(e) => {
                      setDino2Config((prev) => ({ ...prev, apiKey: e.target.value }));
                      setDino2Test({ status: 'idle' });
                    }}
                    className="w-full bg-neutral-900 border border-neutral-700 p-1.5 text-white font-mono focus:outline-none text-xs"
                  />
                </div>

                <div className="pt-1 flex items-center justify-between">
                  <button
                    onClick={() => testConnection(2)}
                    disabled={dino2Test.status === 'testing'}
                    className="px-2.5 py-1 bg-neutral-900 hover:bg-neutral-800 disabled:opacity-40 border border-neutral-700 text-white font-bold text-[11px] transition-colors"
                  >
                    {dino2Test.status === 'testing' ? 'TESTING...' : 'TEST CONNECTION'}
                  </button>

                  <span className="text-[10px] text-neutral-400 max-w-[140px] truncate" title={dino2Test.message}>
                    {dino2Test.message}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-neutral-800">
              <span className="text-[11px] text-neutral-500">
                {!canStartMatch ? '⚠️ Test and verify both sides to unlock match' : '✓ Both APIs verified and ready'}
              </span>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsConfigOpen(false)}
                  className="px-3 py-1.5 border border-neutral-700 text-neutral-300 hover:text-white text-xs"
                >
                  Close
                </button>
                <button
                  onClick={startFromModal}
                  disabled={!canStartMatch}
                  className={`px-5 py-1.5 font-bold text-xs transition-colors ${
                    canStartMatch
                      ? 'bg-white text-black hover:bg-neutral-200 cursor-pointer'
                      : 'bg-neutral-800 text-neutral-500 border border-neutral-700 cursor-not-allowed'
                  }`}
                >
                  {canStartMatch ? 'READY & START MATCH' : 'TEST BOTH APIS FIRST'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
