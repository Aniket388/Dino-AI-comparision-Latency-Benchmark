import { SeededPRNG } from './seedRandom';
import { Obstacle, ObstacleType, ActionType, DecisionPayload } from '../types/benchmark';

export const CANVAS_WIDTH = 640;
export const CANVAS_HEIGHT = 180;
export const GROUND_Y = 145;
export const DINO_X = 50;
export const DINO_WIDTH = 44;
export const DINO_HEIGHT = 47;
export const BASE_SPEED = 6.2;
export const BASE_GRAVITY = 0.68;
export const BASE_JUMP_VELOCITY = -11.8;

export class DinoPlayer {
  public y: number = GROUND_Y - DINO_HEIGHT;
  public vy: number = 0;
  public isGrounded: boolean = true;
  public isDucking: boolean = false;
  public isAlive: boolean = true;
  public crashReason: string = '';
  public finalScore: number = 0;
  public lastEvaluatedObstacleId: number = -1;
  public pendingDecision: {
    obstacleId: number;
    requestStartTime: number;
    deadlineTimestamp: number;
    timeToImpactMs: number;
  } | null = null;
  public lastDecisionText: string = 'READY';
  public lastDecisionLatencyMs: number = 0;
  public lastDecisionOnTime: boolean = true;
  public scheduledJump: {
    obstacleId: number;
    takeoffDistance: number;
  } | null = null;
  public lastDecisionHallucinated: boolean = false;
  public lastDecisionLate: boolean = false;

  reset() {
    this.y = GROUND_Y - DINO_HEIGHT;
    this.vy = 0;
    this.isGrounded = true;
    this.isDucking = false;
    this.isAlive = true;
    this.crashReason = '';
    this.finalScore = 0;
    this.lastEvaluatedObstacleId = -1;
    this.pendingDecision = null;
    this.lastDecisionText = 'READY';
    this.lastDecisionLatencyMs = 0;
    this.lastDecisionOnTime = true;
    this.scheduledJump = null;
    this.lastDecisionHallucinated = false;
    this.lastDecisionLate = false;
  }

  jump(currentSpeed: number = BASE_SPEED) {
    if (this.isGrounded && this.isAlive) {
      // Invariant parabolic trajectory: scale initial upward velocity with speed ratio
      const r = Math.max(0.08, currentSpeed / BASE_SPEED);
      this.vy = BASE_JUMP_VELOCITY * r;
      this.isGrounded = false;
    }
  }

  duck(active: boolean) {
    if (this.isGrounded && this.isAlive) {
      this.isDucking = active;
    }
  }

  updatePhysics(currentSpeed: number = BASE_SPEED) {
    if (!this.isGrounded) {
      // Invariant parabolic trajectory: scale gravity with r^2 so jump height is constant (~102px)
      // and horizontal coverage matches game speed identically
      const r = Math.max(0.08, currentSpeed / BASE_SPEED);
      const gravity = BASE_GRAVITY * (r * r);

      this.y += this.vy;
      this.vy += gravity;

      if (this.y >= GROUND_Y - DINO_HEIGHT) {
        this.y = GROUND_Y - DINO_HEIGHT;
        this.vy = 0;
        this.isGrounded = true;
      }
    }
  }

  getHitbox() {
    const h = this.isDucking ? 28 : DINO_HEIGHT;
    const y = this.isDucking ? (GROUND_Y - 28) : this.y;
    // slight inset for fair collisions
    return {
      x: DINO_X + 6,
      y: y + 4,
      width: DINO_WIDTH - 12,
      height: h - 6,
    };
  }
}

export class DualDinoSimulation {
  public obstacles: Obstacle[] = [];
  public speed: number = 6.2;
  public baseSpeed: number = 6.2;
  public speedMultiplier: number = 1.0;
  public score: number = 0;
  public distanceTraveled: number = 0;
  public isRunning: boolean = false;
  public isPaused: boolean = false;
  public prng: SeededPRNG;
  public currentSeed: number;
  private nextObstacleId: number = 1;
  private lastObstacleX: number = CANVAS_WIDTH;
  public elapsedSeconds: number = 0;

  public jevDino: DinoPlayer;
  public geminiDino: DinoPlayer;

  // Track ground lines & clouds
  public clouds: { x: number; y: number; speed: number }[] = [];
  public groundBumps: { x: number; width: number }[] = [];

  constructor(seed: number = 1337) {
    this.currentSeed = seed;
    this.prng = new SeededPRNG(seed);
    this.jevDino = new DinoPlayer();
    this.geminiDino = new DinoPlayer();
    this.initWorld();
  }

  public setSeed(newSeed: number) {
    this.currentSeed = newSeed;
    this.reset();
  }

  public setSpeedMultiplier(mult: number) {
    this.speedMultiplier = Math.max(0.1, Math.min(3.5, mult));
    this.speed = Math.max(0.4, Math.min(25.0, (this.baseSpeed + (this.score * 0.0035)) * this.speedMultiplier));
  }

  public initWorld() {
    this.obstacles = [];
    this.speed = this.baseSpeed * this.speedMultiplier;
    this.score = 0;
    this.distanceTraveled = 0;
    this.elapsedSeconds = 0;
    this.nextObstacleId = 1;
    this.lastObstacleX = CANVAS_WIDTH;
    this.prng.reset(this.currentSeed);
    this.jevDino.reset();
    this.geminiDino.reset();

    // Background clouds
    this.clouds = [
      { x: 120, y: 35, speed: 0.8 },
      { x: 380, y: 50, speed: 0.6 },
      { x: 580, y: 25, speed: 0.7 },
    ];

    // Initial ground decorative dashes
    this.groundBumps = [];
    for (let x = 0; x < CANVAS_WIDTH; x += 30) {
      if (this.prng.next() > 0.6) {
        this.groundBumps.push({ x, width: this.prng.nextInt(4, 18) });
      }
    }

    // Pre-spawn first obstacle at safe distance
    this.spawnObstacle(CANVAS_WIDTH + 140);
  }

  public reset() {
    this.isRunning = false;
    this.isPaused = false;
    this.initWorld();
  }

  public spawnObstacle(atX?: number) {
    const types: ObstacleType[] = [
      'CACTUS_SMALL',
      'CACTUS_DOUBLE',
      'CACTUS_TRIPLE',
      'CACTUS_TALL',
      'PTERODACTYL_LOW',
    ];

    const type = this.prng.pick(types);
    let width = 20;
    let height = 38;
    let y = GROUND_Y - height;

    switch (type) {
      case 'CACTUS_SMALL':
        width = 18;
        height = 36;
        y = GROUND_Y - height;
        break;
      case 'CACTUS_DOUBLE':
        width = 38;
        height = 36;
        y = GROUND_Y - height;
        break;
      case 'CACTUS_TRIPLE':
        width = 54;
        height = 38;
        y = GROUND_Y - height;
        break;
      case 'CACTUS_TALL':
        width = 24;
        height = 48;
        y = GROUND_Y - height;
        break;
      case 'PTERODACTYL_LOW':
        width = 44;
        height = 30;
        y = GROUND_Y - 42; // Low flying pterodactyl requiring duck or jump
        break;
      case 'PTERODACTYL_HIGH':
        width = 44;
        height = 30;
        y = GROUND_Y - 70;
        break;
    }

    const spawnX = atX ?? Math.max(CANVAS_WIDTH, this.lastObstacleX + this.getObstacleGap());

    const obstacle: Obstacle = {
      id: this.nextObstacleId++,
      type,
      x: spawnX,
      y,
      width,
      height,
    };

    this.obstacles.push(obstacle);
    this.lastObstacleX = spawnX + width;
  }

  private getObstacleGap(): number {
    // Gap scales realistically with speed so it's always physically jumpable
    const minGap = 240 + Math.floor(this.speed * 18);
    const maxGap = 420 + Math.floor(this.speed * 28);
    return this.prng.nextInt(minGap, maxGap);
  }

  /**
   * Main game physics step (runs once per 60fps frame)
   */
  public update(dtSeconds: number = 0.0166) {
    if (!this.isRunning || this.isPaused) return;

    // Both dinos dead? Stop
    if (!this.jevDino.isAlive && !this.geminiDino.isAlive) {
      this.isRunning = false;
      return;
    }

    this.elapsedSeconds += dtSeconds;
    this.distanceTraveled += this.speed;
    this.score = Math.floor(this.distanceTraveled / 8);

    // Progressive speed scaling with user multiplier down to 0.1x
    this.speed = Math.max(0.4, Math.min(25.0, (this.baseSpeed + (this.score * 0.0035)) * this.speedMultiplier));

    // Update cloud positions
    for (const cloud of this.clouds) {
      cloud.x -= cloud.speed;
      if (cloud.x < -80) {
        cloud.x = CANVAS_WIDTH + 60;
        cloud.y = 20 + this.prng.nextInt(0, 45);
      }
    }

    // Update ground dashes
    for (const bump of this.groundBumps) {
      bump.x -= this.speed;
      if (bump.x < -20) {
        bump.x = CANVAS_WIDTH + this.prng.nextInt(0, 40);
      }
    }

    // Move obstacles left
    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      const obs = this.obstacles[i];
      obs.x -= this.speed;

      // Remove obstacles that have moved off screen
      if (obs.x + obs.width < -50) {
        this.obstacles.splice(i, 1);
      }
    }

    // Spawn new obstacles as needed
    const lastX = this.obstacles.length > 0 
      ? Math.max(...this.obstacles.map(o => o.x + o.width))
      : 0;

    if (lastX < CANVAS_WIDTH + 100) {
      this.lastObstacleX = lastX;
      this.spawnObstacle();
    }

    const takeoffDistance = this.getTakeoffDistance();

    // Check scheduled jumps for Dino 1
    if (this.jevDino.isAlive && this.jevDino.scheduledJump) {
      const obs = this.obstacles.find((o) => o.id === this.jevDino.scheduledJump!.obstacleId);
      if (obs) {
        const distance = obs.x - (DINO_X + DINO_WIDTH);
        if (distance <= takeoffDistance && distance >= -25) {
          this.jevDino.jump(this.speed);
          this.jevDino.scheduledJump = null;
        }
      } else {
        this.jevDino.scheduledJump = null;
      }
    }

    // Check scheduled jumps for Dino 2
    if (this.geminiDino.isAlive && this.geminiDino.scheduledJump) {
      const obs = this.obstacles.find((o) => o.id === this.geminiDino.scheduledJump!.obstacleId);
      if (obs) {
        const distance = obs.x - (DINO_X + DINO_WIDTH);
        if (distance <= takeoffDistance && distance >= -25) {
          this.geminiDino.jump(this.speed);
          this.geminiDino.scheduledJump = null;
        }
      } else {
        this.geminiDino.scheduledJump = null;
      }
    }

    // Update Dino physics scaled with speed
    if (this.jevDino.isAlive) {
      this.jevDino.updatePhysics(this.speed);
      this.checkCollision(this.jevDino, 'JEV');
    }

    if (this.geminiDino.isAlive) {
      this.geminiDino.updatePhysics(this.speed);
      this.checkCollision(this.geminiDino, 'GEMINI');
    }
  }

  public getObservationDistance(): number {
    // Senses approaching obstacle with plenty of runway for live cloud LLMs (680px)
    // Canvas is 640px wide (+ spawned ahead), giving up to 3.5s reaction window at 0.5x speed
    return 680;
  }

  public getTakeoffDistance(): number {
    // Standard fixed takeoff distance where parabolic jump arc clears obstacle
    return 82;
  }

  private checkCollision(dino: DinoPlayer, agentTag: 'JEV' | 'GEMINI') {
    const box1 = dino.getHitbox();

    for (const obs of this.obstacles) {
      // Simple AABB collision check
      const box2 = {
        x: obs.x + 3,
        y: obs.y + 3,
        width: obs.width - 6,
        height: obs.height - 6,
      };

      const collided = (
        box1.x < box2.x + box2.width &&
        box1.x + box1.width > box2.x &&
        box1.y < box2.y + box2.height &&
        box1.y + box1.height > box2.y
      );

      if (collided) {
        dino.isAlive = false;
        dino.finalScore = this.score;
        if (dino.lastDecisionLate) {
          dino.crashReason = dino.crashReason || 'TIMEOUT: Decision arrived too late for jump';
        } else if (dino.lastDecisionHallucinated) {
          const raw = dino.lastDecisionText?.slice(0, 28) || 'INVALID';
          dino.crashReason = `HALLUCINATION: Invalid response "${raw}" for ${obs.type.replace('_', ' ')}`;
        } else if (dino.lastDecisionText === 'NO_JUMP') {
          dino.crashReason = `WRONG DECISION: Answered NO_JUMP for ${obs.type.replace('_', ' ')}`;
        } else {
          dino.crashReason = `IMPACT CRASH: Failed to clear ${obs.type.replace('_', ' ')}`;
        }
        break;
      }
    }
  }

  /**
   * Find the next obstacle in front of the Dino that needs a decision
   */
  public getNextActionableObstacle(dino: DinoPlayer): {
    obstacle: Obstacle;
    distance: number;
    timeToImpactMs: number;
    timeToTakeoffMs: number;
    takeoffDistance: number;
  } | null {
    const horizonDistance = this.getObservationDistance();
    const takeoffDistance = this.getTakeoffDistance();

    for (const obs of this.obstacles) {
      const distance = obs.x - (DINO_X + DINO_WIDTH);
      if (distance > 0 && distance <= horizonDistance) {
        const timeToImpactMs = Math.round((distance / (this.speed * 60)) * 1000);
        const timeToTakeoffMs = Math.max(0, Math.round(((distance - takeoffDistance) / (this.speed * 60)) * 1000));
        return { obstacle: obs, distance, timeToImpactMs, timeToTakeoffMs, takeoffDistance };
      }
    }
    return null;
  }

  /**
   * Generate payload to send to model for evaluation
   */
  public createDecisionPayload(dino: DinoPlayer, obs: Obstacle, distance: number, timeToImpactMs: number): DecisionPayload {
    const optimalTimeMs = Math.round((distance / (this.speed * 60)) * 1000);
    const minWindowMs = Math.max(50, optimalTimeMs - 160);
    const maxWindowMs = optimalTimeMs + 60;

    return {
      obstacleType: obs.type,
      distance: Math.round(distance),
      speed: Number(this.speed.toFixed(2)),
      timeToImpactMs,
      criticalReactionWindowMs: [minWindowMs, maxWindowMs],
      grounded: dino.isGrounded,
      dinoY: Math.round(dino.y),
    };
  }
}
