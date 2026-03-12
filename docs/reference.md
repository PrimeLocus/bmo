# BMO Technical Reference

Deep technical details for the BMO project. For overview and conventions, see the root [`CLAUDE.md`](../CLAUDE.md).

---

## MQTT Topic Tree

Beau's Terminal subscribes/publishes via the bridge (`src/lib/server/mqtt/bridge.ts`):

| Topic | Direction | Purpose |
|---|---|---|
| `beau/state/mode` | BMO → Terminal | Current mode (ambient/witness/collaborator/archivist/social) |
| `beau/state/emotion` | BMO → Terminal | Emotional state (curious/contemplative/playful/sleepy) |
| `beau/intent/wake` | BMO → Terminal | Last wake word detected |
| `beau/sensors/environment` | BMO → Terminal | Environment string from HA + process monitor |
| `beau/output/haiku` | BMO → Terminal | Haiku text (auto-persisted to SQLite) |
| `beau/dispatcher/log` | BMO → Terminal | Dispatcher log entries (kept in memory, last 100) |
| `beau/sensors/camera` | BMO → Terminal | Camera status ("active" / other) |
| `beau/command/*` | Terminal → BMO | Commands sent via Prompt Console |

**BeauState** (server-side, broadcast via WebSocket):

```typescript
{
  mode: string;
  emotionalState: string;
  wakeWord: string;
  environment: string;
  lastHaiku: string | null;
  dispatcherLog: string[];
  cameraActive: boolean;
  online: boolean;
}
```

---

## Database Schema

7 tables in `beau-terminal/data/beau.db` (defined in `src/lib/server/db/schema.ts`):

| Table | Purpose | Key Columns |
|---|---|---|
| **parts** | Hardware components | id, name, category, price, source, tracking, status, eta, role, notes, expectedDelivery, buildVersion |
| **softwarePhases** | Build phases | id (auto), phase, order |
| **softwareSteps** | Checklist items within phases | id (text), phaseId (FK), text, done, order, links (JSON) |
| **ideas** | Ideas board items | id (text), priority, text, done, links (JSON) |
| **haikus** | Haiku archive | id (auto), text, trigger, mode, createdAt |
| **todos** | Task list | id (auto), text, section, done, priority, sortOrder, createdAt |
| **promptHistory** | MQTT commands sent via Prompt Console | id (auto), content, label, createdAt |

Seed data: 16 parts, 10 phases, 44 steps, 11 ideas + 116 link mappings. Idempotent — skips if parts table already has data.

---

## Brain Routing

The HAT's 1.5B models are weak at reasoning (confirmed). Routing is intentional:

| Tier | Model | Hardware | Use Case |
|---|---|---|---|
| **Reflex** | Qwen2.5 1.5B | Hailo NPU (8GB HAT RAM) | Wake word, object detection, fast banter, short factual. Zero Pi CPU usage. |
| **Philosopher** | Gemma 3 4B | Pi CPU via Ollama (16GB RAM) | Philosophical, creative, poetic. Full system prompt + RAG. Runs alongside HA, display, orchestration. |
| **Heavy** | Qwen3-30B | ThinkStation via Tailscale | Extended reasoning, large context. Full prompt + extended memory. Auto-fallback when offline. |

Both HAT and Pi CPU stacks coexist and run simultaneously on the same Pi 5 board.

---

## System Prompt Template

Canonical system prompt for the philosopher brain lives in `bmo-system-prompt.md`. Uses `{{PLACEHOLDER}}` syntax for runtime injection:

| Placeholder | Source |
|---|---|
| `{{WAKE_WORD}}` | Detected wake word ("Hey BMO" or "Hey Beau") |
| `{{MODE}}` | Current context mode from MQTT |
| `{{ENVIRONMENT}}` | Home Assistant + process monitor state |
| `{{TIME_OF_DAY}}` | System clock |
| `{{RAG_FRAGMENTS}}` | ChromaDB query results (3–5 chunks) |
| `{{EMOTIONAL_STATE}}` | Probabilistic state model output |

---

## BMO CLI

Root-level workspace bootstrapper (`bin/bmo.js` → `src/cli.js`).

**`bmo init [target]`** — scaffolds:
- `data/memory/`, `data/logs/`, `runtime/state/`, `prompts/`
- `bmo.config.json`, `prompts/system.md` (from `bmo-system-prompt.md` template)
- Supports `--force`, `--dry-run` flags
- Tests in `test/init.test.js`
