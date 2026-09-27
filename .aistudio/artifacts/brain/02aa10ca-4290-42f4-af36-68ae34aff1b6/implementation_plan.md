# Best-of-5 Benchmark Mode Implementation

The **BEST-OF-5** benchmark mode has been integrated into the Chrome Dino AI Showdown, preserving the black terminal-style UI and existing gameplay/API architecture while adding automated multi-round evaluation.

---

## Implemented Features

### 1. Automated 5-Round Series Orchestration
- **"BEST OF 5" Button**: Added to the header control bar next to `START MATCH` and `CONFIGURE APIS`.
- **Automatic Execution**: Runs exactly 5 rounds sequentially with a brief 2-second transition between rounds.
- **Fresh & Synchronized**: Both Dinos reset cleanly at the beginning of every round (`sim.reset()`, `finalScore = 0`, positions, clouds, and sensory buffers reset).
- **Deterministic Obstacle Fairness**: Each round generates an identical obstacle sequence for both models using a synchronized per-round PRNG seed (`10000 + roundNum * 1337`).

### 2. Strict Game Speed Locking
- Game speed is locked at the beginning of the series and held strictly constant for all 5 rounds.
- Speed sliders, +/- buttons, and preset buttons are disabled while Best-of-5 is running to guarantee no speed changes during a round or series.

### 3. Round Winner & Tiebreak Rules
- **Round Winner**: Determined by **HIGHER SCORE**. If both Dinos crash, their final scores are compared and the higher scorer wins the round.
- **Round Draw**: If scores are identical, the round is recorded as a `DRAW`.
- **Overall Series Winner**:
  1. Most round wins after 5 rounds.
  2. If round wins are tied (e.g. 2-2 with 1 draw), higher **TOTAL SCORE** across all 5 rounds acts as the tiebreaker.
  3. If total scores are also tied, the series is declared a `DRAW`.

### 4. Live Results Table
Renders directly below the viewports as rounds finish:

| ROUND | DINO 1 SCORE | DINO 2 SCORE | ROUND WINNER | DINO 1 LATENCY | DINO 2 LATENCY | COST |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| ROUND 1 | 00585 | 01389 | DINO 2 | 24ms | 474ms | $0.000150 |
| ROUND 2 | 00920 | 00640 | DINO 1 | 22ms | 510ms | $0.000130 |
| ... | ... | ... | ... | ... | ... | ... |

### 5. Final Series Completion Card
Displays on round 5 completion:
- **`BEST OF 5 COMPLETE`**
- **`DINO 1: X WINS`**
- **`DINO 2: Y WINS`**
- **`DRAWS: Z`**
- **`TOTAL SCORE: XXXX vs XXXX`**
- **`OVERALL WINNER: DINO X`**
- Comparative statistics:
  - Average Score & Best Score (Dino 1 vs Dino 2)
  - Average Decision / Reaction Latency
  - Total API Cost ($)
  - Number of Crashes / Timeouts

### 6. Controls & Backward Compatibility
- **`STOP SERIES`**: Replaces the Best-of-5 button while a series is active to allow cancellation at any time.
- **`RESET SERIES`**: Clears round history, metrics, and resets the board.
- **Single-Match Mode**: The standard `START MATCH` / `PAUSE` / `RESET` workflow remains completely unchanged.
