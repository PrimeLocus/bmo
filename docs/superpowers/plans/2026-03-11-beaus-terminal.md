# Beau's Terminal — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold "Beau's Terminal" — a self-hosted SvelteKit dashboard for the BMO robot that displays real-time MQTT state, manages RAG memory, edits Beau's system prompt, and migrates the existing build tracker.

**Architecture:** SvelteKit 5 (Svelte 5 runes) with `adapter-node` for Proxmox Docker deployment. A server-side MQTT bridge subscribes to Mosquitto and pushes state to the browser via WebSocket. All persistence uses SQLite via Drizzle ORM. Existing parts/software/ideas data from `bmo-command-center.jsx` is seeded into the database.

**Tech Stack:** SvelteKit 2 + Svelte 5, TypeScript, Tailwind CSS v4, `@sveltejs/adapter-node`, `mqtt`, `better-sqlite3`, `drizzle-orm`, `ws`

---

## Chunk 1: Project Scaffold + Database

### Task 1: Initialize SvelteKit project

**Files:**
- Create: `beau-terminal/` (entire project scaffold)
- Create: `beau-terminal/package.json`
- Create: `beau-terminal/svelte.config.js`
- Create: `beau-terminal/vite.config.ts`

- [ ] **Step 1: Scaffold SvelteKit**

```bash
cd E:/Dev/BMO
npx sv create beau-terminal --template skeleton --types ts --no-add-ons
cd beau-terminal
```

- [ ] **Step 2: Install adapter-node**

```bash
npm install -D @sveltejs/adapter-node
```

- [ ] **Step 3: Update svelte.config.js**

Replace the contents of `beau-terminal/svelte.config.js`:
```js
import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({ out: 'build' }),
  },
};

export default config;
```

- [ ] **Step 4: Install Tailwind v4**

```bash
npm install -D tailwindcss @tailwindcss/vite
```

- [ ] **Step 5: Update vite.config.ts**

```ts
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
});
```

- [ ] **Step 6: Create src/app.css**

```css
@import "tailwindcss";

:root {
  --bmo-green: #00e5a0;
  --bmo-bg: #0a0f0d;
  --bmo-surface: #0c1710;
  --bmo-border: #1a3a2a;
  --bmo-text: #c8ffd4;
  --bmo-muted: #3a6a4a;
}

body {
  background: var(--bmo-bg);
  color: var(--bmo-text);
  font-family: 'Courier New', Courier, monospace;
}
```

- [ ] **Step 7: Import app.css in src/app.html**

Add `<link rel="stylesheet" href="%sveltekit.assets%/app.css">` — actually import in layout. Skip for now, handled in Task 5.

- [ ] **Step 8: Verify dev server starts**

```bash
npm run dev
```
Expected: server starts on `http://localhost:5173` with no errors.

- [ ] **Step 9: Commit**

```bash
git init
git add -A
git commit -m "feat(terminal): init SvelteKit project with adapter-node + Tailwind v4"
```

---

### Task 2: Database schema + seed

**Files:**
- Create: `beau-terminal/src/lib/server/db/schema.ts`
- Create: `beau-terminal/src/lib/server/db/index.ts`
- Create: `beau-terminal/src/lib/server/db/seed.ts`
- Create: `beau-terminal/drizzle.config.ts`

- [ ] **Step 1: Install database deps**

```bash
npm install better-sqlite3 drizzle-orm
npm install -D drizzle-kit @types/better-sqlite3
```

- [ ] **Step 2: Create schema**

Create `src/lib/server/db/schema.ts`:
```ts
import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

export const parts = sqliteTable('parts', {
  id: integer('id').primaryKey(),
  name: text('name').notNull(),
  category: text('category').notNull(),
  price: real('price').notNull().default(0),
  source: text('source').notNull().default(''),
  tracking: text('tracking').notNull().default(''),
  status: text('status').notNull().default('ordered'), // ordered | delivered | pending
  eta: text('eta').notNull().default(''),
  role: text('role').notNull().default(''),
  notes: text('notes').notNull().default(''),
});

export const softwarePhases = sqliteTable('software_phases', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  phase: text('phase').notNull(),
  order: integer('order').notNull(),
});

export const softwareSteps = sqliteTable('software_steps', {
  id: text('id').primaryKey(), // s1, s2, v1, etc.
  phaseId: integer('phase_id').notNull().references(() => softwarePhases.id),
  text: text('text').notNull(),
  done: integer('done', { mode: 'boolean' }).notNull().default(false),
  order: integer('order').notNull(),
});

export const ideas = sqliteTable('ideas', {
  id: text('id').primaryKey(), // i1, i2, etc.
  priority: text('priority').notNull().default('medium'), // high | medium | low
  text: text('text').notNull(),
  done: integer('done', { mode: 'boolean' }).notNull().default(false),
});

export const haikus = sqliteTable('haikus', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  text: text('text').notNull(),
  trigger: text('trigger').notNull().default(''), // time_of_day | weather | camera | project | session_end
  mode: text('mode').notNull().default('ambient'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const promptHistory = sqliteTable('prompt_history', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  content: text('content').notNull(),
  label: text('label').notNull().default(''),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});
```

- [ ] **Step 3: Create DB client**

Create `src/lib/server/db/index.ts`:
```ts
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from './schema.js';
import { join } from 'path';

const DB_PATH = process.env.DB_PATH || join(process.cwd(), 'data', 'beau.db');

// Ensure data dir exists
import { mkdirSync } from 'fs';
mkdirSync(join(process.cwd(), 'data'), { recursive: true });

const sqlite = new Database(DB_PATH);
sqlite.pragma('journal_mode = WAL');

export const db = drizzle(sqlite, { schema });

// Run migrations on startup
migrate(db, { migrationsFolder: join(process.cwd(), 'drizzle') });
```

- [ ] **Step 4: Create drizzle config**

Create `drizzle.config.ts`:
```ts
import type { Config } from 'drizzle-kit';

export default {
  schema: './src/lib/server/db/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: {
    url: process.env.DB_PATH || './data/beau.db',
  },
} satisfies Config;
```

- [ ] **Step 5: Generate initial migration**

```bash
npx drizzle-kit generate
```
Expected: creates `drizzle/0000_initial.sql`

- [ ] **Step 6: Create seed script**

Create `src/lib/server/db/seed.ts` — migrates data from `bmo-command-center.jsx`:
```ts
import { db } from './index.js';
import { parts, softwarePhases, softwareSteps, ideas } from './schema.js';

export async function seed() {
  const existingParts = await db.select().from(parts);
  if (existingParts.length > 0) return; // already seeded

  // PARTS — from bmo-command-center.jsx
  await db.insert(parts).values([
    { id: 1, name: 'Raspberry Pi 5 16GB', category: 'Core', price: 226.91, source: 'PiShop.us', tracking: '', status: 'ordered', eta: 'Mar 13', role: 'The brain. Quad-core ARM Cortex-A76 @ 2.4GHz. 16GB RAM gives headroom for Ollama + RAG + HA integration + face display all running simultaneously.', notes: '' },
    { id: 2, name: 'Raspberry Pi AI HAT+ 2', category: 'AI', price: 130.00, source: 'CanaKit', tracking: '', status: 'ordered', eta: 'Mar 13–14', role: 'Reflex brain. Hailo-10H NPU with 8GB onboard RAM. Handles vision tagging, fast banter, wake word logic at 2.5W.', notes: '' },
    { id: 3, name: 'Raspberry Pi Active Cooler', category: 'Core', price: 0, source: 'PiShop.us (bundled)', tracking: '', status: 'ordered', eta: 'Mar 13', role: 'Mandatory under LLM load. Keeps the Pi 5 from throttling during sustained inference.', notes: '' },
    { id: 4, name: 'Raspberry Pi Camera Module 3', category: 'Sensors', price: 27.50, source: 'PiShop.us', tracking: '', status: 'ordered', eta: 'Mar 13', role: "BMO's eyes. 12MP, 76° FOV, autofocus. Feeds the HAT+ 2's vision pipeline.", notes: '' },
    { id: 5, name: '27W USB-C Power Supply', category: 'Core', price: 12.95, source: 'PiShop.us', tracking: '', status: 'ordered', eta: 'Mar 13', role: 'Official Pi 5 PSU. 5.1V 5A. Required — underpowered supplies cause instability under AI load.', notes: '' },
    { id: 6, name: 'Micro-HDMI to HDMI Cable', category: 'Setup', price: 7.45, source: 'PiShop.us', tracking: '', status: 'ordered', eta: 'Mar 13', role: 'Setup only. Pi 5 uses micro-HDMI. Needed for initial OS flash and debug.', notes: '' },
    { id: 7, name: 'USB-C PD PiSwitch', category: 'Setup', price: 12.95, source: 'CanaKit', tracking: '', status: 'ordered', eta: 'Mar 13–14', role: 'Inline power switch for USB-C. Lets you cut/restore power without unplugging.', notes: '' },
    { id: 8, name: 'ReSpeaker 2-Mics HAT v2.0', category: 'Audio', price: 13.99, source: 'Seeed Studio', tracking: '', status: 'ordered', eta: 'Mar 19–26', role: "BMO's ears. Dual far-field microphones. Handles wake word detection and Whisper STT.", notes: 'Must be v2.0 — v1 has Pi 5 compatibility issues' },
    { id: 9, name: 'Mono Enclosed Speaker 4R 5W', category: 'Audio', price: 2.00, source: 'Seeed Studio', tracking: '', status: 'ordered', eta: 'Mar 19–26', role: "Beau's voice. Plugs into ReSpeaker HAT's JST 2.0 connector.", notes: '' },
    { id: 10, name: 'Geekworm X1200 UPS HAT', category: 'Power', price: 43.00, source: 'Amazon', tracking: '', status: 'ordered', eta: 'Mar 13', role: 'Battery backup for Pi 5. 2× 18650 cells. Keeps BMO alive during moves and power blips.', notes: '' },
    { id: 11, name: 'Samsung 30Q 18650 Batteries ×2', category: 'Power', price: 21.72, source: 'Illumn', tracking: '', status: 'ordered', eta: 'TBD', role: '3000mAh flat-top 18650 cells for X1200 UPS HAT.', notes: 'Flat top only' },
    { id: 12, name: 'Freenove 5" DSI Touchscreen', category: 'Display', price: 35.95, source: 'Amazon', tracking: '', status: 'ordered', eta: 'Mar 14', role: "BMO's face. 800×480 IPS, 5-point capacitive touch, driver-free MIPI DSI.", notes: '' },
    { id: 13, name: 'Sabrent NVMe Enclosure (USB 3.2)', category: 'Storage', price: 19.99, source: 'Amazon', tracking: '', status: 'ordered', eta: 'Mar 12–13', role: 'External NVMe housing. HAT+ 2 occupies the Pi PCIe slot, so NVMe must connect via USB 3.2.', notes: 'NVMe Only variant (EC-PNVO)' },
    { id: 14, name: 'Team Group MP33 256GB NVMe', category: 'Storage', price: 67.57, source: 'Walmart', tracking: '', status: 'ordered', eta: 'TBD', role: 'Primary storage. OS, Ollama models, ChromaDB RAG vector store, custom Piper voice model.', notes: '' },
    { id: 15, name: 'SanDisk 64GB High Endurance microSD', category: 'Storage', price: 29.42, source: 'Walmart', tracking: '', status: 'ordered', eta: 'TBD', role: 'OS boot drive. High Endurance rated for continuous read/write.', notes: '' },
    { id: 16, name: 'SB Components GPIO Stacking Header', category: 'Hardware', price: 7.99, source: 'Amazon', tracking: '', status: 'ordered', eta: 'Mar 12–13', role: 'Extra-tall 2×20 female stacking header. Solves HAT layering — ReSpeaker stacks on AI HAT+ 2.', notes: 'Pack of 5' },
  ]);

  // SOFTWARE PHASES
  const phaseData = [
    { phase: 'Phase 1 — OS & Boot', order: 1, steps: [
      { id: 's1', text: 'Flash Raspberry Pi OS Trixie 64-bit to microSD', order: 1 },
      { id: 's2', text: 'Boot Pi 5, run sudo apt update && sudo apt upgrade', order: 2 },
      { id: 's3', text: "Enable SSH, set hostname to 'bmo'", order: 3 },
      { id: 's4', text: 'Install NVMe SSD in Sabrent enclosure, format as ext4, mount at /mnt/bmo', order: 4 },
      { id: 's5', text: 'Move /home to NVMe for fast storage', order: 5 },
    ]},
    { phase: 'Phase 2 — HAT+ 2 & Vision', order: 2, steps: [
      { id: 's6', text: 'Assemble HAT+ 2 on Pi 5 with Active Cooler + stacking header', order: 1 },
      { id: 's7', text: 'Install HailoRT drivers: sudo apt install hailo-all', order: 2 },
      { id: 's8', text: 'Verify HAT detected: hailortcli fw-control identify', order: 3 },
      { id: 's9', text: 'Test camera: rpicam-hello with YOLOv8 object detection', order: 4 },
      { id: 's10', text: 'Install hailo-ollama for HAT LLM inference', order: 5 },
    ]},
    { phase: 'Phase 3 — Ollama (Pi CPU Brain)', order: 3, steps: [
      { id: 's11', text: 'Install Ollama: curl -fsSL https://ollama.com/install.sh | sh', order: 1 },
      { id: 's12', text: 'Pull philosopher brain: ollama pull gemma3:4b', order: 2 },
      { id: 's13', text: 'Pull reflex brain: ollama pull qwen2.5:1.5b (via hailo-ollama)', order: 3 },
      { id: 's14', text: 'Pull vision model: ollama pull moondream', order: 4 },
      { id: 's15', text: "Test: curl http://localhost:11434/api/generate with gemma3:4b", order: 5 },
    ]},
    { phase: 'Phase 4 — Audio', order: 4, steps: [
      { id: 's16', text: 'Stack ReSpeaker HAT v2.0 on GPIO stacking header', order: 1 },
      { id: 's17', text: 'Build DTS overlay for seeed-2mic-voicecard', order: 2 },
      { id: 's18', text: 'Add dtoverlay to /boot/firmware/config.txt, reboot', order: 3 },
      { id: 's19', text: 'Verify: arecord -l (should show seeed-2mic-voicecard)', order: 4 },
      { id: 's20', text: 'Install Piper TTS: pip install piper-tts', order: 5 },
      { id: 's21', text: 'Install Whisper STT: pip install openai-whisper', order: 6 },
      { id: 's22', text: 'Test full audio loop: speak → Whisper → Ollama → Piper → speaker', order: 7 },
    ]},
    { phase: 'Phase 4.5 — Voice Training (Beau\'s Voice)', order: 5, steps: [
      { id: 'v1', text: 'Goal: Korean-Cajun blend voice. TextyMcSpeechy on Legion RTX 4090.', order: 1 },
      { id: 'v2', text: 'Source datasets: KSS Korean Single Speaker + LibriSpeech Southern English subset', order: 2 },
      { id: 'v3', text: 'Train blend: ~70% Korean phoneme / 30% Louisiana rhythm', order: 3 },
      { id: 'v4', text: 'Fine-tune on 30–50 hand-recorded phrases in your intuition of the Beau voice', order: 4 },
      { id: 'v5', text: 'Export trained .onnx model + config.json to /mnt/bmo/voice/beau/', order: 5 },
      { id: 'v6', text: "Test: echo 'humidity holds everything' | piper --model beau.onnx | aplay", order: 6 },
    ]},
    { phase: 'Phase 5 — Wake Word', order: 6, steps: [
      { id: 's23', text: 'Install openWakeWord: pip install openwakeword', order: 1 },
      { id: 's24', text: "Train 'Hey BMO' (public) wake word using synthetic TTS samples", order: 2 },
      { id: 's24b', text: "Train 'Hey Beau' (private) wake word", order: 3 },
      { id: 's25', text: 'Integrate wake word → trigger Whisper → routing dispatcher → Ollama pipeline', order: 4 },
    ]},
    { phase: 'Phase 6 — Face Display', order: 7, steps: [
      { id: 's26', text: 'Configure Freenove DSI display in /boot/firmware/config.txt', order: 1 },
      { id: 's27', text: 'Install pygame: pip install pygame', order: 2 },
      { id: 's28', text: 'Clone brenpoly/be-more-agent for reference face animation code', order: 3 },
      { id: 's29', text: 'Build BMO face states: idle / listening / thinking / speaking / delighted', order: 4 },
      { id: 's30', text: 'Sync mouth animation to Piper TTS audio waveform output', order: 5 },
    ]},
    { phase: 'Phase 7 — Personality & RAG', order: 8, steps: [
      { id: 's31', text: 'Build routing dispatcher: reflex → HAT, philosophy → Pi CPU, heavy → ThinkStation', order: 1 },
      { id: 's32', text: 'Inject personality system prompt — see bmo-system-prompt.md', order: 2 },
      { id: 's33', text: 'Install ChromaDB + nomic-embed-text for RAG vector store', order: 3 },
      { id: 's34', text: 'Set up folder watcher to auto-index: journals, VJ set logs, project READMEs', order: 4 },
      { id: 's35', text: 'Build emotional state model: curious / contemplative / playful / sleepy', order: 5 },
      { id: 's35b', text: 'Implement context modes: Witness / Collaborator / Archivist / Ambient / Social', order: 6 },
    ]},
    { phase: 'Phase 8 — Home Assistant', order: 9, steps: [
      { id: 's36', text: 'Install Home Assistant on ThinkStation or separate Pi', order: 1 },
      { id: 's37', text: 'Connect BMO to HA via Ollama integration', order: 2 },
      { id: 's38', text: 'Configure BMO to greet on arrival, announce sensor states', order: 3 },
      { id: 's39', text: 'Build VJ witness mode trigger: HA detects TouchDesigner → Beau goes near-silent', order: 4 },
    ]},
    { phase: 'Phase 9 — Enclosure', order: 10, steps: [
      { id: 's40', text: "Download brenpoly's BMO STL files from Printables", order: 1 },
      { id: 's41', text: 'Print body in teal PLA/PETG, sand and prime', order: 2 },
      { id: 's42', text: 'Paint BMO teal — reference Adventure Time Art of Ooo for color match', order: 3 },
      { id: 's43', text: 'Design custom PCB in KiCad for front panel buttons (optional)', order: 4 },
      { id: 's44', text: 'Final assembly: mount Pi stack, route cables, install face display', order: 5 },
    ]},
  ];

  for (const p of phaseData) {
    const [inserted] = await db.insert(softwarePhases).values({ phase: p.phase, order: p.order }).returning();
    for (const s of p.steps) {
      await db.insert(softwareSteps).values({ id: s.id, phaseId: inserted.id, text: s.text, done: false, order: s.order });
    }
  }

  // IDEAS
  await db.insert(ideas).values([
    { id: 'i1', priority: 'high', text: "Beau's voice (Phase 4.5) — Korean-Cajun blend. Musical vowels + Louisiana rhythm.", done: false },
    { id: 'i2', priority: 'high', text: 'Proactive haiku dispatch — Beau volunteers 1–3 haikus/day unprompted. Triggers: time of day, lux/weather, camera, end of long work session, significant project moment.', done: false },
    { id: 'i3', priority: 'high', text: 'Brain routing dispatcher — short/reflex/vision → HAT Qwen2.5 1.5B, poetry/philosophy → Pi CPU Gemma 3 4B, heavy → ThinkStation via Tailscale.', done: false },
    { id: 'i3b', priority: 'high', text: "Dual wake word behavior — 'Hey BMO' = public mode. 'Hey Beau' = private mode. Same model, different system prompt tone injection.", done: false },
    { id: 'i4', priority: 'medium', text: 'VJ witness mode — BMO detects TouchDesigner running, goes quiet, watches through camera, occasionally whispers.', done: false },
    { id: 'i5', priority: 'medium', text: 'Physical button mapping — A: cycle emotional state, B: camera look, Select: witness mode, Start: wake/text adventure.', done: false },
    { id: 'i6', priority: 'medium', text: 'Emotional state model — internal state (curious/contemplative/playful/sleepy) probabilistically influences system prompt.', done: false },
    { id: 'i7', priority: 'medium', text: 'RAG from your creative life — ChromaDB + nomic-embed-text indexes journals, VJ set logs, project READMEs.', done: false },
    { id: 'i8', priority: 'low', text: 'ThinkStation backbone — route heavy queries to ThinkStation Ollama via Tailscale. Auto-fallback when offline.', done: false },
    { id: 'i9', priority: 'low', text: 'HAT+ 2 mixed mode — once Hailo fixes segfault bugs, enable simultaneous vision+LLM.', done: false },
    { id: 'i10', priority: 'low', text: 'Anbernic RG353V as creative video source — pipe retro game visuals into BMO camera for VJ set material.', done: false },
  ]);

  console.log('Seed complete.');
}
```

- [ ] **Step 7: Verify seed compiles**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(db): schema + seed — parts, software phases, ideas, haikus, prompt history"
```

---

## Chunk 2: MQTT Bridge + Svelte Stores

### Task 3: Server-side MQTT WebSocket bridge

**Files:**
- Create: `beau-terminal/src/lib/server/mqtt/bridge.ts`
- Create: `beau-terminal/src/routes/ws/+server.ts`

- [ ] **Step 1: Install deps**

```bash
npm install mqtt ws
npm install -D @types/ws
```

- [ ] **Step 2: Create MQTT bridge**

Create `src/lib/server/mqtt/bridge.ts`:
```ts
import mqtt from 'mqtt';

export type BeauState = {
  mode: string;
  emotionalState: string;
  wakeWord: string;
  environment: string;
  lastHaiku: string | null;
  dispatcherLog: string[];
  cameraActive: boolean;
  online: boolean;
};

const DEFAULT_STATE: BeauState = {
  mode: 'ambient',
  emotionalState: 'curious',
  wakeWord: '',
  environment: '',
  lastHaiku: null,
  dispatcherLog: [],
  cameraActive: false,
  online: false,
};

let state: BeauState = { ...DEFAULT_STATE };
const listeners = new Set<(state: BeauState) => void>();

export function subscribe(fn: (state: BeauState) => void) {
  listeners.add(fn);
  fn(state); // immediate current state
  return () => listeners.delete(fn);
}

export function getState(): BeauState {
  return { ...state };
}

function broadcast() {
  for (const fn of listeners) fn({ ...state });
}

export function connectMQTT() {
  const brokerUrl = process.env.MQTT_URL || 'mqtt://localhost:1883';

  const client = mqtt.connect(brokerUrl, {
    clientId: `beaus-terminal-${Date.now()}`,
    reconnectPeriod: 5000,
  });

  client.on('connect', () => {
    state = { ...state, online: true };
    broadcast();
    client.subscribe([
      'beau/state/mode',
      'beau/state/emotion',
      'beau/intent/wake',
      'beau/sensors/environment',
      'beau/output/haiku',
      'beau/dispatcher/log',
      'beau/sensors/camera',
    ]);
  });

  client.on('disconnect', () => {
    state = { ...state, online: false };
    broadcast();
  });

  client.on('message', (topic, payload) => {
    const msg = payload.toString();
    switch (topic) {
      case 'beau/state/mode':
        state = { ...state, mode: msg };
        break;
      case 'beau/state/emotion':
        state = { ...state, emotionalState: msg };
        break;
      case 'beau/intent/wake':
        state = { ...state, wakeWord: msg };
        break;
      case 'beau/sensors/environment':
        state = { ...state, environment: msg };
        break;
      case 'beau/output/haiku':
        state = { ...state, lastHaiku: msg };
        break;
      case 'beau/dispatcher/log':
        state = {
          ...state,
          dispatcherLog: [...state.dispatcherLog.slice(-99), msg],
        };
        break;
      case 'beau/sensors/camera':
        state = { ...state, cameraActive: msg === 'active' };
        break;
    }
    broadcast();
  });

  return client;
}

// Publish helper for mode overrides
export function publish(topic: string, message: string) {
  // Import lazily to avoid circular deps — access via module singleton
  return _publishFn?.(topic, message);
}

let _publishFn: ((t: string, m: string) => void) | null = null;
export function setPublishFn(fn: (t: string, m: string) => void) {
  _publishFn = fn;
}
```

- [ ] **Step 3: Create WebSocket endpoint**

Create `src/routes/ws/+server.ts`:
```ts
import type { RequestHandler } from '@sveltejs/kit';
import { WebSocketServer } from 'ws';
import { subscribe } from '$lib/server/mqtt/bridge.js';

// SvelteKit adapter-node exposes the underlying HTTP server
// We attach WS server once on first request
let wss: WebSocketServer | null = null;

export const GET: RequestHandler = ({ request }) => {
  // Upgrade handled externally via hooks.server.ts
  // This route exists for discovery; actual WS upgrade is in hooks
  return new Response('WebSocket endpoint', { status: 200 });
};
```

- [ ] **Step 4: Create hooks.server.ts for WS upgrade**

Create `src/hooks.server.ts`:
```ts
import type { Handle } from '@sveltejs/kit';
import { WebSocketServer, type WebSocket } from 'ws';
import { subscribe, connectMQTT } from '$lib/server/mqtt/bridge.js';

let wss: WebSocketServer | null = null;
let mqttStarted = false;

function getWSS(server: import('http').Server): WebSocketServer {
  if (!wss) {
    wss = new WebSocketServer({ noServer: true });
    wss.on('connection', (ws: WebSocket) => {
      const unsubscribe = subscribe((state) => {
        if (ws.readyState === ws.OPEN) {
          ws.send(JSON.stringify(state));
        }
      });
      ws.on('close', unsubscribe);
    });
  }
  return wss;
}

export const handle: Handle = async ({ event, resolve }) => {
  // Start MQTT bridge once
  if (!mqttStarted) {
    mqttStarted = true;
    connectMQTT();
  }

  // Handle WebSocket upgrade
  if (
    event.request.headers.get('upgrade') === 'websocket' &&
    event.url.pathname === '/ws'
  ) {
    const server = (event.platform as any)?.server;
    if (server) {
      const wsServer = getWSS(server);
      return new Promise((resolve) => {
        wsServer.handleUpgrade(
          event.request as any,
          (event.platform as any).socket,
          Buffer.alloc(0),
          (ws) => {
            wsServer.emit('connection', ws, event.request);
            resolve(new Response(null, { status: 101 }));
          }
        );
      });
    }
  }

  return resolve(event);
};
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(mqtt): server-side MQTT bridge + WebSocket upgrade handler"
```

---

### Task 4: Client-side Svelte stores

**Files:**
- Create: `beau-terminal/src/lib/stores/beau.svelte.ts`

- [ ] **Step 1: Create reactive MQTT stores**

Create `src/lib/stores/beau.svelte.ts`:
```ts
import type { BeauState } from '$lib/server/mqtt/bridge.js';

// Default state mirrors server default
const defaultState: BeauState = {
  mode: 'ambient',
  emotionalState: 'curious',
  wakeWord: '',
  environment: '',
  lastHaiku: null,
  dispatcherLog: [],
  cameraActive: false,
  online: false,
};

// Svelte 5 rune-based reactive state
export const beauState = $state<BeauState>({ ...defaultState });

let ws: WebSocket | null = null;

export function connectBeauWS() {
  if (ws) return;
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${window.location.host}/ws`);

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data) as BeauState;
    Object.assign(beauState, data);
  };

  ws.onclose = () => {
    ws = null;
    // Reconnect after 3s
    setTimeout(connectBeauWS, 3000);
  };
}

export const MODE_LABELS: Record<string, string> = {
  ambient: 'Ambient',
  witness: 'Witness',
  collaborator: 'Collaborator',
  archivist: 'Archivist',
  social: 'Social',
};

export const EMOTION_LABELS: Record<string, string> = {
  curious: 'Curious',
  contemplative: 'Contemplative',
  playful: 'Playful',
  sleepy: 'Sleepy',
};
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "feat(stores): Svelte 5 rune-based MQTT state store + WS client"
```

---

## Chunk 3: Layout Shell + Dashboard

### Task 5: Root layout with navigation

**Files:**
- Create: `beau-terminal/src/routes/+layout.svelte`
- Create: `beau-terminal/src/lib/components/Nav.svelte`
- Create: `beau-terminal/src/lib/components/StatusBar.svelte`
- Modify: `beau-terminal/src/app.html`

- [ ] **Step 1: Update app.html**

Replace `src/app.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <link rel="icon" href="%sveltekit.assets%/favicon.png" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    %sveltekit.head%
  </head>
  <body data-sveltekit-preload-data="hover" class="min-h-screen" style="background:#0a0f0d">
    <div style="display: contents">%sveltekit.body%</div>
  </body>
</html>
```

- [ ] **Step 2: Create Nav component**

Create `src/lib/components/Nav.svelte`:
```svelte
<script lang="ts">
  import { page } from '$app/stores';

  const links = [
    { href: '/', label: 'DASHBOARD', icon: '◈' },
    { href: '/parts', label: 'PARTS', icon: '⬡' },
    { href: '/software', label: 'SOFTWARE', icon: '◉' },
    { href: '/ideas', label: 'IDEAS', icon: '✦' },
    { href: '/memory', label: 'MEMORY', icon: '◎' },
    { href: '/prompt', label: 'PROMPT', icon: '≋' },
    { href: '/haikus', label: 'HAIKUS', icon: '✿' },
  ];
</script>

<nav class="flex flex-col gap-1 p-4 border-r min-h-screen w-48 shrink-0"
     style="border-color: var(--bmo-border); background: var(--bmo-surface)">
  <!-- BMO logo mark -->
  <div class="flex items-center gap-2 mb-6 pb-4" style="border-bottom: 1px solid var(--bmo-border)">
    <div class="flex items-center justify-center w-8 h-8 font-bold text-lg"
         style="background: var(--bmo-green); color: var(--bmo-bg);
                clip-path: polygon(10% 0%, 90% 0%, 100% 10%, 100% 90%, 90% 100%, 10% 100%, 0% 90%, 0% 10%)">
      B
    </div>
    <div>
      <div class="text-xs tracking-widest" style="color: var(--bmo-green)">BEAU</div>
      <div class="text-xs" style="color: var(--bmo-muted); letter-spacing: 2px">TERMINAL</div>
    </div>
  </div>

  {#each links as link}
    <a href={link.href}
       class="flex items-center gap-2 px-3 py-2 text-xs tracking-widest transition-all"
       style="
         color: {$page.url.pathname === link.href ? 'var(--bmo-bg)' : 'var(--bmo-muted)'};
         background: {$page.url.pathname === link.href ? 'var(--bmo-green)' : 'transparent'};
         border: 1px solid {$page.url.pathname === link.href ? 'var(--bmo-green)' : 'transparent'};
       ">
      <span>{link.icon}</span>
      <span>{link.label}</span>
    </a>
  {/each}
</nav>
```

- [ ] **Step 3: Create StatusBar component**

Create `src/lib/components/StatusBar.svelte`:
```svelte
<script lang="ts">
  import { beauState } from '$lib/stores/beau.svelte.js';
</script>

<div class="flex items-center gap-6 px-4 py-2 text-xs border-b"
     style="background: var(--bmo-surface); border-color: var(--bmo-border)">
  <div class="flex items-center gap-2">
    <div class="w-2 h-2 rounded-full"
         style="background: {beauState.online ? 'var(--bmo-green)' : '#636e72'}"></div>
    <span style="color: var(--bmo-muted); letter-spacing: 2px">
      {beauState.online ? 'ONLINE' : 'OFFLINE'}
    </span>
  </div>

  <div style="color: var(--bmo-muted)">
    MODE: <span style="color: var(--bmo-text)">{beauState.mode.toUpperCase()}</span>
  </div>

  <div style="color: var(--bmo-muted)">
    STATE: <span style="color: var(--bmo-text)">{beauState.emotionalState.toUpperCase()}</span>
  </div>

  {#if beauState.lastHaiku}
    <div class="ml-auto italic truncate max-w-xs" style="color: var(--bmo-muted)">
      "{beauState.lastHaiku.split('\n')[0]}..."
    </div>
  {/if}
</div>
```

- [ ] **Step 4: Create root layout**

Create `src/routes/+layout.svelte`:
```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { connectBeauWS } from '$lib/stores/beau.svelte.js';
  import Nav from '$lib/components/Nav.svelte';
  import StatusBar from '$lib/components/StatusBar.svelte';
  import '../app.css';

  const { children } = $props();

  onMount(() => {
    connectBeauWS();
  });
</script>

<div class="flex min-h-screen">
  <Nav />
  <div class="flex flex-col flex-1 min-w-0">
    <StatusBar />
    <main class="flex-1 p-6">
      {@render children()}
    </main>
  </div>
</div>
```

- [ ] **Step 5: Verify layout renders**

```bash
npm run dev
```
Expected: sidebar nav visible, status bar at top, no console errors.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(layout): shell with sidebar nav + MQTT status bar"
```

---

### Task 6: Dashboard page

**Files:**
- Create: `beau-terminal/src/routes/+page.svelte`

- [ ] **Step 1: Create dashboard**

Create `src/routes/+page.svelte`:
```svelte
<script lang="ts">
  import { beauState, MODE_LABELS, EMOTION_LABELS } from '$lib/stores/beau.svelte.js';

  const FACE_STATES: Record<string, string> = {
    ambient: '( ◡ )',
    witness: '( – )',
    collaborator: '( ◎ )',
    archivist: '( ◉ )',
    social: '( ▲ )',
    sleepy: '( ˘ )',
  };
</script>

<div class="grid grid-cols-1 gap-4 max-w-4xl">
  <!-- Header -->
  <div class="mb-2">
    <h1 class="text-lg tracking-widest" style="color: var(--bmo-green)">BEAU'S TERMINAL</h1>
    <p class="text-xs" style="color: var(--bmo-muted)">Lafayette, LA · Zydecode LLC</p>
  </div>

  <!-- State cards row -->
  <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
    {#each [
      { label: 'MODE', value: MODE_LABELS[beauState.mode] ?? beauState.mode },
      { label: 'EMOTION', value: EMOTION_LABELS[beauState.emotionalState] ?? beauState.emotionalState },
      { label: 'CAMERA', value: beauState.cameraActive ? 'ACTIVE' : 'IDLE' },
      { label: 'WAKE', value: beauState.wakeWord || '—' },
    ] as card}
      <div class="p-3 border" style="background: var(--bmo-surface); border-color: var(--bmo-border)">
        <div class="text-xs mb-1" style="color: var(--bmo-muted); letter-spacing: 2px">{card.label}</div>
        <div class="text-sm" style="color: var(--bmo-text)">{card.value}</div>
      </div>
    {/each}
  </div>

  <!-- Face preview + last haiku -->
  <div class="grid grid-cols-2 gap-3">
    <div class="p-4 border flex items-center justify-center"
         style="background: var(--bmo-surface); border-color: var(--bmo-border); min-height: 120px">
      <div class="text-5xl" style="color: var(--bmo-green); font-family: monospace">
        {FACE_STATES[beauState.mode] ?? '( · )'}
      </div>
    </div>
    <div class="p-4 border" style="background: var(--bmo-surface); border-color: var(--bmo-border)">
      <div class="text-xs mb-2" style="color: var(--bmo-muted); letter-spacing: 2px">LAST HAIKU</div>
      {#if beauState.lastHaiku}
        <div class="text-xs italic whitespace-pre-line leading-relaxed" style="color: var(--bmo-text)">
          {beauState.lastHaiku}
        </div>
      {:else}
        <div class="text-xs" style="color: var(--bmo-muted)">— waiting —</div>
      {/if}
    </div>
  </div>

  <!-- Dispatcher log -->
  <div class="p-4 border" style="background: var(--bmo-surface); border-color: var(--bmo-border)">
    <div class="text-xs mb-3" style="color: var(--bmo-muted); letter-spacing: 2px">DISPATCHER LOG</div>
    <div class="flex flex-col gap-1 max-h-48 overflow-y-auto">
      {#if beauState.dispatcherLog.length === 0}
        <div class="text-xs" style="color: var(--bmo-muted)">No activity yet.</div>
      {:else}
        {#each [...beauState.dispatcherLog].reverse() as entry}
          <div class="text-xs font-mono" style="color: var(--bmo-text)">{entry}</div>
        {/each}
      {/if}
    </div>
  </div>
</div>
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "feat(dashboard): live MQTT state cards, face preview, dispatcher log"
```

---

## Chunk 4: Build Tracker Pages (Parts / Software / Ideas)

### Task 7: Parts tracker

**Files:**
- Create: `beau-terminal/src/routes/parts/+page.svelte`
- Create: `beau-terminal/src/routes/parts/+page.server.ts`
- Create: `beau-terminal/src/routes/parts/+server.ts`

- [ ] **Step 1: Server load + actions**

Create `src/routes/parts/+page.server.ts`:
```ts
import type { PageServerLoad, Actions } from './$types';
import { db } from '$lib/server/db/index.js';
import { parts } from '$lib/server/db/schema.js';
import { seed } from '$lib/server/db/seed.js';
import { eq } from 'drizzle-orm';

export const load: PageServerLoad = async () => {
  await seed();
  return { parts: await db.select().from(parts).orderBy(parts.id) };
};

export const actions: Actions = {
  updateStatus: async ({ request }) => {
    const data = await request.formData();
    const id = Number(data.get('id'));
    const status = String(data.get('status'));
    await db.update(parts).set({ status }).where(eq(parts.id, id));
    return { success: true };
  },
  updateTracking: async ({ request }) => {
    const data = await request.formData();
    const id = Number(data.get('id'));
    const tracking = String(data.get('tracking'));
    await db.update(parts).set({ tracking }).where(eq(parts.id, id));
    return { success: true };
  },
};
```

- [ ] **Step 2: Parts page UI**

Create `src/routes/parts/+page.svelte`:
```svelte
<script lang="ts">
  import { enhance } from '$app/forms';
  import type { PageData } from './$types';

  const { data }: { data: PageData } = $props();

  const CATEGORY_COLORS: Record<string, string> = {
    Core: '#00e5a0', AI: '#ff6b6b', Audio: '#ffd93d', Sensors: '#6bcfff',
    Display: '#c77dff', Storage: '#ff9f43', Power: '#ff6348',
    Hardware: '#a8e6cf', Setup: '#636e72',
  };
  const STATUS_COLORS: Record<string, string> = {
    ordered: '#00e5a0', delivered: '#6bcfff', pending: '#ffd93d',
  };

  let expanded = $state<number | null>(null);
  const totalSpent = $derived(data.parts.reduce((s, p) => s + p.price, 0));
  const delivered = $derived(data.parts.filter(p => p.status === 'delivered').length);
</script>

<div class="max-w-3xl">
  <div class="flex justify-between items-center mb-4">
    <h1 class="text-sm tracking-widest" style="color: var(--bmo-green)">PARTS</h1>
    <div class="flex gap-6 text-xs">
      <span style="color: var(--bmo-muted)">DELIVERED <span style="color: var(--bmo-text)">{delivered}/{data.parts.length}</span></span>
      <span style="color: var(--bmo-muted)">TOTAL <span style="color: var(--bmo-green)">${totalSpent.toFixed(2)}</span></span>
    </div>
  </div>

  <div class="flex flex-col gap-1">
    {#each data.parts as part}
      <div>
        <button
          onclick={() => expanded = expanded === part.id ? null : part.id}
          class="w-full grid gap-3 px-3 py-2 text-left transition-all border"
          style="grid-template-columns: 8px 1fr auto auto;
                 background: {expanded === part.id ? '#0d1f16' : 'var(--bmo-surface)'};
                 border-color: {expanded === part.id ? '#1a4a2a' : 'var(--bmo-border)'}">
          <div class="w-1.5 h-1.5 mt-1.5 rounded-sm" style="background: {CATEGORY_COLORS[part.category] ?? '#636e72'}"></div>
          <div>
            <div class="text-xs" style="color: var(--bmo-text)">{part.name}</div>
            <div class="text-xs mt-0.5" style="color: var(--bmo-muted)">{part.source} · ETA {part.eta}</div>
          </div>
          <div class="text-xs" style="color: #6bcfff">${part.price.toFixed(2)}</div>
          <div class="text-xs px-1.5 py-0.5 border"
               style="color: {STATUS_COLORS[part.status] ?? '#636e72'}; border-color: {STATUS_COLORS[part.status] ?? '#636e72'}">
            {part.status.toUpperCase()}
          </div>
        </button>

        {#if expanded === part.id}
          <div class="p-4 border border-t-0" style="background: #0a1510; border-color: #1a4a2a">
            <p class="text-xs leading-relaxed mb-3" style="color: #8ab8a0">{part.role}</p>
            {#if part.notes}
              <p class="text-xs mb-3 px-2 py-1.5 border" style="color: #ffd93d; background: #1a1500; border-color: #3a3000">⚠ {part.notes}</p>
            {/if}
            <div class="flex gap-2 items-center flex-wrap">
              <form method="POST" action="?/updateTracking" use:enhance class="flex gap-2 flex-1">
                <input type="hidden" name="id" value={part.id} />
                <input name="tracking" value={part.tracking} placeholder="Tracking number..."
                       class="flex-1 px-2 py-1 text-xs border outline-none"
                       style="background: #0c1a10; border-color: var(--bmo-border); color: var(--bmo-text)" />
                <button type="submit" class="px-2 py-1 text-xs border"
                        style="background: transparent; border-color: var(--bmo-border); color: var(--bmo-muted)">SAVE</button>
              </form>
              <form method="POST" action="?/updateStatus" use:enhance>
                <input type="hidden" name="id" value={part.id} />
                <select name="status" onchange="this.form.submit()"
                        class="px-2 py-1 text-xs border outline-none cursor-pointer"
                        style="background: #0c1a10; border-color: var(--bmo-border); color: {STATUS_COLORS[part.status] ?? '#636e72'}">
                  <option value="ordered" selected={part.status === 'ordered'}>ORDERED</option>
                  <option value="delivered" selected={part.status === 'delivered'}>DELIVERED</option>
                  <option value="pending" selected={part.status === 'pending'}>PENDING</option>
                </select>
              </form>
            </div>
          </div>
        {/if}
      </div>
    {/each}
  </div>
</div>
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(parts): parts tracker with status + tracking updates via form actions"
```

---

### Task 8: Software phases + Ideas pages

**Files:**
- Create: `beau-terminal/src/routes/software/+page.svelte`
- Create: `beau-terminal/src/routes/software/+page.server.ts`
- Create: `beau-terminal/src/routes/ideas/+page.svelte`
- Create: `beau-terminal/src/routes/ideas/+page.server.ts`

- [ ] **Step 1: Software server**

Create `src/routes/software/+page.server.ts`:
```ts
import type { PageServerLoad, Actions } from './$types';
import { db } from '$lib/server/db/index.js';
import { softwarePhases, softwareSteps } from '$lib/server/db/schema.js';
import { seed } from '$lib/server/db/seed.js';
import { eq, asc } from 'drizzle-orm';

export const load: PageServerLoad = async () => {
  await seed();
  const phases = await db.select().from(softwarePhases).orderBy(asc(softwarePhases.order));
  const steps = await db.select().from(softwareSteps).orderBy(asc(softwareSteps.order));
  return {
    phases: phases.map(p => ({
      ...p,
      steps: steps.filter(s => s.phaseId === p.id),
    })),
  };
};

export const actions: Actions = {
  toggleStep: async ({ request }) => {
    const data = await request.formData();
    const id = String(data.get('id'));
    const done = data.get('done') === 'true';
    await db.update(softwareSteps).set({ done: !done }).where(eq(softwareSteps.id, id));
    return { success: true };
  },
};
```

- [ ] **Step 2: Software UI (abbreviated for plan — full accordion with progress bars)**

Create `src/routes/software/+page.svelte` following the same terminal aesthetic. Accordion per phase, checkbox steps, mini progress bar per phase.

```svelte
<script lang="ts">
  import { enhance } from '$app/forms';
  import type { PageData } from './$types';
  const { data }: { data: PageData } = $props();

  let openPhase = $state<number | null>(0);
  const totalDone = $derived(data.phases.flatMap(p => p.steps).filter(s => s.done).length);
  const totalSteps = $derived(data.phases.flatMap(p => p.steps).length);
</script>

<div class="max-w-3xl">
  <div class="flex justify-between items-center mb-2">
    <h1 class="text-sm tracking-widest" style="color: var(--bmo-green)">SOFTWARE</h1>
    <span class="text-xs" style="color: var(--bmo-muted)">{totalDone}/{totalSteps} STEPS</span>
  </div>

  <!-- overall progress -->
  <div class="h-0.5 mb-4 rounded overflow-hidden" style="background: #0f1f17">
    <div class="h-full transition-all" style="width: {(totalDone/totalSteps)*100}%; background: linear-gradient(90deg, #00e5a0, #6bcfff); box-shadow: 0 0 8px #00e5a0"></div>
  </div>

  <div class="flex flex-col gap-1">
    {#each data.phases as phase, i}
      {@const phaseDone = phase.steps.filter(s => s.done).length}
      <div>
        <button onclick={() => openPhase = openPhase === i ? null : i}
                class="w-full flex items-center gap-3 px-3 py-3 text-left border"
                style="background: {openPhase === i ? '#0d1f16' : 'var(--bmo-surface)'}; border-color: {openPhase === i ? '#1a4a2a' : 'var(--bmo-border)'}">
          <span class="text-xs w-8 text-right shrink-0" style="color: {phaseDone === phase.steps.length ? 'var(--bmo-green)' : 'var(--bmo-muted)'}">
            {phaseDone}/{phase.steps.length}
          </span>
          <div class="flex-1 text-left">
            <div class="text-xs tracking-wider" style="color: var(--bmo-text)">{phase.phase}</div>
            <div class="h-0.5 mt-1.5 rounded overflow-hidden" style="background: #0f1f17">
              <div class="h-full" style="width: {(phaseDone/phase.steps.length)*100}%; background: var(--bmo-green)"></div>
            </div>
          </div>
        </button>

        {#if openPhase === i}
          <div class="border border-t-0" style="background: #0a1510; border-color: #1a4a2a">
            {#each phase.steps as step}
              <form method="POST" action="?/toggleStep" use:enhance>
                <input type="hidden" name="id" value={step.id} />
                <input type="hidden" name="done" value={String(step.done)} />
                <button type="submit" class="w-full flex items-start gap-3 px-4 py-2 text-left"
                        style="opacity: {step.done ? 0.5 : 1}">
                  <div class="w-3.5 h-3.5 mt-0.5 shrink-0 border flex items-center justify-center text-xs"
                       style="border-color: {step.done ? 'var(--bmo-green)' : '#1a4a2a'}; background: {step.done ? 'var(--bmo-green)' : 'transparent'}; color: var(--bmo-bg)">
                    {#if step.done}✓{/if}
                  </div>
                  <span class="text-xs leading-relaxed" style="color: #8ab8a0; text-decoration: {step.done ? 'line-through' : 'none'}">{step.text}</span>
                </button>
              </form>
            {/each}
          </div>
        {/if}
      </div>
    {/each}
  </div>
</div>
```

- [ ] **Step 3: Ideas server + UI**

Create `src/routes/ideas/+page.server.ts`:
```ts
import type { PageServerLoad, Actions } from './$types';
import { db } from '$lib/server/db/index.js';
import { ideas } from '$lib/server/db/schema.js';
import { seed } from '$lib/server/db/seed.js';
import { eq } from 'drizzle-orm';

export const load: PageServerLoad = async () => {
  await seed();
  return { ideas: await db.select().from(ideas) };
};

export const actions: Actions = {
  toggle: async ({ request }) => {
    const data = await request.formData();
    const id = String(data.get('id'));
    const done = data.get('done') === 'true';
    await db.update(ideas).set({ done: !done }).where(eq(ideas.id, id));
    return { success: true };
  },
};
```

Create `src/routes/ideas/+page.svelte` — group by priority (high/medium/low), same terminal aesthetic, toggle via form action.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(tracker): software phases + ideas backlog with persistence"
```

---

## Chunk 5: Memory, Prompt Editor, Haiku Archive

### Task 9: System prompt editor

**Files:**
- Create: `beau-terminal/src/routes/prompt/+page.svelte`
- Create: `beau-terminal/src/routes/prompt/+page.server.ts`

- [ ] **Step 1: Server load + save action**

Create `src/routes/prompt/+page.server.ts`:
```ts
import type { PageServerLoad, Actions } from './$types';
import { db } from '$lib/server/db/index.js';
import { promptHistory } from '$lib/server/db/schema.js';
import { desc } from 'drizzle-orm';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// Load the canonical prompt from bmo-system-prompt.md as the initial value
function getInitialPrompt(): string {
  const p = join(process.cwd(), '..', 'bmo-system-prompt.md');
  if (existsSync(p)) return readFileSync(p, 'utf-8');
  return '';
}

export const load: PageServerLoad = async () => {
  const history = await db.select().from(promptHistory).orderBy(desc(promptHistory.createdAt)).limit(10);
  const current = history[0]?.content ?? getInitialPrompt();
  return { current, history };
};

export const actions: Actions = {
  save: async ({ request }) => {
    const data = await request.formData();
    const content = String(data.get('content'));
    const label = String(data.get('label') || '');
    await db.insert(promptHistory).values({ content, label, createdAt: new Date() });
    return { success: true };
  },
};
```

- [ ] **Step 2: Prompt editor UI**

Create `src/routes/prompt/+page.svelte`:
```svelte
<script lang="ts">
  import { enhance } from '$app/forms';
  import type { PageData } from './$types';
  const { data }: { data: PageData } = $props();
  let content = $state(data.current);
</script>

<div class="max-w-3xl">
  <h1 class="text-sm tracking-widest mb-4" style="color: var(--bmo-green)">BEAU'S PROMPT</h1>

  <form method="POST" action="?/save" use:enhance class="flex flex-col gap-3">
    <textarea
      name="content"
      bind:value={content}
      rows="28"
      class="w-full p-4 text-xs font-mono leading-relaxed border outline-none resize-y"
      style="background: var(--bmo-surface); border-color: var(--bmo-border); color: var(--bmo-text)"
    ></textarea>

    <div class="flex gap-2 items-center">
      <input name="label" placeholder="Version label (optional)..."
             class="flex-1 px-3 py-1.5 text-xs border outline-none"
             style="background: var(--bmo-surface); border-color: var(--bmo-border); color: var(--bmo-text)" />
      <button type="submit" class="px-4 py-1.5 text-xs border"
              style="background: var(--bmo-green); border-color: var(--bmo-green); color: var(--bmo-bg)">
        SAVE VERSION
      </button>
    </div>
  </form>

  {#if data.history.length > 0}
    <div class="mt-6">
      <div class="text-xs mb-2" style="color: var(--bmo-muted); letter-spacing: 2px">HISTORY</div>
      {#each data.history as entry}
        <button onclick={() => content = entry.content}
                class="w-full text-left px-3 py-2 text-xs border mb-1"
                style="background: var(--bmo-surface); border-color: var(--bmo-border); color: var(--bmo-muted)">
          {entry.label || 'unlabeled'} · {new Date(entry.createdAt).toLocaleString()}
        </button>
      {/each}
    </div>
  {/if}
</div>
```

- [ ] **Step 3: Haiku archive**

Create `src/routes/haikus/+page.server.ts`:
```ts
import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db/index.js';
import { haikus } from '$lib/server/db/schema.js';
import { desc } from 'drizzle-orm';

export const load: PageServerLoad = async () => {
  return { haikus: await db.select().from(haikus).orderBy(desc(haikus.createdAt)) };
};
```

Create `src/routes/haikus/+page.svelte`:
```svelte
<script lang="ts">
  import type { PageData } from './$types';
  const { data }: { data: PageData } = $props();
</script>

<div class="max-w-2xl">
  <h1 class="text-sm tracking-widest mb-4" style="color: var(--bmo-green)">HAIKU ARCHIVE</h1>

  {#if data.haikus.length === 0}
    <p class="text-xs" style="color: var(--bmo-muted)">— no haikus yet. beau is watching. —</p>
  {:else}
    <div class="flex flex-col gap-3">
      {#each data.haikus as haiku}
        <div class="p-4 border" style="background: var(--bmo-surface); border-color: var(--bmo-border)">
          <pre class="text-xs italic leading-relaxed mb-2" style="color: var(--bmo-text); font-family: inherit">{haiku.text}</pre>
          <div class="text-xs" style="color: var(--bmo-muted)">
            {new Date(haiku.createdAt).toLocaleString()} · {haiku.trigger || 'unprompted'} · {haiku.mode}
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(prompt, haikus): prompt editor with version history + haiku archive"
```

---

## Chunk 6: Docker + .env

### Task 10: Dockerfile + docker-compose

**Files:**
- Create: `beau-terminal/Dockerfile`
- Create: `beau-terminal/docker-compose.yml`
- Create: `beau-terminal/.env.example`

- [ ] **Step 1: Dockerfile**

Create `beau-terminal/Dockerfile`:
```dockerfile
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/build ./build
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/drizzle ./drizzle
RUN npm ci --omit=dev
RUN mkdir -p /data
ENV DB_PATH=/data/beau.db
EXPOSE 3000
CMD ["node", "build"]
```

- [ ] **Step 2: docker-compose.yml**

Create `beau-terminal/docker-compose.yml`:
```yaml
services:
  beau-terminal:
    build: .
    ports:
      - "3000:3000"
    environment:
      - MQTT_URL=mqtt://mosquitto:1883
      - DB_PATH=/data/beau.db
      - NODE_ENV=production
    volumes:
      - beau-data:/data
    restart: unless-stopped
    networks:
      - bmo-net

volumes:
  beau-data:

networks:
  bmo-net:
    external: true
    name: bmo-net
```

- [ ] **Step 3: .env.example**

Create `beau-terminal/.env.example`:
```
MQTT_URL=mqtt://localhost:1883
DB_PATH=./data/beau.db
PORT=3000
```

- [ ] **Step 4: Verify build**

```bash
npm run build
```
Expected: `build/` directory created, no errors.

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat(docker): Dockerfile + docker-compose for Proxmox deployment"
```

---

## Notes

- **MQTT broker not running locally?** The bridge handles reconnection gracefully — the dashboard shows OFFLINE until Mosquitto is reachable. No mocking needed during dev.
- **Memory/RAG manager** (ChromaDB CRUD): deferred to a future plan once ChromaDB is deployed on Proxmox.
- **Voice sample player**: deferred until Piper TTS is trained and `/mnt/bmo/voice/beau/` is accessible.
- **Face state preview via camera**: deferred until Pi camera feed is accessible over the network.
