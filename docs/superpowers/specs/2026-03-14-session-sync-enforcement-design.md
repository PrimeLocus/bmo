# Session-Sync Enforcement via Hooks

**Date:** 2026-03-14
**Status:** Draft
**Scope:** Global Claude Code configuration (`~/.claude/`)
**Normalization rules:** See [PROTOCOL.md](C:/Users/Chili/.claude/projects/C--Users-Chili/memory/sessions/PROTOCOL.md)

## Problem

Session-sync is mandatory at startup (per CLAUDE.md), but enforcement is purely prompt-level. The model routinely skips it. There is no structural gate that prevents the model from responding without running the skill.

## Solution

Two-layer enforcement:

1. **Hooks handle registration automatically** — the session is always tracked, regardless of model behavior
2. **Stop hook forces a corrective turn** after the model's first response if session-sync wasn't invoked — the model gets exactly one retry before the gate gives up

## Important: How the Stop Hook Gate Actually Works

The Stop hook fires *after* Claude has already delivered a response. `decision: "block"` does not prevent the first response from reaching the user — it forces Claude to take an additional turn with the reason as instruction. The user will briefly see the first (un-synced) response before the corrective turn runs session-sync. This is a meaningful UX compromise vs. true pre-response blocking, which is not possible with current Claude Code hooks.

## Hook Concurrency Model

All matching hooks for a given event **run in parallel**, not sequentially. The session-sync hooks and existing ntfy hooks are independent (no shared state, no ordering dependency), so parallel execution is safe. If ordering were ever needed, hooks would need to be chained within a single script.

## Architecture

```
SessionStart ──► session-sync-register.sh
                 ├─ Write sess_*.json (auto-registration)
                 ├─ Handle source: startup vs resume vs clear/compact
                 ├─ Check sibling sessions
                 ├─ Clean stale files (>3h)
                 ├─ Rotate activity.ndjson if >2000 lines
                 └─ Write sidecar to ~/.claude/tmp/

UserPromptSubmit ──► session-sync-context.sh
                     └─ Inject sibling info as additionalContext (best-effort)

Stop ──► session-sync-gate.sh
         ├─ Guard: skip if stop_hook_active (prevent infinite loop)
         ├─ First-turn gate: force corrective turn if session-sync not in transcript
         ├─ All turns: update lastUpdate in sess_*.json
         └─ Deregistration: detect explicit cleanup language, not casual phrases

session-sync skill (model-invoked)
         ├─ Detect hook-provided registration, don't duplicate
         ├─ Hydra enrichment (MCP tools — hooks can't do this)
         ├─ Worktree/branch setup
         └─ Graceful deregistration on session end
```

## Component Details

### 1. `session-sync-register.sh` (SessionStart hook)

**Trigger:** Session start (new or resumed).

**Input (stdin JSON):** `session_id`, `cwd`, `source` (`startup`, `resume`, `clear`, `compact`), and other standard hook fields.

**Behavior:**

1. Read `session_id`, `cwd`, and `source` from stdin JSON via `jq`.
2. Normalize `cwd` (from stdin directly): lowercase, forward slashes, strip trailing slash — per PROTOCOL.md normalization rules.
3. Derive `project` as basename of normalized cwd.
4. **Handle `source` field:**
   - `startup`: Full registration — create new session file.
   - `resume`: Check if session file already exists (match by `session_id` prefix). If so, update `lastUpdate` only. If not, create new.
   - `clear` / `compact`: Update `lastUpdate` in existing session file. Don't create duplicate.
5. Quick Hydra check: `curl -sf --connect-timeout 1 http://localhost:4173/health`. Store result (available/unavailable).
6. Generate session file ID: `sess_{YYYYMMDD_HHMMSS}_{session_id_first6}`. (Claude Code `session_id` is a UUID; first 6 hex chars offer ~16.7M values — collision within the same second is unlikely.)
7. Write `sess_*.json` to `C:/Users/Chili/.claude/projects/C--Users-Chili/memory/sessions/`:
   ```json
   {
     "id": "sess_20260314_220000_abc123",
     "agent": "claude-code",
     "project": "bmo",
     "cwd": "e:/dev/bmo",
     "status": "working",
     "focus": "",
     "files": [],
     "branch": null,
     "worktreePath": null,
     "startedAt": "2026-03-14T22:00:00Z",
     "lastUpdate": "2026-03-14T22:00:00Z",
     "registeredBy": "hook"
   }
   ```
   - `status` follows PROTOCOL.md values: `working`, `idle`, `blocked`, `waiting`. Default `"working"` on registration.
   - `registeredBy` is an **audit trail field** — it tracks whether the session was registered by the hook or enriched by the skill. It does not gate any behavior; both are treated identically for conflict detection, freshness, and cleanup. PROTOCOL.md should be updated to include `registeredBy` as an optional field.
8. Scan sibling sessions: list all `sess_*.json` where `cwd` matches and file is not this session's.
9. Clean stale sessions: delete any `sess_*.json` where `lastUpdate` is >3 hours ago (any project).
10. **Rotate activity log:** If `activity.ndjson` exceeds 2000 lines, truncate to most recent 1000 lines.
11. Write sidecar to `C:/Users/Chili/.claude/tmp/claude_session_{session_id}_status.json`:
    ```json
    {
      "sessionId": "sess_20260314_220000_abc123",
      "sessionFile": "C:/Users/Chili/.claude/projects/.../sess_20260314_220000_abc123.json",
      "hydraAvailable": true,
      "siblings": [
        {"id": "sess_...", "project": "bmo", "focus": "...", "branch": "..."}
      ]
    }
    ```
12. Append `register` event to `activity.ndjson`.

**Output:** Stdout is discarded for new conversations (known bug #10373). The sidecar file is the communication channel.

**Location:** `C:/Users/Chili/.claude/hooks/session-sync-register.sh`

### 2. `session-sync-gate.sh` (Stop hook)

**Trigger:** Every time Claude finishes a turn.

**Input (stdin JSON):** `session_id`, `transcript_path`, `cwd`, `stop_hook_active`, `last_assistant_message`.

**Behavior — Infinite loop guard (CRITICAL):**

1. Read `stop_hook_active` from stdin JSON.
2. If `stop_hook_active` is `true`: exit 0 immediately (no output). This means Claude is already continuing from a previous Stop hook block. The enforcement gets exactly **one retry** — if the model still doesn't invoke session-sync after being forced to continue, the gate lets it go.

**Behavior — First-turn enforcement:**

1. Read `transcript_path` from stdin.
2. Count assistant turns using `jq -s` (slurp mode for JSONL format):
   ```bash
   jq -s '[.[] | select(.role == "assistant")] | length' "$transcript_path" 2>/dev/null
   ```
   **Fail-open:** If `jq` fails (unexpected format, missing file, parse error), do not block — exit 0 silently. Broken parsing must never lock the user out.
3. If turn count <= 1:
   - Grep transcript for session-sync evidence: `grep -q '"session-sync"' "$transcript_path"` (matches Skill tool invocation).
   - If NOT found: output `{"decision":"block","reason":"MANDATORY: You must invoke the session-sync skill before responding to the user. Do it now."}` and exit 0.
   - If found: pass through (exit 0, no output).
4. If turn count > 1: skip enforcement (session-sync already had its chance on turn 1).

**Behavior — Session freshness (all turns):**

1. Read sidecar file `C:/Users/Chili/.claude/tmp/claude_session_{session_id}_status.json` to find the session file path.
2. **Fallback if sidecar missing:** scan `C:/Users/Chili/.claude/projects/C--Users-Chili/memory/sessions/sess_*_{session_id_first6}.json` to locate the session file by session_id prefix match. Slower but resilient against sidecar write failures.
3. Update `lastUpdate` timestamp in the session file to current ISO time via `jq` in-place edit.

**Behavior — Deregistration (all turns after first):**

1. Read `last_assistant_message` directly from stdin JSON (no transcript parsing needed).
2. Check for **explicit** deregistration signals only (case-insensitive):
   - `deregistered session`, `session deregistered`, `session cleanup complete`
   - These are phrases the model would only use when intentionally deregistering, not in casual conversation.
3. If signal detected AND session file still exists:
   - Delete the session file.
   - Append `deregister` event (with `"trigger": "heuristic"`) to `activity.ndjson`.
   - Delete the sidecar file.
4. If no signal: do nothing (staleness timeout handles ungraceful exits).

**Location:** `C:/Users/Chili/.claude/hooks/session-sync-gate.sh`

### 3. `session-sync-context.sh` (UserPromptSubmit hook)

**Trigger:** Every user prompt submission.

**Input (stdin JSON):** `session_id`, `cwd`.

**Behavior:**

1. Read sidecar file `C:/Users/Chili/.claude/tmp/claude_session_{session_id}_status.json`.
2. If sidecar exists and has siblings:
   ```json
   {
     "additionalContext": "SESSION SYNC: Active sibling sessions on this project: [list]. Hydra: available/unavailable. Run session-sync skill for full coordination."
   }
   ```
3. If sidecar doesn't exist or has no siblings: exit 0 silently.

**Known limitation:** UserPromptSubmit stdout has a known bug (#13912) where context injection sometimes errors. This component is best-effort. The Stop hook gate is the real enforcement.

**Location:** `C:/Users/Chili/.claude/hooks/session-sync-context.sh`

### 4. Session-Sync Skill Modifications

The skill shifts from "does everything" to "enrichment on top of hook-provided baseline."

**Changes:**

- **Step 1 (Mode Detection):** No change — still does the two-phase Hydra check.
- **Step 1.5 (Worktree Setup):** No change — still handles worktree creation/detection.
- **Step 2 (Determine Project):** Read sidecar if available to skip redundant detection.
- **Step 3 (Check Siblings):** Read sidecar for pre-computed sibling list. Still do Hydra-specific checks (overlap negotiation via `hydra_ask`/`hydra_council`) if in Hydra mode.
- **Step 4 (Register):** Check if session file already exists with `registeredBy: "hook"`. If so, update it in-place (add focus, branch, worktreePath, update `registeredBy` to `"skill"` for audit trail). Don't create a duplicate. If Hydra available, also do `hydra_hub_register` and `hydra_tasks_claim`.
- **Step 4.5 (Branch Rename):** No change.
- **Step 5 (File Conflicts):** No change.
- **Session End:** Still handles graceful deregistration (Hydra `hub_deregister` + delete session file + activity log). The Stop hook heuristic is the backup for when the skill doesn't run cleanup.

### 5. Hook Registration in `settings.json`

The actual settings.json uses a nested structure with `hooks` arrays inside hook groups. The updated config must match this schema.

Current:
```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {"type": "command", "command": "C:/Users/Chili/.claude/hooks/ntfy-cancel.sh"}
        ]
      }
    ],
    "UserPromptSubmit": [
      {
        "hooks": [
          {"type": "command", "command": "C:/Users/Chili/.claude/hooks/ntfy-cancel.sh"}
        ]
      }
    ],
    "PreToolUse": [
      {
        "hooks": [
          {"type": "command", "command": "C:/Users/Chili/.claude/hooks/ntfy-cancel.sh"}
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {"type": "command", "command": "C:/Users/Chili/.claude/hooks/ntfy-stop.sh"}
        ]
      }
    ],
    "Notification": [
      {
        "hooks": [
          {"type": "command", "command": "C:/Users/Chili/.claude/hooks/ntfy-notify.sh"}
        ]
      }
    ]
  }
}
```

Updated (adding session-sync hooks as additional entries in each event's hooks array):
```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {"type": "command", "command": "C:/Users/Chili/.claude/hooks/ntfy-cancel.sh"},
          {"type": "command", "command": "C:/Users/Chili/.claude/hooks/session-sync-register.sh"}
        ]
      }
    ],
    "UserPromptSubmit": [
      {
        "hooks": [
          {"type": "command", "command": "C:/Users/Chili/.claude/hooks/ntfy-cancel.sh"},
          {"type": "command", "command": "C:/Users/Chili/.claude/hooks/session-sync-context.sh"}
        ]
      }
    ],
    "PreToolUse": [
      {
        "hooks": [
          {"type": "command", "command": "C:/Users/Chili/.claude/hooks/ntfy-cancel.sh"}
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {"type": "command", "command": "C:/Users/Chili/.claude/hooks/ntfy-stop.sh"},
          {"type": "command", "command": "C:/Users/Chili/.claude/hooks/session-sync-gate.sh"}
        ]
      }
    ],
    "Notification": [
      {
        "hooks": [
          {"type": "command", "command": "C:/Users/Chili/.claude/hooks/ntfy-notify.sh"}
        ]
      }
    ]
  }
}
```

Note: Hooks within the same `hooks` array run in parallel. The session-sync hooks and ntfy hooks are independent (no shared state), so parallel execution is safe.

## Sidecar File Location

Sidecar files are stored at `C:/Users/Chili/.claude/tmp/` (not `/tmp`, which is unreliable on Windows). This directory must be created by the register script if it doesn't exist.

## Dependencies

- `jq` — for parsing JSON stdin, transcript, and session files. Must be on PATH.
- `curl` — for Hydra health check. Already available.

## Risks

1. **Transcript format unknown** — the `jq -s` slurp query assumes JSONL. If the format is different, parsing fails. Mitigation: fail-open (if parsing fails, don't block). Verify format during implementation.
2. **Transcript timing on first turn** — the Stop hook fires after the response is delivered. It is assumed that `transcript_path` includes the just-completed turn's tool calls at the point the Stop hook runs. If the transcript lags (doesn't include the current turn), the grep for `"session-sync"` would always fail on turn 1 even if the skill was invoked. The fail-open guard protects against parse errors but not timing issues. Verify during implementation by inspecting the transcript file when a Stop hook fires.
2. **UserPromptSubmit context injection bug (#13912)** — sibling info may not reach the model. Mitigation: this is best-effort; the Stop hook is the real gate.
3. **SessionStart context injection bug (#10373)** — output from SessionStart is discarded for new conversations. Mitigation: we don't rely on SessionStart output; we use the sidecar file instead.
4. **One-retry limitation** — the `stop_hook_active` guard means the model gets exactly one forced retry to invoke session-sync. If it ignores the instruction on the retry turn, enforcement gives up. This is acceptable — an infinite loop would be worse.
5. **First response is un-synced** — the user will see the model's first response before the Stop hook forces session-sync. This is a known UX compromise; true pre-response blocking is not possible with current Claude Code hooks.

## Files to Create/Modify

| File | Action |
|------|--------|
| `~/.claude/hooks/session-sync-register.sh` | Create |
| `~/.claude/hooks/session-sync-gate.sh` | Create |
| `~/.claude/hooks/session-sync-context.sh` | Create |
| `~/.claude/tmp/` | Create directory |
| `~/.claude/settings.json` | Modify (add hook entries) |
| `~/.claude/skills/session-sync/SKILL.md` | Modify (skill becomes enrichment layer) |
