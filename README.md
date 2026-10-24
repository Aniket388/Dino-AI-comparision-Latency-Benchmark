https://jev-vs-general-llms-real-time-dino.onrender.com/

# Dino LLM Benchmarking System

A real-time, side-by-side Chrome Dino-style game that pits **JEV** (TypeSafe's decision model) against a general-purpose LLM such as **Google Gemini** on identical, seeded obstacles. Every decision is timed, and a decision that arrives too late makes that dino crash, so latency becomes something you can see.

**Live demo:** https://jev-vs-general-llms-real-time-dino.onrender.com/ (free tier, may take ~30-50 seconds to wake up)

---

## Why this project exists

Most AI comparisons measure answer quality on text tasks. Many real systems, such as game agents, control loops, trading signals and robotics, instead need a small decision (act or don't act) delivered before a deadline. A late answer is a wrong answer.

General-purpose LLMs are built to generate text token by token. **JEV is a different kind of model**: it is a specialized decision model, not a general-purpose LLM. You give it a state and a typed question, and it returns a typed answer (for example a choice between `JUMP` and `NO_JUMP`) with no generated prose.

This project exists to answer a practical question in a way anyone can watch: on a deadline-driven decision task, how does a specialized decision model compare with a general-purpose LLM in speed, reliability and cost?

The Chrome Dino game is a good test bed because it is familiar, the decision is binary, and the deadline is physical: the obstacle keeps moving whether or not the model has answered.

---

## How it works

1. **Seeded game engine.** A deterministic random generator (Mulberry32) produces the obstacle sequence from a seed, so both dinos face exactly the same track and runs can be repeated.
2. **Two independent dinos.** Each side has its own physics and collision state. One side's mistake does not affect the other, but both share the same obstacles and speed curve.
3. **Same game state to both.** When the next obstacle enters the observation range (about 680 px), the app builds one state object (obstacle type, distance, speed, time to impact, whether the dino is grounded) and sends it to both engines.
4. **Each engine answers.**
   - **JEV** is called through OpenRouter's Decisions API with a typed Choice question (`JUMP` or `NO_JUMP`).
   - **Gemini** (or any other chat model) is prompted to reply with `JUMP` or `NO_JUMP` and its reply is parsed.
5. **The answer arms a jump.** A `JUMP` answer schedules the jump for the takeoff zone in front of the obstacle. If the answer arrives when the obstacle is already too close, the dino crashes and the crash reason (a timeout, or a wrong or unusable answer) is shown on the canvas.
6. **Speed ramps up** like the real game, so the time left to decide shrinks as a run continues. Slower engines eventually run out of time first.
7. **Best of 5 mode** replays five rounds with fixed seeds (`10000 + round x 1337`) so a series can be reproduced.

The server (`server.ts`) makes all model calls so API keys are never shipped to the browser's source. Visitors can paste their own key in the **Configure APIs** screen; a key typed in the browser takes priority over any server-side environment variable. Each side must pass a connection test before a match can start.

---

## What is measured

- Per-decision latency (displayed live on each side, and averaged per Best of 5 round)
- Late-decision crashes and the reason for each crash
- Survival time and game score per dino
- Running cost per side

See **Current status** below for which of these are fully implemented.

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS 4 |
| Rendering | HTML5 Canvas 2D (custom game loop and sprites) |
| Game logic | Custom deterministic engine with a seeded PRNG (`src/game`) |
| Backend | Node.js, Express, run with `tsx` |
| Model access | OpenRouter (JEV Decisions API and other models), `@google/genai` SDK for Gemini |
| UI extras | `lucide-react` icons, `motion` animation, `canvas-confetti` |
| Config | `dotenv` for optional server-side keys |
| Hosting | Render (Node web service, free tier) |
| Scaffolding | Started from the Google AI Studio repository template |

### Project structure

```
server.ts                  Express server: /api/status, /api/test-connection, /api/decide/agent
src/App.tsx                UI, match control, decision dispatch, Best of 5 logic
src/components/DinoCanvas  Canvas rendering for each dino
src/game/dinoEngine.ts     Physics, obstacles, collisions, takeoff logic
src/game/seedRandom.ts     Seeded random number generator
src/types/benchmark.ts     Shared types
```

---

## Run it locally

```bash
git clone https://github.com/Aniket388/Dino-AI-comparision-Latency-Benchmark.git
cd Dino-AI-comparision-Latency-Benchmark
npm install
npm run dev
```

Open the printed local address, click **Configure APIs**, paste a key for each side, test both connections and start a match.

Optional server-side keys go in a `.env` file (see `.env.example`): `GEMINI_API_KEY` and `OPENROUTER_API_KEY`. If these are set, they act as a fallback for visitors who don't enter their own key, so leave them unset on a public deployment unless you want to pay for that usage.

## Deploy (Render, free)

- Service type: **Web Service**, runtime **Node**
- Build command: `npm install && npm run build`
- Start command: `npm start`
- Instance type: Free

This app needs a long-running Node server, so a static-only host will not work. Serverless platforms need the API routes rewritten as functions.

---

## Current status and known limitations

This is a working prototype, not yet a finished benchmark. Being open about that:

- **Simulated fallback.** If a key is missing or a call fails, the server can fall back to calibrated, simulated decisions. The response is flagged internally, but the UI does not yet show whether a run was live or simulated. Treat numbers as measurements only when real keys are used and connection tests pass.
- **Costs are estimates.** Cost per decision currently uses fixed per-call assumptions rather than the usage data returned by each API.
- **Metrics gap.** Average latency is computed per round, but P50/P95 latency, decisions per second and timeout counts are not yet calculated.
- **No stored results.** Nothing is saved between sessions, and there is no multi-trial headless runner yet.
- **Duck action.** Only `JUMP` and `NO_JUMP` are decided, so low flying obstacles must be jumped.

## Roadmap

- Show clearly whether each decision came from a live API call or the simulated fallback
- Read real cost and token usage from each API response
- Add P50/P95 latency, decisions per second and timeout counts
- Add a headless multi-trial runner with fixed seeds and stored results
- Publish the methodology, measured results and a demo video

---

*JEV pricing and latency figures on OpenRouter are listings (about $0.042 per million input tokens, free output, about 0.20 s average latency). This project reports its own measured values once the measurement layer is complete.*
