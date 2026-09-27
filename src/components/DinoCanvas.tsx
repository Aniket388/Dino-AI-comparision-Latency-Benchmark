import React, { useEffect, useRef } from 'react';
import { DinoPlayer, GROUND_Y, DINO_X, DINO_WIDTH, DINO_HEIGHT, CANVAS_WIDTH, CANVAS_HEIGHT } from '../game/dinoEngine';
import { Obstacle } from '../types/benchmark';

interface DinoCanvasProps {
  player: DinoPlayer;
  obstacles: Obstacle[];
  clouds: { x: number; y: number }[];
  groundBumps: { x: number; width: number }[];
  speed: number;
  score: number;
  name: string;
  engineName: string;
  modelLatency: number;
  isPending: boolean;
  costUsd: number;
}

export const DinoCanvas: React.FC<DinoCanvasProps> = ({
  player,
  obstacles,
  clouds,
  groundBumps,
  speed,
  score,
  name,
  engineName,
  modelLatency,
  isPending,
  costUsd,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameCountRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    frameCountRef.current++;
    const frame = frameCountRef.current;

    // Pure black background
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Ground baseline (crisp white)
    ctx.strokeStyle = '#525252';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, GROUND_Y);
    ctx.lineTo(CANVAS_WIDTH, GROUND_Y);
    ctx.stroke();

    // Ground cracks
    ctx.strokeStyle = '#404040';
    for (const bump of groundBumps) {
      ctx.beginPath();
      ctx.moveTo(bump.x, GROUND_Y);
      ctx.lineTo(bump.x + bump.width, GROUND_Y);
      ctx.stroke();
      ctx.fillStyle = '#525252';
      ctx.fillRect(bump.x + 2, GROUND_Y + 2, 2, 2);
    }

    // Minimal clouds
    ctx.fillStyle = '#171717';
    for (const cloud of clouds) {
      ctx.beginPath();
      ctx.arc(cloud.x, cloud.y, 8, 0, Math.PI * 2);
      ctx.arc(cloud.x + 10, cloud.y - 4, 12, 0, Math.PI * 2);
      ctx.arc(cloud.x + 22, cloud.y, 9, 0, Math.PI * 2);
      ctx.fill();
    }

    // Sensory horizon marker & physical takeoff marker
    const observationDistance = 680;
    const takeoffDistance = 82;
    const takeoffX = DINO_X + DINO_WIDTH + takeoffDistance;
    // Canvas is 640px wide; clamp observe line to 610px so it's visible at right edge
    const observationX = Math.min(CANVAS_WIDTH - 25, DINO_X + DINO_WIDTH + observationDistance);

    // Draw Takeoff Zone Line (where jump physically triggers)
    ctx.strokeStyle = '#333333';
    ctx.setLineDash([2, 4]);
    ctx.beginPath();
    ctx.moveTo(takeoffX, GROUND_Y - 24);
    ctx.lineTo(takeoffX, GROUND_Y);
    ctx.stroke();
    ctx.font = '8px monospace';
    ctx.fillStyle = '#555555';
    ctx.fillText('TAKEOFF', takeoffX - 18, GROUND_Y - 27);

    // Draw Observation Line (where obstacle state is fed to AI)
    ctx.strokeStyle = '#262626';
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(observationX, GROUND_Y - 36);
    ctx.lineTo(observationX, GROUND_Y);
    ctx.stroke();
    ctx.fillText('OBSERVE (680px)', observationX - 40, GROUND_Y - 39);
    ctx.setLineDash([]);

    // Nearest obstacle distance and impact indicator
    const nearestObs = obstacles.find((o) => o.x > DINO_X + DINO_WIDTH);
    if (nearestObs && player.isAlive) {
      const distance = nearestObs.x - (DINO_X + DINO_WIDTH);
      const timeToTakeoffMs = Math.max(0, Math.round(((distance - takeoffDistance) / (speed * 60)) * 1000));

      ctx.font = '9px monospace';
      ctx.fillStyle = '#737373';
      ctx.fillText(
        distance <= takeoffDistance ? 'TAKEOFF ZONE' : `Jump in ${timeToTakeoffMs}ms`,
        Math.min(CANVAS_WIDTH - 85, Math.max(takeoffX + 10, nearestObs.x - 20)),
        nearestObs.y - 8
      );
    }

    // Draw obstacles (white pixel art)
    for (const obs of obstacles) {
      ctx.fillStyle = '#ffffff';

      if (obs.type.startsWith('CACTUS')) {
        if (obs.type === 'CACTUS_SMALL') {
          ctx.fillRect(obs.x + 6, obs.y, 6, obs.height);
          ctx.fillRect(obs.x, obs.y + 10, 6, 4);
          ctx.fillRect(obs.x, obs.y + 6, 4, 8);
          ctx.fillRect(obs.x + 12, obs.y + 14, 6, 4);
          ctx.fillRect(obs.x + 14, obs.y + 10, 4, 8);
        } else if (obs.type === 'CACTUS_DOUBLE') {
          ctx.fillRect(obs.x + 4, obs.y, 6, obs.height);
          ctx.fillRect(obs.x, obs.y + 8, 4, 4);
          ctx.fillRect(obs.x, obs.y + 4, 4, 6);
          ctx.fillRect(obs.x + 20, obs.y + 4, 6, obs.height - 4);
          ctx.fillRect(obs.x + 26, obs.y + 12, 6, 4);
        } else if (obs.type === 'CACTUS_TRIPLE') {
          ctx.fillRect(obs.x + 4, obs.y, 6, obs.height);
          ctx.fillRect(obs.x + 18, obs.y + 4, 6, obs.height - 4);
          ctx.fillRect(obs.x + 32, obs.y + 2, 6, obs.height - 2);
        } else {
          ctx.fillRect(obs.x + 6, obs.y, 8, obs.height);
          ctx.fillRect(obs.x, obs.y + 12, 6, 4);
          ctx.fillRect(obs.x + 14, obs.y + 16, 6, 4);
        }
      } else {
        // Pterodactyl
        const wingUp = Math.floor(frame / 6) % 2 === 0;
        ctx.fillRect(obs.x, obs.y + 8, 12, 6);
        ctx.fillRect(obs.x - 4, obs.y + 10, 4, 3);
        ctx.fillRect(obs.x + 12, obs.y + 6, 16, 8);
        if (wingUp) {
          ctx.fillRect(obs.x + 14, obs.y - 4, 6, 10);
        } else {
          ctx.fillRect(obs.x + 14, obs.y + 14, 6, 10);
        }
      }
    }

    // Draw Dino (crisp white if alive, dim gray if crashed)
    const x = DINO_X;
    const y = player.y;
    const isGround = player.isGrounded;
    const legToggle = isGround && Math.floor(frame / 5) % 2 === 0;
    ctx.fillStyle = player.isAlive ? '#ffffff' : '#525252';

    if (player.isDucking) {
      ctx.fillRect(x, y + 14, 34, 14);
      ctx.fillRect(x + 28, y + 10, 16, 12);
      ctx.fillStyle = '#000000';
      ctx.fillRect(x + 38, y + 12, 3, 3);
      ctx.fillStyle = player.isAlive ? '#ffffff' : '#525252';
      ctx.fillRect(x + 6, y + 28, 4, 6);
      ctx.fillRect(x + 18, y + 28, 4, 6);
    } else {
      // Head
      ctx.fillRect(x + 22, y, 22, 16);
      // Eye
      ctx.fillStyle = '#000000';
      ctx.fillRect(x + 26, y + 3, 4, 4);
      ctx.fillStyle = player.isAlive ? '#ffffff' : '#525252';

      // Body & Tail
      ctx.fillRect(x + 12, y + 16, 22, 20);
      ctx.fillRect(x + 28, y + 22, 6, 4);
      ctx.fillRect(x + 6, y + 18, 6, 12);
      ctx.fillRect(x, y + 20, 6, 8);
      ctx.fillRect(x - 4, y + 22, 4, 5);

      // Legs
      if (!isGround) {
        ctx.fillRect(x + 14, y + 36, 4, 8);
        ctx.fillRect(x + 22, y + 36, 4, 8);
      } else {
        if (legToggle) {
          ctx.fillRect(x + 14, y + 36, 4, 11);
          ctx.fillRect(x + 14, y + 45, 6, 2);
          ctx.fillRect(x + 24, y + 36, 4, 6);
        } else {
          ctx.fillRect(x + 14, y + 36, 4, 6);
          ctx.fillRect(x + 24, y + 36, 4, 11);
          ctx.fillRect(x + 24, y + 45, 6, 2);
        }
      }
    }

    // Pending indicator
    if (isPending && player.isAlive) {
      ctx.strokeStyle = '#a3a3a3';
      ctx.lineWidth = 1;
      ctx.strokeRect(DINO_X - 4, player.y - 4, DINO_WIDTH + 8, DINO_HEIGHT + 8);
    }

    // Crash banner
    if (!player.isAlive) {
      ctx.fillStyle = '#171717';
      ctx.fillRect(CANVAS_WIDTH / 2 - 110, 26, 220, 42);
      ctx.strokeStyle = '#525252';
      ctx.lineWidth = 1;
      ctx.strokeRect(CANVAS_WIDTH / 2 - 110, 26, 220, 42);

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('CRASHED', CANVAS_WIDTH / 2, 43);

      ctx.fillStyle = '#a3a3a3';
      ctx.font = '10px monospace';
      ctx.fillText(player.crashReason || 'Decision timeout', CANVAS_WIDTH / 2, 57);
      ctx.textAlign = 'left';
    }
  });

  return (
    <div className="flex flex-col border border-neutral-800 bg-black text-white font-mono">
      {/* Header bar */}
      <div className="flex items-center justify-between px-3 py-2 bg-neutral-950 border-b border-neutral-800 text-xs">
        <div className="flex items-center gap-2">
          <span className="font-bold text-white uppercase">{name}</span>
          <span className="text-neutral-600">|</span>
          <span className="text-neutral-400">{engineName}</span>
        </div>

        <div className="flex items-center gap-3">
          <div>
            <span className="text-neutral-500">SCORE: </span>
            <span className="font-bold text-white">{score.toString().padStart(5, '0')}</span>
          </div>
        </div>
      </div>

      {/* Canvas Viewport */}
      <div className="relative w-full aspect-[640/180] bg-black">
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          className="w-full h-full block"
        />

        {/* Live Decision Readout */}
        <div className="absolute top-2 left-2 flex items-center gap-1.5">
          {player.isAlive ? (
            isPending ? (
              <span className="px-2 py-0.5 bg-neutral-900 border border-neutral-700 text-neutral-300 text-[11px] animate-pulse">
                DECIDING...
              </span>
            ) : player.scheduledJump ? (
              <span className="px-2 py-0.5 bg-neutral-950 border border-neutral-600 text-white text-[11px] font-bold">
                [ARMED: JUMP] {player.lastDecisionLatencyMs}ms (TAKEOFF READY)
              </span>
            ) : !player.isGrounded ? (
              <span className="px-2 py-0.5 bg-neutral-950 border border-neutral-700 text-white text-[11px] font-bold">
                [AIRBORNE] CLEARING OBSTACLE
              </span>
            ) : player.lastDecisionHallucinated ? (
              <span className="px-2 py-0.5 bg-neutral-900 border border-neutral-600 text-neutral-300 text-[11px] font-bold">
                [HALLUCINATED: {player.lastDecisionText}] {modelLatency}ms
              </span>
            ) : (
              <span className="px-2 py-0.5 bg-neutral-950 border border-neutral-700 text-white text-[11px] font-bold">
                [{player.lastDecisionText}] {modelLatency}ms {player.lastDecisionOnTime ? '(ON-TIME)' : '(TOO LATE)'}
              </span>
            )
          ) : (
            <span className="px-2 py-0.5 bg-neutral-900 border border-neutral-700 text-neutral-400 text-[11px]">
              CRASHED: {player.crashReason}
            </span>
          )}
        </div>

        {/* Cost ticker */}
        <div className="absolute top-2 right-2 text-[10px] text-neutral-400 bg-neutral-950 px-2 py-0.5 border border-neutral-800">
          ${costUsd.toFixed(6)}
        </div>
      </div>
    </div>
  );
};
