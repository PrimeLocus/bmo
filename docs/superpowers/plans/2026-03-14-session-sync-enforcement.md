# Session-Sync Enforcement Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce session-sync via Claude Code hooks so registration always happens (SessionStart) and the model is forced to invoke the full skill on its first turn (Stop hook gate).

**Architecture:** Three new bash hook scripts + updates to settings.json and the session-sync skill. SessionStart auto-registers, Stop hook gates first turn, UserPromptSubmit injects sibling context. All JSON parsing uses python3 (jq not available). Hooks follow existing ntfy patterns.

**Tech Stack:** Bash (Git Bash/MinGW64), python3, curl

**Spec:** `docs/superpowers/specs/2026-03-14-session-sync-enforcement-design.md`

**CRITICAL PATTERN:** All python3 code in hooks MUST receive bash variables via environment variables (`VAR=val python3 -c "import os; os.environ['VAR']"`), NEVER via string interpolation (`python3 -c "...'$VAR'..."`). String interpolation breaks on paths with single quotes and enables injection. All scripts MUST use LF line endings (not CRLF) — verify with `file` command after creation.

---

## Chunk 1: Shared Config + Register Hook

### Task 1: Create shared config and tmp directory

**Files:**
- Create: `C:/Users/Chili/.claude/hooks/session-sync-config.sh`
- Create: `C:/Users/Chili/.claude/tmp/` (directory)

- [ ] **Step 1: Create the tmp directory**

```bash
mkdir -p "C:/Users/Chili/.claude/tmp"
```

- [ ] **Step 2: Write the shared config script**

```bash
#!/bin/bash
# session-sync-config.sh — shared constants for session-sync hooks
# Sourced by all session-sync-*.sh hooks

SESSIONS_DIR="C:/Users/Chili/.claude/projects/C--Users-Chili/memory/sessions"
SIDECAR_DIR="C:/Users/Chili/.claude/tmp"
ACTIVITY_LOG="$SESSIONS_DIR/activity.ndjson"
STALE_HOURS=3
ACTIVITY_MAX_LINES=2000
ACTIVITY_KEEP_LINES=1000
```

- [ ] **Step 3: Verify both exist**

```bash
ls -la "C:/Users/Chili/.claude/tmp/" && cat "C:/Users/Chili/.claude/hooks/session-sync-config.sh"
```

- [ ] **Step 4: Commit**

```bash
cd "C:/Users/Chili/.claude"
# No git repo here — these are config files, not project code. Skip commit.
```

Note: `~/.claude/` is not a git repo. No commits for hook scripts — just verify they work.

---

### Task 2: Write session-sync-register.sh

**Files:**
- Create: `C:/Users/Chili/.claude/hooks/session-sync-register.sh`

- [ ] **Step 1: Write a test harness script**

Create `C:/Users/Chili/.claude/hooks/test-register.sh`:

```bash
#!/bin/bash
# Test harness for session-sync-register.sh
# Pipes mock SessionStart JSON to the hook and checks side effects

SESSIONS_DIR="C:/Users/Chili/.claude/projects/C--Users-Chili/memory/sessions"
SIDECAR_DIR="C:/Users/Chili/.claude/tmp"
HOOK="C:/Users/Chili/.claude/hooks/session-sync-register.sh"

# Clean up any previous test artifacts
rm -f "$SESSIONS_DIR"/sess_*_test01.json
rm -f "$SIDECAR_DIR"/claude_session_test-session-001_status.json

echo "=== Test 1: Fresh registration (source=startup) ==="
echo '{
  "session_id": "test-session-001",
  "cwd": "/e/Dev/TestProject",
  "source": "startup",
  "hook_event_name": "SessionStart"
}' | bash "$HOOK"

# Check session file was created
SESS_FILE=$(ls "$SESSIONS_DIR"/sess_*_test-s.json 2>/dev/null | head -1)
if [ -n "$SESS_FILE" ]; then
  echo "PASS: Session file created: $SESS_FILE"
  cat "$SESS_FILE"
else
  echo "FAIL: No session file created"
fi

# Check sidecar
SIDECAR="$SIDECAR_DIR/claude_session_test-session-001_status.json"
if [ -f "$SIDECAR" ]; then
  echo "PASS: Sidecar created: $SIDECAR"
  cat "$SIDECAR"
else
  echo "FAIL: No sidecar created"
fi

echo ""
echo "=== Test 2: Resume (source=resume) — should update, not duplicate ==="
echo '{
  "session_id": "test-session-001",
  "cwd": "/e/Dev/TestProject",
  "source": "resume",
  "hook_event_name": "SessionStart"
}' | bash "$HOOK"

COUNT=$(ls "$SESSIONS_DIR"/sess_*_test-s.json 2>/dev/null | wc -l)
if [ "$COUNT" -eq 1 ]; then
  echo "PASS: No duplicate session file on resume (count=$COUNT)"
else
  echo "FAIL: Expected 1 session file, got $COUNT"
fi

# Clean up
rm -f "$SESSIONS_DIR"/sess_*_test-s.json
rm -f "$SIDECAR_DIR"/claude_session_test-session-001_status.json
echo ""
echo "=== All tests complete ==="
```

- [ ] **Step 2: Run the test to verify it fails (hook doesn't exist yet)**

```bash
bash "C:/Users/Chili/.claude/hooks/test-register.sh"
```

Expected: FAIL messages (hook script not found or no output).

- [ ] **Step 3: Write session-sync-register.sh**

Create `C:/Users/Chili/.claude/hooks/session-sync-register.sh`:

```bash
#!/bin/bash
# session-sync-register.sh — auto-register session on startup
# Called on: SessionStart hook
#
# Reads session_id, cwd, source from stdin JSON.
# Writes a sess_*.json file and a sidecar status file.
# Cleans stale sessions and rotates the activity log.
#
# IMPORTANT: All python3 calls receive variables via env vars, never string interpolation.

source "$(dirname "$0")/session-sync-config.sh"

INPUT=$(cat)

# ─── Parse stdin JSON (each field extracted separately for safety) ─────────────
SESSION_ID=$(echo "$INPUT" | python3 -c "
import sys, json
try: print(json.load(sys.stdin).get('session_id', ''))
except: print('')
" 2>/dev/null)

RAW_CWD=$(echo "$INPUT" | python3 -c "
import sys, json
try: print(json.load(sys.stdin).get('cwd', ''))
except: print('')
" 2>/dev/null)

SOURCE=$(echo "$INPUT" | python3 -c "
import sys, json
try: print(json.load(sys.stdin).get('source', 'startup'))
except: print('startup')
" 2>/dev/null)

[ -z "$SESSION_ID" ] && exit 0

# ─── Normalize CWD ─────────────────────────────────────────────────────────────
NORM_CWD=$(echo "$RAW_CWD" | python3 -c "
import sys, re
cwd = sys.stdin.read().strip()
cwd = cwd.replace('\\\\', '/')
cwd = re.sub(r'^/([a-zA-Z])/', r'\1:/', cwd)
cwd = cwd.lower().rstrip('/')
print(cwd)
" 2>/dev/null)

[ -z "$NORM_CWD" ] && exit 0

PROJECT=$(basename "$NORM_CWD")
ID_PREFIX=$(echo "$SESSION_ID" | cut -c1-6)
TIMESTAMP=$(date -u +"%Y%m%d_%H%M%S")
SESS_ID="sess_${TIMESTAMP}_${ID_PREFIX}"
SESS_FILE="$SESSIONS_DIR/${SESS_ID}.json"

# ─── Ensure directories exist ──────────────────────────────────────────────────
mkdir -p "$SESSIONS_DIR" "$SIDECAR_DIR"

# ─── Quick Hydra check (outside conditional so it's always set) ────────────────
HYDRA_AVAILABLE="false"
if curl -sf --connect-timeout 1 http://localhost:4173/health >/dev/null 2>&1; then
  HYDRA_AVAILABLE="true"
fi

# ─── Handle source: resume/clear/compact → find existing, update only ──────────
if [ "$SOURCE" != "startup" ]; then
  EXISTING=$(ls "$SESSIONS_DIR"/sess_*_${ID_PREFIX}.json 2>/dev/null | head -1)
  if [ -n "$EXISTING" ]; then
    NOW_ISO=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    _SESS_FILE="$EXISTING" _NOW="$NOW_ISO" python3 -c "
import json, os
fp = os.environ['_SESS_FILE']
with open(fp, 'r') as f: d = json.load(f)
d['lastUpdate'] = os.environ['_NOW']
with open(fp, 'w') as f: json.dump(d, f, indent=2)
" 2>/dev/null
    SESS_ID=$(basename "$EXISTING" .json)
    SESS_FILE="$EXISTING"
  fi
  [ -n "$EXISTING" ] && SKIP_CREATE=1
fi

# ─── Create session file (startup or missing resume) ──────────────────────────
if [ -z "$SKIP_CREATE" ]; then
  NOW_ISO=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

  _ID="$SESS_ID" _PROJECT="$PROJECT" _CWD="$NORM_CWD" _NOW="$NOW_ISO" _FILE="$SESS_FILE" \
  python3 -c "
import json, os
sess = {
    'id': os.environ['_ID'],
    'agent': 'claude-code',
    'project': os.environ['_PROJECT'],
    'cwd': os.environ['_CWD'],
    'status': 'working',
    'focus': '',
    'files': [],
    'branch': None,
    'worktreePath': None,
    'startedAt': os.environ['_NOW'],
    'lastUpdate': os.environ['_NOW'],
    'registeredBy': 'hook'
}
with open(os.environ['_FILE'], 'w') as f:
    json.dump(sess, f, indent=2)
" 2>/dev/null
fi

# ─── Check for sibling sessions ───────────────────────────────────────────────
SIBLINGS=$(_DIR="$SESSIONS_DIR" _SELF="$(basename "$SESS_FILE")" _CWD="$NORM_CWD" python3 -c "
import json, glob, os
d = os.environ['_DIR']
self_name = os.environ['_SELF']
norm_cwd = os.environ['_CWD']
siblings = []
for f in glob.glob(os.path.join(d, 'sess_*.json')):
    if os.path.basename(f) == self_name:
        continue
    try:
        with open(f) as fh: data = json.load(fh)
        if data.get('cwd', '').lower() == norm_cwd:
            siblings.append({
                'id': data.get('id', ''),
                'project': data.get('project', ''),
                'focus': data.get('focus', ''),
                'branch': data.get('branch', ''),
                'agent': data.get('agent', '')
            })
    except: pass
print(json.dumps(siblings))
" 2>/dev/null)

# ─── Write sidecar status file ────────────────────────────────────────────────
SIDECAR_FILE="$SIDECAR_DIR/claude_session_${SESSION_ID}_status.json"
_SID="$SESS_ID" _SFILE="$SESS_FILE" _HYDRA="$HYDRA_AVAILABLE" _SIBLINGS="$SIBLINGS" _OUT="$SIDECAR_FILE" \
python3 -c "
import json, os
status = {
    'sessionId': os.environ['_SID'],
    'sessionFile': os.environ['_SFILE'],
    'hydraAvailable': os.environ['_HYDRA'] == 'true',
    'siblings': json.loads(os.environ.get('_SIBLINGS', '[]'))
}
with open(os.environ['_OUT'], 'w') as f:
    json.dump(status, f, indent=2)
" 2>/dev/null

# ─── Clean stale sessions (>3 hours old, any project) ─────────────────────────
_DIR="$SESSIONS_DIR" _HOURS="$STALE_HOURS" python3 -c "
import json, glob, os, time
from datetime import datetime
cutoff = time.time() - (int(os.environ['_HOURS']) * 3600)
for f in glob.glob(os.path.join(os.environ['_DIR'], 'sess_*.json')):
    try:
        with open(f) as fh: d = json.load(fh)
        ts = datetime.fromisoformat(d['lastUpdate'].replace('Z', '+00:00')).timestamp()
        if ts < cutoff: os.remove(f)
    except: pass
" 2>/dev/null

# ─── Rotate activity log if >2000 lines ───────────────────────────────────────
if [ -f "$ACTIVITY_LOG" ]; then
  LINE_COUNT=$(wc -l < "$ACTIVITY_LOG" 2>/dev/null || echo 0)
  if [ "$LINE_COUNT" -gt "$ACTIVITY_MAX_LINES" ]; then
    tail -n "$ACTIVITY_KEEP_LINES" "$ACTIVITY_LOG" > "${ACTIVITY_LOG}.tmp" && mv "${ACTIVITY_LOG}.tmp" "$ACTIVITY_LOG"
  fi
fi

# ─── Append register event to activity log (via python3 for safe JSON) ─────────
NOW_ISO=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
_NOW="$NOW_ISO" _SID="$SESS_ID" _PROJECT="$PROJECT" _CWD="$NORM_CWD" _LOG="$ACTIVITY_LOG" \
python3 -c "
import json, os
entry = {
    'at': os.environ['_NOW'],
    'event': 'register',
    'session': os.environ['_SID'],
    'agent': 'claude-code',
    'project': os.environ['_PROJECT'],
    'cwd': os.environ['_CWD'],
    'focus': '',
    'registeredBy': 'hook'
}
with open(os.environ['_LOG'], 'a') as f:
    f.write(json.dumps(entry) + '\n')
" 2>/dev/null

exit 0
```

- [ ] **Step 4: Make it executable and run the test**

```bash
chmod +x "C:/Users/Chili/.claude/hooks/session-sync-register.sh"
bash "C:/Users/Chili/.claude/hooks/test-register.sh"
```

Expected: PASS for both tests (fresh registration creates file + sidecar; resume updates without duplication).

- [ ] **Step 5: Fix any failing tests, re-run until green**

---

## Chunk 2: Stop Hook Gate

### Task 3: Write session-sync-gate.sh

**Files:**
- Create: `C:/Users/Chili/.claude/hooks/session-sync-gate.sh`

- [ ] **Step 1: Write a test harness for the gate**

Create `C:/Users/Chili/.claude/hooks/test-gate.sh`:

```bash
#!/bin/bash
# Test harness for session-sync-gate.sh
SIDECAR_DIR="C:/Users/Chili/.claude/tmp"
SESSIONS_DIR="C:/Users/Chili/.claude/projects/C--Users-Chili/memory/sessions"
HOOK="C:/Users/Chili/.claude/hooks/session-sync-gate.sh"

# Create a mock transcript (JSONL) — first turn, NO session-sync
MOCK_TRANSCRIPT="/tmp/test_transcript_gate.jsonl"
echo '{"role":"user","content":"Hello"}' > "$MOCK_TRANSCRIPT"
echo '{"role":"assistant","content":"Hi there! How can I help?"}' >> "$MOCK_TRANSCRIPT"

# Create a mock sidecar
MOCK_SESSION_FILE="$SESSIONS_DIR/sess_test_gate01.json"
echo '{"id":"sess_test_gate01","lastUpdate":"2026-03-14T22:00:00Z"}' > "$MOCK_SESSION_FILE"
echo '{"sessionId":"sess_test_gate01","sessionFile":"'"$MOCK_SESSION_FILE"'"}' > "$SIDECAR_DIR/claude_session_test-gate-001_status.json"

echo "=== Test 1: First turn, no session-sync → should BLOCK ==="
OUTPUT=$(echo '{
  "session_id": "test-gate-001",
  "transcript_path": "'"$MOCK_TRANSCRIPT"'",
  "cwd": "/e/Dev/TestProject",
  "stop_hook_active": false,
  "last_assistant_message": "Hi there! How can I help?",
  "hook_event_name": "Stop"
}' | bash "$HOOK")

if echo "$OUTPUT" | grep -q '"block"'; then
  echo "PASS: Gate blocked (no session-sync found)"
else
  echo "FAIL: Gate did not block. Output: $OUTPUT"
fi

echo ""
echo "=== Test 2: stop_hook_active=true → should SKIP (no block) ==="
OUTPUT=$(echo '{
  "session_id": "test-gate-001",
  "transcript_path": "'"$MOCK_TRANSCRIPT"'",
  "cwd": "/e/Dev/TestProject",
  "stop_hook_active": true,
  "last_assistant_message": "Running session-sync now...",
  "hook_event_name": "Stop"
}' | bash "$HOOK")

if [ -z "$OUTPUT" ]; then
  echo "PASS: Gate skipped on stop_hook_active=true"
else
  echo "FAIL: Gate should have skipped. Output: $OUTPUT"
fi

echo ""
echo "=== Test 3: Transcript HAS \"session-sync\" in JSON context → should PASS ==="
echo '{"role":"user","content":"Hello"}' > "$MOCK_TRANSCRIPT"
echo '{"role":"assistant","content":[{"type":"tool_use","name":"Skill","input":{"skill":"session-sync"}}]}' >> "$MOCK_TRANSCRIPT"

OUTPUT=$(echo '{
  "session_id": "test-gate-001",
  "transcript_path": "'"$MOCK_TRANSCRIPT"'",
  "cwd": "/e/Dev/TestProject",
  "stop_hook_active": false,
  "last_assistant_message": "Session sync complete.",
  "hook_event_name": "Stop"
}' | bash "$HOOK")

if [ -z "$OUTPUT" ]; then
  echo "PASS: Gate passed (session-sync found in transcript)"
else
  echo "FAIL: Gate should have passed. Output: $OUTPUT"
fi

echo ""
echo "=== Test 4: Second turn (turn_count > 1) → should SKIP enforcement ==="
echo '{"role":"user","content":"Hello"}' > "$MOCK_TRANSCRIPT"
echo '{"role":"assistant","content":"First response"}' >> "$MOCK_TRANSCRIPT"
echo '{"role":"user","content":"Do something else"}' >> "$MOCK_TRANSCRIPT"
echo '{"role":"assistant","content":"Second response"}' >> "$MOCK_TRANSCRIPT"

OUTPUT=$(echo '{
  "session_id": "test-gate-001",
  "transcript_path": "'"$MOCK_TRANSCRIPT"'",
  "cwd": "/e/Dev/TestProject",
  "stop_hook_active": false,
  "last_assistant_message": "Second response",
  "hook_event_name": "Stop"
}' | bash "$HOOK")

if [ -z "$OUTPUT" ]; then
  echo "PASS: Gate skipped on turn > 1"
else
  echo "FAIL: Gate should have skipped. Output: $OUTPUT"
fi

# Clean up
rm -f "$MOCK_TRANSCRIPT" "$MOCK_SESSION_FILE" "$SIDECAR_DIR/claude_session_test-gate-001_status.json"
echo ""
echo "=== All gate tests complete ==="
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
bash "C:/Users/Chili/.claude/hooks/test-gate.sh"
```

Expected: FAIL (hook doesn't exist yet).

- [ ] **Step 3: Write session-sync-gate.sh**

Create `C:/Users/Chili/.claude/hooks/session-sync-gate.sh`:

```bash
#!/bin/bash
# session-sync-gate.sh — enforce session-sync on first turn + freshness + deregistration
# Called on: Stop hook (every time Claude finishes a turn)
#
# First-turn enforcement:
#   If this is the first assistant turn and session-sync was not invoked,
#   returns {"decision":"block"} to force Claude to continue and run the skill.
#   The model gets exactly ONE retry (stop_hook_active guard prevents infinite loops).
#
# Session freshness:
#   Updates lastUpdate in the session file on every turn.
#
# Deregistration heuristic:
#   Detects explicit deregistration language in last_assistant_message.
#
# IMPORTANT: All python3 calls receive variables via env vars, never string interpolation.

source "$(dirname "$0")/session-sync-config.sh"

INPUT=$(cat)

# ─── Parse stdin JSON (each field individually) ───────────────────────────────
SESSION_ID=$(echo "$INPUT" | python3 -c "
import sys, json
try: print(json.load(sys.stdin).get('session_id', ''))
except: print('')
" 2>/dev/null)

TRANSCRIPT_PATH=$(echo "$INPUT" | python3 -c "
import sys, json
try: print(json.load(sys.stdin).get('transcript_path', ''))
except: print('')
" 2>/dev/null)

STOP_ACTIVE=$(echo "$INPUT" | python3 -c "
import sys, json
try: print(str(json.load(sys.stdin).get('stop_hook_active', False)).lower())
except: print('false')
" 2>/dev/null)

LAST_MSG=$(echo "$INPUT" | python3 -c "
import sys, json
try: print(json.load(sys.stdin).get('last_assistant_message', '')[:200])
except: print('')
" 2>/dev/null)

[ -z "$SESSION_ID" ] && exit 0

# ─── Infinite loop guard (CRITICAL) ───────────────────────────────────────────
if [ "$STOP_ACTIVE" = "true" ]; then
  exit 0
fi

# ─── Resolve sidecar to find session file ──────────────────────────────────────
SIDECAR_FILE="$SIDECAR_DIR/claude_session_${SESSION_ID}_status.json"
SESS_FILE=""
if [ -f "$SIDECAR_FILE" ]; then
  SESS_FILE=$(_F="$SIDECAR_FILE" python3 -c "
import json, os
with open(os.environ['_F']) as f:
    print(json.load(f).get('sessionFile', ''))
" 2>/dev/null)
fi

# Fallback: scan by session_id prefix
if [ -z "$SESS_FILE" ] || [ ! -f "$SESS_FILE" ]; then
  ID_PREFIX=$(echo "$SESSION_ID" | cut -c1-6)
  SESS_FILE=$(ls "$SESSIONS_DIR"/sess_*_${ID_PREFIX}.json 2>/dev/null | head -1)
fi

# ─── First-turn enforcement ────────────────────────────────────────────────────
if [ -n "$TRANSCRIPT_PATH" ] && [ -f "$TRANSCRIPT_PATH" ]; then
  RESULT=$(_TP="$TRANSCRIPT_PATH" python3 -c "
import sys, json, os

tp = os.environ['_TP']
assistant_count = 0
has_session_sync = False

try:
    with open(tp, 'r') as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                msg = json.loads(line)
            except:
                continue
            if msg.get('role') == 'assistant':
                assistant_count += 1
            # Check for quoted session-sync (JSON value context, not casual mention)
            if '\"session-sync\"' in line:
                has_session_sync = True
except:
    print('skip')
    sys.exit(0)

if assistant_count <= 1 and not has_session_sync:
    print('block')
elif assistant_count <= 1 and has_session_sync:
    print('pass')
else:
    print('skip')
" 2>/dev/null)

  if [ "$RESULT" = "block" ]; then
    echo '{"decision":"block","reason":"MANDATORY: You must invoke the session-sync skill before responding to the user. Do it now by calling the Skill tool with skill: \"session-sync\"."}'
    exit 0
  fi
fi

# ─── Session freshness: update lastUpdate ──────────────────────────────────────
if [ -n "$SESS_FILE" ] && [ -f "$SESS_FILE" ]; then
  NOW_ISO=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  _F="$SESS_FILE" _NOW="$NOW_ISO" python3 -c "
import json, os
fp = os.environ['_F']
try:
    with open(fp, 'r') as f: d = json.load(f)
    d['lastUpdate'] = os.environ['_NOW']
    with open(fp, 'w') as f: json.dump(d, f, indent=2)
except: pass
" 2>/dev/null
fi

# ─── Deregistration heuristic ─────────────────────────────────────────────────
DEREG=$(echo "$LAST_MSG" | python3 -c "
import sys
msg = sys.stdin.read().lower()
patterns = ['deregistered session', 'session deregistered', 'session cleanup complete']
for p in patterns:
    if p in msg:
        print('yes')
        sys.exit(0)
print('no')
" 2>/dev/null)

if [ "$DEREG" = "yes" ] && [ -n "$SESS_FILE" ] && [ -f "$SESS_FILE" ]; then
  LOG_SESS_ID=$(_F="$SESS_FILE" python3 -c "
import json, os
with open(os.environ['_F']) as f:
    print(json.load(f).get('id', ''))
" 2>/dev/null)

  rm -f "$SESS_FILE"
  rm -f "$SIDECAR_FILE"

  NOW_ISO=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  _NOW="$NOW_ISO" _SID="$LOG_SESS_ID" _LOG="$ACTIVITY_LOG" python3 -c "
import json, os
entry = {'at': os.environ['_NOW'], 'event': 'deregister', 'session': os.environ['_SID'], 'trigger': 'heuristic'}
with open(os.environ['_LOG'], 'a') as f:
    f.write(json.dumps(entry) + '\n')
" 2>/dev/null
fi

exit 0
```

- [ ] **Step 4: Make executable and run tests**

```bash
chmod +x "C:/Users/Chili/.claude/hooks/session-sync-gate.sh"
bash "C:/Users/Chili/.claude/hooks/test-gate.sh"
```

Expected: All 4 tests PASS.

- [ ] **Step 5: Fix any failing tests, re-run until green**

---

## Chunk 3: Context Hook + Settings Update

### Task 4: Write session-sync-context.sh

**Files:**
- Create: `C:/Users/Chili/.claude/hooks/session-sync-context.sh`

- [ ] **Step 1: Write a test harness**

Create `C:/Users/Chili/.claude/hooks/test-context.sh`:

```bash
#!/bin/bash
# Test harness for session-sync-context.sh
SIDECAR_DIR="C:/Users/Chili/.claude/tmp"
HOOK="C:/Users/Chili/.claude/hooks/session-sync-context.sh"

echo "=== Test 1: Sidecar with siblings → should output additionalContext ==="
echo '{"sessionId":"sess_test","sessionFile":"/tmp/test.json","hydraAvailable":false,"siblings":[{"id":"sess_other","project":"test","focus":"working on X","branch":"claude/feat","agent":"claude-code"}]}' > "$SIDECAR_DIR/claude_session_test-ctx-001_status.json"

OUTPUT=$(echo '{
  "session_id": "test-ctx-001",
  "cwd": "/e/Dev/TestProject",
  "hook_event_name": "UserPromptSubmit"
}' | bash "$HOOK")

if echo "$OUTPUT" | grep -q "additionalContext"; then
  echo "PASS: Context injected"
  echo "$OUTPUT" | python3 -m json.tool 2>/dev/null
else
  echo "FAIL: No context output. Got: $OUTPUT"
fi

echo ""
echo "=== Test 2: No sidecar → should output nothing ==="
rm -f "$SIDECAR_DIR/claude_session_test-ctx-002_status.json"
OUTPUT=$(echo '{
  "session_id": "test-ctx-002",
  "cwd": "/e/Dev/TestProject",
  "hook_event_name": "UserPromptSubmit"
}' | bash "$HOOK")

if [ -z "$OUTPUT" ]; then
  echo "PASS: No output when no sidecar"
else
  echo "FAIL: Unexpected output: $OUTPUT"
fi

echo ""
echo "=== Test 3: Sidecar with no siblings → should output nothing ==="
echo '{"sessionId":"sess_test","sessionFile":"/tmp/test.json","hydraAvailable":true,"siblings":[]}' > "$SIDECAR_DIR/claude_session_test-ctx-003_status.json"

OUTPUT=$(echo '{
  "session_id": "test-ctx-003",
  "cwd": "/e/Dev/TestProject",
  "hook_event_name": "UserPromptSubmit"
}' | bash "$HOOK")

if [ -z "$OUTPUT" ]; then
  echo "PASS: No output when no siblings"
else
  echo "FAIL: Unexpected output: $OUTPUT"
fi

# Clean up
rm -f "$SIDECAR_DIR"/claude_session_test-ctx-*.json
echo ""
echo "=== All context tests complete ==="
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
bash "C:/Users/Chili/.claude/hooks/test-context.sh"
```

- [ ] **Step 3: Write session-sync-context.sh**

Create `C:/Users/Chili/.claude/hooks/session-sync-context.sh`:

```bash
#!/bin/bash
# session-sync-context.sh — inject sibling session info into prompt context
# Called on: UserPromptSubmit hook
#
# Best-effort: known bug (#13912) may cause errors with stdout context injection.
# The Stop hook gate is the real enforcement — this is supplementary.

source "$(dirname "$0")/session-sync-config.sh"

INPUT=$(cat)

# ─── Parse session_id from stdin ───────────────────────────────────────────────
SESSION_ID=$(echo "$INPUT" | python3 -c "
import sys, json
try:
    print(json.load(sys.stdin).get('session_id', ''))
except:
    print('')
" 2>/dev/null)

[ -z "$SESSION_ID" ] && exit 0

# ─── Read sidecar ─────────────────────────────────────────────────────────────
SIDECAR_FILE="$SIDECAR_DIR/claude_session_${SESSION_ID}_status.json"
[ ! -f "$SIDECAR_FILE" ] && exit 0

# ─── Build context if siblings exist ──────────────────────────────────────────
_F="$SIDECAR_FILE" python3 -c "
import json, sys, os

try:
    with open(os.environ['_F']) as f:
        status = json.load(f)
except:
    sys.exit(0)

siblings = status.get('siblings', [])
if not siblings:
    sys.exit(0)

hydra = 'available' if status.get('hydraAvailable') else 'unavailable'
lines = []
for s in siblings:
    agent = s.get('agent', 'unknown')
    focus = s.get('focus', 'no focus set')
    branch = s.get('branch', 'no branch')
    lines.append(f'  - [{agent}] {focus} (branch: {branch})')

sibling_list = '\n'.join(lines)
msg = f'SESSION SYNC: {len(siblings)} active sibling session(s) on this project:\n{sibling_list}\nHydra: {hydra}. Run session-sync skill for full coordination.'

output = json.dumps({'additionalContext': msg})
print(output)
" 2>/dev/null

exit 0
```

- [ ] **Step 4: Make executable and run tests**

```bash
chmod +x "C:/Users/Chili/.claude/hooks/session-sync-context.sh"
bash "C:/Users/Chili/.claude/hooks/test-context.sh"
```

Expected: All 3 tests PASS.

- [ ] **Step 5: Fix any failing tests, re-run until green**

---

### Task 5: Update settings.json

**Files:**
- Modify: `C:/Users/Chili/.claude/settings.json`

- [ ] **Step 1: Back up current settings**

```bash
cp "C:/Users/Chili/.claude/settings.json" "C:/Users/Chili/.claude/settings.json.backup"
```

- [ ] **Step 2: Update settings.json to add all three hook entries**

Add the session-sync hooks alongside existing ntfy hooks. The structure uses nested `hooks` arrays. Each event's array gets the new script added to the inner `hooks` array.

Update `SessionStart`:
```json
"SessionStart": [
  {
    "hooks": [
      {"type": "command", "command": "C:/Users/Chili/.claude/hooks/ntfy-cancel.sh"},
      {"type": "command", "command": "C:/Users/Chili/.claude/hooks/session-sync-register.sh"}
    ]
  }
]
```

Update `UserPromptSubmit`:
```json
"UserPromptSubmit": [
  {
    "hooks": [
      {"type": "command", "command": "C:/Users/Chili/.claude/hooks/ntfy-cancel.sh"},
      {"type": "command", "command": "C:/Users/Chili/.claude/hooks/session-sync-context.sh"}
    ]
  }
]
```

Update `Stop`:
```json
"Stop": [
  {
    "hooks": [
      {"type": "command", "command": "C:/Users/Chili/.claude/hooks/ntfy-stop.sh"},
      {"type": "command", "command": "C:/Users/Chili/.claude/hooks/session-sync-gate.sh"}
    ]
  }
]
```

Leave `PreToolUse` and `Notification` unchanged.

- [ ] **Step 3: Validate the JSON is well-formed**

```bash
python3 -c "import json; json.load(open('C:/Users/Chili/.claude/settings.json')); print('Valid JSON')"
```

Expected: `Valid JSON`

---

### Task 6: Manual integration test

- [ ] **Step 1: Start a fresh Claude Code session in a test directory**

Open a new terminal, navigate to any project directory, and start `claude`.

- [ ] **Step 2: Verify SessionStart hook ran**

Check that a new `sess_*.json` file was created in the sessions directory and a sidecar exists in `~/.claude/tmp/`.

```bash
ls -la "C:/Users/Chili/.claude/projects/C--Users-Chili/memory/sessions/sess_*.json"
ls -la "C:/Users/Chili/.claude/tmp/claude_session_*_status.json"
```

- [ ] **Step 3: Verify Stop hook gate fires**

Send a message. If the model does NOT invoke session-sync on the first turn, it should be forced to continue with the block reason. Check that session-sync gets invoked.

- [ ] **Step 4: Verify session freshness updates**

After a few turns, check that `lastUpdate` in the session file has been updated.

- [ ] **Step 5: Clean up test session**

Delete any test session files and sidecar files created during the integration test.

---

## Chunk 4: Skill + Protocol Updates

### Task 7: Update PROTOCOL.md

**Files:**
- Modify: `C:/Users/Chili/.claude/projects/C--Users-Chili/memory/sessions/PROTOCOL.md`

- [ ] **Step 1: Add `registeredBy` as an optional field**

In the "Field Definitions" table (after the `lastUpdate` row), add:

```markdown
| `registeredBy` | string | no | Provenance: `"hook"` (auto-registered by SessionStart hook) or `"skill"` (enriched by session-sync skill). Informational only — does not gate behavior. |
```

- [ ] **Step 2: Verify the file is valid markdown**

Read back the table to ensure alignment is correct.

---

### Task 8: Update session-sync SKILL.md

**Files:**
- Modify: `C:/Users/Chili/.claude/skills/session-sync/SKILL.md`

- [ ] **Step 1: Add a "Hook-Provided Baseline" section after the Mode Detection section**

Insert after the `## Mode Detection` section (after line 27):

```markdown
## Hook-Provided Baseline

The SessionStart hook (`session-sync-register.sh`) automatically registers a session file and writes a sidecar status file before this skill runs. The Stop hook (`session-sync-gate.sh`) enforces that this skill is invoked on the first turn.

**What the hooks already did:**
- Wrote `sess_*.json` to the sessions directory with `registeredBy: "hook"`
- Checked for sibling sessions and wrote findings to `~/.claude/tmp/claude_session_{session_id}_status.json`
- Cleaned stale sessions (>3 hours old)
- Checked Hydra availability

**What this skill adds:**
- Hydra MCP registration (`hydra_hub_register`, `hydra_tasks_claim`) — hooks can't call MCP tools
- Worktree setup and branch naming
- Sibling overlap negotiation via Hydra `ask`/`council`
- Updates session file with focus, branch, worktreePath, changes `registeredBy` to `"skill"`
- Graceful deregistration on session end
```

- [ ] **Step 2: Modify Step 4 (Register) to check for existing hook-registered session**

Replace the current Step 4 Lite mode content (line 124-125) with:

```markdown
**Lite mode:**
- Check for existing session file with `registeredBy: "hook"` (written by SessionStart hook):
  ```bash
  for f in C:/Users/Chili/.claude/projects/C--Users-Chili/memory/sessions/sess_*.json; do
    FPATH="$f" python3 -c "import json, os; fp=os.environ['FPATH']; d=json.load(open(fp)); print(fp) if d.get('registeredBy')=='hook' else None" 2>/dev/null
  done
  ```
- If found: update it in-place — add focus, branch, worktreePath, change `registeredBy` to `"skill"`. Don't create a duplicate.
- If not found (hook didn't run): write a new session file as before.
```

- [ ] **Step 3: Add note about sidecar optimization to Step 2 and Step 3**

At Step 2 (Determine Project, line 65-72), add:

```markdown
**Optimization:** If the sidecar file exists at `~/.claude/tmp/claude_session_{session_id}_status.json`, read it to get pre-computed cwd, project, and Hydra availability. Skip redundant detection.
```

At Step 3 (Check for Siblings, Lite mode section, line 83-89), add:

```markdown
**Optimization:** If the sidecar file has a `siblings` array, use it instead of scanning session files again.
```

- [ ] **Step 4: Read the updated skill file to verify coherence**

```bash
cat "C:/Users/Chili/.claude/skills/session-sync/SKILL.md"
```

Verify the new sections integrate cleanly with existing content and there are no contradictions.

---

### Task 9: Clean up test harnesses

- [ ] **Step 1: Delete test scripts**

```bash
rm -f "C:/Users/Chili/.claude/hooks/test-register.sh"
rm -f "C:/Users/Chili/.claude/hooks/test-gate.sh"
rm -f "C:/Users/Chili/.claude/hooks/test-context.sh"
```

- [ ] **Step 2: Verify final file inventory**

```bash
ls -la "C:/Users/Chili/.claude/hooks/session-sync-"*
```

Expected files:
- `session-sync-config.sh`
- `session-sync-register.sh`
- `session-sync-gate.sh`
- `session-sync-context.sh`
