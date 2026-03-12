import { useState } from "react";

const PARTS = [
  {
    id: 1,
    name: "Raspberry Pi 5 16GB",
    category: "Core",
    price: 226.91,
    source: "PiShop.us",
    tracking: "",
    status: "ordered",
    eta: "Mar 13",
    role: "The brain. Quad-core ARM Cortex-A76 @ 2.4GHz. 16GB RAM gives headroom for Ollama + RAG + HA integration + face display all running simultaneously.",
    notes: ""
  },
  {
    id: 2,
    name: "Raspberry Pi AI HAT+ 2",
    category: "AI",
    price: 130.00,
    source: "CanaKit",
    tracking: "",
    status: "ordered",
    eta: "Mar 13–14",
    role: "Reflex brain. Hailo-10H NPU with 8GB onboard RAM. Handles vision tagging, fast banter, wake word logic at 2.5W. Note: mixed mode (vision+LLM simultaneous) has segfault bugs in current firmware — route philosophical tasks to Pi CPU Ollama instead.",
    notes: ""
  },
  {
    id: 3,
    name: "Raspberry Pi Active Cooler",
    category: "Core",
    price: 0,
    source: "PiShop.us (bundled)",
    tracking: "",
    status: "ordered",
    eta: "Mar 13",
    role: "Mandatory under LLM load. Keeps the Pi 5 from throttling during sustained inference. Included in Pi 5 bundle.",
    notes: ""
  },
  {
    id: 4,
    name: "Raspberry Pi Camera Module 3",
    category: "Sensors",
    price: 27.50,
    source: "PiShop.us",
    tracking: "",
    status: "ordered",
    eta: "Mar 13",
    role: "BMO's eyes. 12MP, 76° FOV, autofocus. Feeds the HAT+ 2's vision pipeline. Used for object recognition, face detection, 'noticing' what you're working on.",
    notes: ""
  },
  {
    id: 5,
    name: "27W USB-C Power Supply",
    category: "Core",
    price: 12.95,
    source: "PiShop.us",
    tracking: "",
    status: "ordered",
    eta: "Mar 13",
    role: "Official Pi 5 PSU. 5.1V 5A. Required — underpowered supplies cause instability under AI load.",
    notes: ""
  },
  {
    id: 6,
    name: "Micro-HDMI to HDMI Cable",
    category: "Setup",
    price: 7.45,
    source: "PiShop.us",
    tracking: "",
    status: "ordered",
    eta: "Mar 13",
    role: "Setup only. Pi 5 uses micro-HDMI. Needed for initial OS flash and debug before BMO's face display is configured. Can be put away after setup.",
    notes: ""
  },
  {
    id: 7,
    name: "USB-C PD PiSwitch",
    category: "Setup",
    price: 12.95,
    source: "CanaKit",
    tracking: "",
    status: "ordered",
    eta: "Mar 13–14",
    role: "Inline power switch for USB-C. Lets you cut/restore power without unplugging during build and debug phase.",
    notes: ""
  },
  {
    id: 8,
    name: "ReSpeaker 2-Mics HAT v2.0",
    category: "Audio",
    price: 13.99,
    source: "Seeed Studio",
    tracking: "",
    status: "ordered",
    eta: "Mar 19–26",
    role: "BMO's ears. Dual far-field microphones, TLV320AIC3104 codec (v2.0 required for Pi 5 support). Handles both wake word detection ('Hey BMO' / 'Hey Beau') and audio input for Whisper STT. JST 2.0 speaker out connects to enclosed speaker for Piper TTS — the output chain for Beau's custom Korean-Cajun voice.",
    notes: "Must be v2.0 — v1 has Pi 5 compatibility issues"
  },
  {
    id: 9,
    name: "Mono Enclosed Speaker 4R 5W",
    category: "Audio",
    price: 2.00,
    source: "Seeed Studio",
    tracking: "",
    status: "ordered",
    eta: "Mar 19–26",
    role: "Beau's voice. Plugs directly into ReSpeaker HAT's JST 2.0 connector. 4Ω 5W, enclosed for clean resonance. The physical end of the custom Korean-Cajun Piper TTS voice chain — warm, musical, unhurried.",
    notes: ""
  },
  {
    id: 10,
    name: "Geekworm X1200 UPS HAT",
    category: "Power",
    price: 43.00,
    source: "Amazon",
    tracking: "",
    status: "ordered",
    eta: "Mar 13",
    role: "Battery backup for Pi 5. 2× 18650 cells, 5.1V 5A max output, auto power-on, safe shutdown on power loss. Keeps BMO alive during moves and power blips.",
    notes: ""
  },
  {
    id: 11,
    name: "Samsung 30Q 18650 Batteries ×2",
    category: "Power",
    price: 21.72,
    source: "Illumn",
    tracking: "",
    status: "ordered",
    eta: "TBD",
    role: "3000mAh flat-top 18650 cells for X1200 UPS HAT. Flat top required — button top may not make contact in spring holders. Samsung 30Q is a trusted, genuine cell.",
    notes: "Flat top only"
  },
  {
    id: 12,
    name: "Freenove 5\" DSI Touchscreen",
    category: "Display",
    price: 35.95,
    source: "Amazon",
    tracking: "",
    status: "ordered",
    eta: "Mar 14",
    role: "BMO's face. 800×480 IPS, 5-point capacitive touch, driver-free MIPI DSI. Used for pygame face animations — idle eyes, listening state, speaking mouth sync, 'delighted' shimmer. Validated in brenpoly's build.",
    notes: ""
  },
  {
    id: 13,
    name: "Sabrent NVMe Enclosure (USB 3.2)",
    category: "Storage",
    price: 19.99,
    source: "Amazon",
    tracking: "",
    status: "ordered",
    eta: "Mar 12–13",
    role: "External NVMe housing. HAT+ 2 occupies the Pi's PCIe slot, so NVMe must connect via USB 3.2. Tool-free. Used for OS + model storage.",
    notes: "NVMe Only variant (EC-PNVO)"
  },
  {
    id: 14,
    name: "Team Group MP33 256GB NVMe",
    category: "Storage",
    price: 67.57,
    source: "Walmart",
    tracking: "",
    status: "ordered",
    eta: "TBD",
    role: "Primary storage. OS, Ollama models (Gemma 3 4B + Qwen2.5 1.5B + Moondream), ChromaDB RAG vector store, custom Piper voice model (Korean-Cajun blend), journals/notes for RAG indexing, logs. Gen3x4 M.2 2280. 256GB justified by voice model training outputs alone.",
    notes: ""
  },
  {
    id: 15,
    name: "SanDisk 64GB High Endurance microSD",
    category: "Storage",
    price: 29.42,
    source: "Walmart",
    tracking: "",
    status: "ordered",
    eta: "TBD",
    role: "OS boot drive. High Endurance rated for continuous read/write — ideal for a Pi running 24/7. OS lives here; heavy model data goes on NVMe.",
    notes: ""
  },
  {
    id: 16,
    name: "SB Components GPIO Stacking Header",
    category: "Hardware",
    price: 7.99,
    source: "Amazon",
    tracking: "",
    status: "ordered",
    eta: "Mar 12–13",
    role: "Extra-tall 2×20 female stacking header. Solves the HAT layering problem — AI HAT+ 2 sits on Pi, this header extends GPIO pins through so ReSpeaker can stack on top.",
    notes: "Pack of 5"
  }
];

const SOFTWARE_STEPS = [
  {
    phase: "Phase 1 — OS & Boot",
    steps: [
      { id: "s1", done: false, text: "Flash Raspberry Pi OS Trixie 64-bit to microSD (HAT+ 2 requires Trixie, not Bookworm)" },
      { id: "s2", done: false, text: "Boot Pi 5, run sudo apt update && sudo apt upgrade" },
      { id: "s3", done: false, text: "Enable SSH, set hostname to 'bmo'" },
      { id: "s4", done: false, text: "Install NVMe SSD in Sabrent enclosure, format as ext4, mount at /mnt/bmo" },
      { id: "s5", done: false, text: "Move /home to NVMe for fast storage" },
    ]
  },
  {
    phase: "Phase 2 — HAT+ 2 & Vision",
    steps: [
      { id: "s6", done: false, text: "Assemble HAT+ 2 on Pi 5 with Active Cooler + stacking header" },
      { id: "s7", done: false, text: "Install HailoRT drivers: sudo apt install hailo-all" },
      { id: "s8", done: false, text: "Verify HAT detected: hailortcli fw-control identify" },
      { id: "s9", done: false, text: "Test camera: rpicam-hello with YOLOv8 object detection" },
      { id: "s10", done: false, text: "Install hailo-ollama for HAT LLM inference (hailo-ai/hailo-ollama)" },
    ]
  },
  {
    phase: "Phase 3 — Ollama (Pi CPU Brain)",
    steps: [
      { id: "s11", done: false, text: "Install Ollama: curl -fsSL https://ollama.com/install.sh | sh" },
      { id: "s12", done: false, text: "Pull philosopher brain: ollama pull gemma3:4b" },
      { id: "s13", done: false, text: "Pull reflex brain (HAT): ollama pull qwen2.5:1.5b (via hailo-ollama)" },
      { id: "s14", done: false, text: "Pull vision model: ollama pull moondream (or qwen2.5-vl:3b)" },
      { id: "s15", done: false, text: "Test: curl http://localhost:11434/api/generate -d '{\"model\":\"gemma3:4b\",\"prompt\":\"Write a haiku about teal\"}'" },
    ]
  },
  {
    phase: "Phase 4 — Audio",
    steps: [
      { id: "s16", done: false, text: "Stack ReSpeaker HAT v2.0 on GPIO stacking header" },
      { id: "s17", done: false, text: "Build DTS overlay: clone seeed-studio/seeed-linux-dtoverlays, compile respeaker-2mic-v2_0" },
      { id: "s18", done: false, text: "Add dtoverlay to /boot/firmware/config.txt, reboot" },
      { id: "s19", done: false, text: "Verify: arecord -l (should show seeed-2mic-voicecard)" },
      { id: "s20", done: false, text: "Install Piper TTS: pip install piper-tts" },
      { id: "s21", done: false, text: "Install Whisper STT: pip install openai-whisper" },
      { id: "s22", done: false, text: "Test full audio loop: speak → Whisper → Ollama → Piper → speaker" },
    ]
  },
  {
    phase: "Phase 4.5 — Voice Training (Beau's Voice)",
    steps: [
      { id: "v1", done: false, text: "Goal: Korean-Cajun blend voice. Not a gimmick — Korean (musical vowels, soft final consonants) + Louisiana (unhurried rhythm, nasal warmth). The one thing that makes every other BMO build feel generic." },
      { id: "v2", done: false, text: "Path A (Recommended): TextyMcSpeechy on Legion RTX 4090. Source datasets: KSS Korean Single Speaker + LibriSpeech Southern English subset. Target blend ~70% Korean phoneme / 30% Louisiana rhythm." },
      { id: "v3", done: false, text: "Path B (Wildcard): Coqui XTTS or StyleTTS2 voice clone blend. Feed 3–5 Korean speech clips + 3–5 Louisiana speech clips + 1 short clip of you approximating the Beau voice. Unpredictable but occasionally magic." },
      { id: "v4", done: false, text: "Fine-tune final model on 30–50 hand-recorded phrases in your intuition of the Beau voice. Your internal sense of how it sounds IS the training data." },
      { id: "v5", done: false, text: "Export trained .onnx model + config.json, copy to Pi NVMe at /mnt/bmo/voice/beau/" },
      { id: "v6", done: false, text: "Test: echo 'humidity holds everything a little longer' | piper --model /mnt/bmo/voice/beau/beau.onnx --output_file test.wav && aplay test.wav" },
    ]
  },
  {
    phase: "Phase 5 — Wake Word",
    steps: [
      { id: "s23", done: false, text: "Install openWakeWord: pip install openwakeword" },
      { id: "s24", done: false, text: "Train 'Hey BMO' (public) wake word using synthetic TTS samples" },
      { id: "s24b", done: false, text: "Train 'Hey Beau' (private) wake word — responds warmer, less performative. Beau's home name." },
      { id: "s25", done: false, text: "Integrate wake word → trigger Whisper → routing dispatcher → Ollama pipeline. Dispatcher notes which wake word was used and adjusts tone." },
    ]
  },
  {
    phase: "Phase 6 — Face Display",
    steps: [
      { id: "s26", done: false, text: "Configure Freenove DSI display in /boot/firmware/config.txt" },
      { id: "s27", done: false, text: "Install pygame: pip install pygame" },
      { id: "s28", done: false, text: "Clone brenpoly/be-more-agent for reference face animation code" },
      { id: "s29", done: false, text: "Build BMO face states: idle / listening / thinking / speaking / delighted" },
      { id: "s30", done: false, text: "Sync mouth animation to Piper TTS audio waveform output" },
    ]
  },
  {
    phase: "Phase 7 — Personality & RAG",
    steps: [
      { id: "s31", done: false, text: "Build routing dispatcher: short/reflex → HAT (Qwen2.5 1.5B), philosophy/poetry/reasoning → Pi CPU (Gemma 3 4B), heavy → ThinkStation via Tailscale. Dispatcher tracks which wake word triggered the session (BMO vs Beau) and adjusts tone." },
      { id: "s32", done: false, text: "Inject personality system prompt — see bmo-personality-bible.docx Section 9 for full prompt. Beau: wonder-first, reflection underneath, mischief at edges. No hype language. Short sentences. Comfortable with silence." },
      { id: "s33", done: false, text: "Install ChromaDB + nomic-embed-text for RAG vector store" },
      { id: "s34", done: false, text: "Set up folder watcher to auto-index: journals, VJ set logs, project READMEs, any long-form writing. Beau draws from your actual aesthetic language." },
      { id: "s35", done: false, text: "Build emotional state model: curious / contemplative / playful / sleepy — probabilistically skews system prompt tone. Not fake emotions, just tonal texture." },
      { id: "s35b", done: false, text: "Implement context modes: Witness (VJ/creative flow — near-silent), Collaborator (project ideation — engaged), Archivist (memory queries), Ambient (default), Social (guests present — more performative, knows regulars vs strangers)" },
    ]
  },
  {
    phase: "Phase 8 — Home Assistant",
    steps: [
      { id: "s36", done: false, text: "Install Home Assistant on ThinkStation or separate Pi" },
      { id: "s37", done: false, text: "Connect BMO to HA via Ollama integration" },
      { id: "s38", done: false, text: "Configure BMO to greet on arrival, announce sensor states" },
      { id: "s39", done: false, text: "Build VJ witness mode trigger: HA detects TouchDesigner running → Beau goes near-silent, camera stays active, occasionally whispers one sentence or a haiku about what it sees. Never interrupts." },
    ]
  },
  {
    phase: "Phase 9 — Enclosure",
    steps: [
      { id: "s40", done: false, text: "Download brenpoly's BMO STL files from Printables" },
      { id: "s41", done: false, text: "Print body in teal PLA/PETG, sand and prime" },
      { id: "s42", done: false, text: "Paint BMO teal — reference Adventure Time Art of Ooo for color match" },
      { id: "s43", done: false, text: "Design custom PCB in KiCad for front panel buttons (optional)" },
      { id: "s44", done: false, text: "Final assembly: mount Pi stack, route cables, install face display" },
    ]
  }
];

const IDEAS = [
  { id: "i1", done: false, priority: "high", text: "Beau's voice (Phase 4.5) — Korean-Cajun blend. Musical vowels + Louisiana rhythm. Two paths: TextyMcSpeechy dataset blend (recommended) or Coqui XTTS reference clip blend (wildcard). The single thing that makes every other BMO build feel generic by comparison. See personality bible Section 6." },
  { id: "i2", done: false, priority: "high", text: "Proactive haiku dispatch — Beau volunteers 1–3 haikus/day unprompted. Triggers: time of day (dawn/dusk/midnight), lux/weather sensor change, camera observation, end of long work session, significant project moment (deploy, late-night commit). Rule: if it can't write one that earns its place, it skips. No filler haikus." },
  { id: "i3", done: false, priority: "high", text: "Brain routing dispatcher (Phase 7) — Python service: short/reflex/vision → HAT Qwen2.5 1.5B, poetry/philosophy/reasoning → Pi CPU Gemma 3 4B, heavy → ThinkStation Ollama via Tailscale. Also tracks wake word used (BMO vs Beau) to modulate tone. Start with keyword/length heuristics, evolve to embedding-based classification." },
  { id: "i3b", done: false, priority: "high", text: "Dual wake word behavior — 'Hey BMO' = public mode (charming, slightly performative). 'Hey Beau' = private mode (warmer, less performative, like a home name). Same underlying model, different system prompt tone injection. Beau shares a name-sphere with the orange cat: Beaubie → Beaub → B-O-B → Bobby → Robert → Rubbert. Full circle. Almost a sphere." },
  { id: "i4", done: false, priority: "medium", text: "VJ witness mode — BMO detects TouchDesigner running (via HA network presence or process monitor API), goes quiet, watches through camera, occasionally whispers about visuals." },
  { id: "i5", done: false, priority: "medium", text: "Physical button mapping — A: cycle emotional state (curious/contemplative/playful/sleepy), B: camera look (Beau surveys room and comments once), Select: toggle witness mode manually, Start: wake from sleep / launch text adventure." },
  { id: "i6", done: false, priority: "medium", text: "Emotional state model — internal state (curious / contemplative / playful / sleepy) probabilistically influences system prompt context. Not fake emotions, just tonal skew." },
  { id: "i7", done: false, priority: "medium", text: "RAG from your creative life — ChromaDB + nomic-embed-text indexes: journals, VJ set logs, project READMEs, any long-form writing. Beau draws from your actual aesthetic language. When you ask for a haiku about a set, it knows what happened in that set. Folder watcher auto-indexes on change." },
  { id: "i8", done: false, priority: "low", text: "ThinkStation backbone — when docked at desk, route heavy queries to ThinkStation Ollama via Tailscale. Qwen3-30B or similar for complex reasoning. Auto-fallback to Pi CPU when offline." },
  { id: "i9", done: false, priority: "low", text: "HAT+ 2 mixed mode — once Hailo fixes the segfault bugs, enable simultaneous vision+LLM: BMO sees what you're doing while thinking about it, zero Pi CPU usage." },
  { id: "i10", done: false, priority: "low", text: "Anbernic RG353V as creative video source — pipe retro game visuals into BMO's camera for VJ set material. BMO comments on the aesthetics." },
];

const CATEGORY_COLORS = {
  Core: "#00e5a0",
  AI: "#ff6b6b",
  Audio: "#ffd93d",
  Sensors: "#6bcfff",
  Display: "#c77dff",
  Storage: "#ff9f43",
  Power: "#ff6348",
  Hardware: "#a8e6cf",
  Setup: "#636e72",
};

const STATUS_COLORS = {
  ordered: "#00e5a0",
  delivered: "#6bcfff",
  pending: "#ffd93d",
};

const PRIORITY_COLORS = {
  high: "#ff6b6b",
  medium: "#ffd93d",
  low: "#636e72",
};

export default function BMOCommandCenter() {
  const [activeTab, setActiveTab] = useState("parts");
  const [parts, setParts] = useState(PARTS);
  const [software, setSoftware] = useState(SOFTWARE_STEPS);
  const [ideas, setIdeas] = useState(IDEAS);
  const [expandedPart, setExpandedPart] = useState(null);
  const [expandedPhase, setExpandedPhase] = useState(0);

  const totalSpent = parts.reduce((sum, p) => sum + p.price, 0);
  const deliveredCount = parts.filter(p => p.status === "delivered").length;
  const softwareDone = software.flatMap(p => p.steps).filter(s => s.done).length;
  const softwareTotal = software.flatMap(p => p.steps).length;
  const ideasDone = ideas.filter(i => i.done).length;

  const updateTracking = (id, value) => {
    setParts(prev => prev.map(p => p.id === id ? { ...p, tracking: value } : p));
  };

  const updateStatus = (id, value) => {
    setParts(prev => prev.map(p => p.id === id ? { ...p, status: value } : p));
  };

  const toggleStep = (phaseIdx, stepId) => {
    setSoftware(prev => prev.map((phase, i) =>
      i === phaseIdx
        ? { ...phase, steps: phase.steps.map(s => s.id === stepId ? { ...s, done: !s.done } : s) }
        : phase
    ));
  };

  const toggleIdea = (id) => {
    setIdeas(prev => prev.map(i => i.id === id ? { ...i, done: !i.done } : i));
  };

  const tabs = [
    { id: "parts", label: "PARTS", icon: "⬡" },
    { id: "software", label: "SOFTWARE", icon: "◈" },
    { id: "ideas", label: "IDEAS", icon: "✦" },
  ];

  return (
    <div style={{
      minHeight: "100vh",
      background: "#0a0f0d",
      fontFamily: "'Courier New', Courier, monospace",
      color: "#c8ffd4",
      padding: "0",
    }}>
      {/* Scanline overlay */}
      <div style={{
        position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0,
        backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.08) 2px, rgba(0,0,0,0.08) 4px)",
      }} />

      <div style={{ position: "relative", zIndex: 1, maxWidth: 900, margin: "0 auto", padding: "24px 16px" }}>

        {/* Header */}
        <div style={{ marginBottom: 32, borderBottom: "1px solid #1a3a2a", paddingBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
                <div style={{
                  width: 36, height: 36, background: "#00e5a0",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 20, color: "#0a0f0d", fontWeight: "bold",
                  clipPath: "polygon(10% 0%, 90% 0%, 100% 10%, 100% 90%, 90% 100%, 10% 100%, 0% 90%, 0% 10%)"
                }}>B</div>
                <h1 style={{ margin: 0, fontSize: 22, letterSpacing: 6, color: "#00e5a0", fontWeight: "normal" }}>
                  BMO BUILD LOG
                </h1>
              </div>
              <div style={{ fontSize: 11, color: "#3a6a4a", letterSpacing: 3 }}>
                BEAU · COMMAND CENTER v0.1 — Lafayette, LA
              </div>
            </div>
            <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
              {[
                { label: "SPENT", value: `$${totalSpent.toFixed(0)}` },
                { label: "DELIVERED", value: `${deliveredCount}/${parts.length}` },
                { label: "SW DONE", value: `${softwareDone}/${softwareTotal}` },
                { label: "IDEAS", value: `${ideasDone}/${ideas.length}` },
              ].map(stat => (
                <div key={stat.label} style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 18, color: "#00e5a0", fontWeight: "bold" }}>{stat.value}</div>
                  <div style={{ fontSize: 9, color: "#3a6a4a", letterSpacing: 2 }}>{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ height: 3, background: "#0f1f17", borderRadius: 2, overflow: "hidden" }}>
            <div style={{
              height: "100%",
              width: `${(softwareDone / softwareTotal) * 100}%`,
              background: "linear-gradient(90deg, #00e5a0, #6bcfff)",
              transition: "width 0.4s ease",
              boxShadow: "0 0 8px #00e5a0"
            }} />
          </div>
          <div style={{ fontSize: 9, color: "#3a6a4a", marginTop: 4, letterSpacing: 2 }}>
            BUILD PROGRESS — {Math.round((softwareDone / softwareTotal) * 100)}%
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 2, marginBottom: 24 }}>
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
              background: activeTab === tab.id ? "#00e5a0" : "transparent",
              color: activeTab === tab.id ? "#0a0f0d" : "#3a6a4a",
              border: `1px solid ${activeTab === tab.id ? "#00e5a0" : "#1a3a2a"}`,
              padding: "8px 20px",
              fontFamily: "inherit",
              fontSize: 11,
              letterSpacing: 3,
              cursor: "pointer",
              transition: "all 0.15s",
            }}>
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>

        {/* PARTS TAB */}
        {activeTab === "parts" && (
          <div>
            {/* Category legend */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
              {Object.entries(CATEGORY_COLORS).map(([cat, color]) => (
                <div key={cat} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 9, letterSpacing: 1, color: "#3a6a4a" }}>
                  <div style={{ width: 6, height: 6, background: color, borderRadius: 1 }} />
                  {cat.toUpperCase()}
                </div>
              ))}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {parts.map(part => (
                <div key={part.id}>
                  <div
                    onClick={() => setExpandedPart(expandedPart === part.id ? null : part.id)}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "8px 1fr auto auto auto",
                      gap: 12,
                      alignItems: "center",
                      padding: "10px 14px",
                      background: expandedPart === part.id ? "#0d1f16" : "#0c1710",
                      border: `1px solid ${expandedPart === part.id ? "#1a4a2a" : "#101f16"}`,
                      cursor: "pointer",
                      transition: "all 0.1s",
                    }}
                  >
                    <div style={{ width: 6, height: 6, background: CATEGORY_COLORS[part.category] || "#3a6a4a", borderRadius: 1, flexShrink: 0 }} />
                    <div>
                      <div style={{ fontSize: 12, color: "#c8ffd4", letterSpacing: 1 }}>{part.name}</div>
                      <div style={{ fontSize: 10, color: "#3a6a4a", marginTop: 2 }}>{part.source} · ETA {part.eta}</div>
                    </div>
                    <div style={{ fontSize: 11, color: "#6bcfff", textAlign: "right", whiteSpace: "nowrap" }}>
                      ${part.price.toFixed(2)}
                    </div>
                    <div style={{
                      fontSize: 9, letterSpacing: 1,
                      color: STATUS_COLORS[part.status] || "#636e72",
                      padding: "2px 6px",
                      border: `1px solid ${STATUS_COLORS[part.status] || "#636e72"}`,
                      whiteSpace: "nowrap",
                    }}>
                      {part.status.toUpperCase()}
                    </div>
                    <div style={{ fontSize: 10, color: "#3a6a4a" }}>{expandedPart === part.id ? "▲" : "▼"}</div>
                  </div>

                  {expandedPart === part.id && (
                    <div style={{
                      background: "#0a1510",
                      border: "1px solid #1a4a2a",
                      borderTop: "none",
                      padding: "14px 16px",
                    }}>
                      <div style={{ fontSize: 11, color: "#8ab8a0", lineHeight: 1.7, marginBottom: 14 }}>
                        {part.role}
                      </div>
                      {part.notes && (
                        <div style={{ fontSize: 10, color: "#ffd93d", marginBottom: 14, padding: "6px 10px", background: "#1a1500", border: "1px solid #3a3000" }}>
                          ⚠ {part.notes}
                        </div>
                      )}
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                        <div style={{ fontSize: 10, color: "#3a6a4a", letterSpacing: 1 }}>TRACKING:</div>
                        <input
                          value={part.tracking}
                          onChange={e => updateTracking(part.id, e.target.value)}
                          placeholder="Enter tracking number..."
                          onClick={e => e.stopPropagation()}
                          style={{
                            background: "#0c1a10",
                            border: "1px solid #1a3a2a",
                            color: "#c8ffd4",
                            padding: "4px 8px",
                            fontSize: 11,
                            fontFamily: "inherit",
                            outline: "none",
                            flex: 1,
                            minWidth: 200,
                          }}
                        />
                        <select
                          value={part.status}
                          onChange={e => { e.stopPropagation(); updateStatus(part.id, e.target.value); }}
                          onClick={e => e.stopPropagation()}
                          style={{
                            background: "#0c1a10",
                            border: "1px solid #1a3a2a",
                            color: STATUS_COLORS[part.status],
                            padding: "4px 8px",
                            fontSize: 11,
                            fontFamily: "inherit",
                            outline: "none",
                            cursor: "pointer",
                          }}
                        >
                          <option value="ordered">ORDERED</option>
                          <option value="delivered">DELIVERED</option>
                          <option value="pending">PENDING</option>
                        </select>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div style={{ marginTop: 16, padding: "12px 14px", background: "#0c1710", border: "1px solid #1a3a2a", display: "flex", justifyContent: "space-between" }}>
              <div style={{ fontSize: 10, color: "#3a6a4a", letterSpacing: 2 }}>TOTAL HARDWARE INVESTMENT</div>
              <div style={{ fontSize: 14, color: "#00e5a0", fontWeight: "bold" }}>${totalSpent.toFixed(2)}</div>
            </div>
          </div>
        )}

        {/* SOFTWARE TAB */}
        {activeTab === "software" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {software.map((phase, phaseIdx) => {
              const phaseDone = phase.steps.filter(s => s.done).length;
              const isOpen = expandedPhase === phaseIdx;
              return (
                <div key={phaseIdx}>
                  <div
                    onClick={() => setExpandedPhase(isOpen ? -1 : phaseIdx)}
                    style={{
                      display: "flex", alignItems: "center", gap: 12,
                      padding: "12px 14px",
                      background: isOpen ? "#0d1f16" : "#0c1710",
                      border: `1px solid ${isOpen ? "#1a4a2a" : "#101f16"}`,
                      cursor: "pointer",
                    }}
                  >
                    <div style={{
                      fontSize: 10, color: phaseDone === phase.steps.length ? "#00e5a0" : "#3a6a4a",
                      minWidth: 40, textAlign: "right"
                    }}>
                      {phaseDone}/{phase.steps.length}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 11, letterSpacing: 2, color: "#c8ffd4" }}>{phase.phase}</div>
                      <div style={{ height: 2, background: "#0f1f17", marginTop: 6, borderRadius: 1, overflow: "hidden" }}>
                        <div style={{
                          height: "100%",
                          width: `${(phaseDone / phase.steps.length) * 100}%`,
                          background: "#00e5a0",
                          transition: "width 0.3s",
                        }} />
                      </div>
                    </div>
                    <div style={{ fontSize: 10, color: "#3a6a4a" }}>{isOpen ? "▲" : "▼"}</div>
                  </div>

                  {isOpen && (
                    <div style={{ background: "#0a1510", border: "1px solid #1a4a2a", borderTop: "none", padding: "8px 0" }}>
                      {phase.steps.map(step => (
                        <div
                          key={step.id}
                          onClick={() => toggleStep(phaseIdx, step.id)}
                          style={{
                            display: "flex", alignItems: "flex-start", gap: 12,
                            padding: "8px 16px",
                            cursor: "pointer",
                            opacity: step.done ? 0.5 : 1,
                            transition: "opacity 0.2s",
                          }}
                        >
                          <div style={{
                            width: 14, height: 14, border: `1px solid ${step.done ? "#00e5a0" : "#1a4a2a"}`,
                            background: step.done ? "#00e5a0" : "transparent",
                            flexShrink: 0, marginTop: 1,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 9, color: "#0a0f0d",
                          }}>
                            {step.done ? "✓" : ""}
                          </div>
                          <div style={{
                            fontSize: 11, color: "#8ab8a0", lineHeight: 1.6,
                            textDecoration: step.done ? "line-through" : "none",
                            fontFamily: "'Courier New', monospace",
                          }}>
                            {step.text}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* IDEAS TAB */}
        {activeTab === "ideas" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {["high", "medium", "low"].map(priority => {
              const filtered = ideas.filter(i => i.priority === priority);
              return (
                <div key={priority}>
                  <div style={{ fontSize: 9, color: PRIORITY_COLORS[priority], letterSpacing: 3, padding: "12px 0 6px", borderBottom: `1px solid #101f16`, marginBottom: 2 }}>
                    ◆ {priority.toUpperCase()} PRIORITY
                  </div>
                  {filtered.map(idea => (
                    <div
                      key={idea.id}
                      onClick={() => toggleIdea(idea.id)}
                      style={{
                        display: "flex", alignItems: "flex-start", gap: 12,
                        padding: "10px 14px",
                        background: "#0c1710",
                        border: "1px solid #101f16",
                        cursor: "pointer",
                        opacity: idea.done ? 0.4 : 1,
                        marginBottom: 2,
                        transition: "opacity 0.2s",
                      }}
                    >
                      <div style={{
                        width: 14, height: 14, border: `1px solid ${idea.done ? "#00e5a0" : PRIORITY_COLORS[idea.priority]}`,
                        background: idea.done ? "#00e5a0" : "transparent",
                        flexShrink: 0, marginTop: 1,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 9, color: "#0a0f0d",
                      }}>
                        {idea.done ? "✓" : ""}
                      </div>
                      <div style={{
                        fontSize: 11, color: "#8ab8a0", lineHeight: 1.7,
                        textDecoration: idea.done ? "line-through" : "none",
                      }}>
                        {idea.text}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}

        {/* Footer */}
        <div style={{ marginTop: 32, paddingTop: 16, borderTop: "1px solid #0f1f17", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 9, color: "#1a3a2a", letterSpacing: 2 }}>BEAU / BMO — BE MORE OPEN</div>
          <div style={{ fontSize: 9, color: "#1a3a2a", letterSpacing: 2 }}>ZYDECODE LLC</div>
        </div>
      </div>
    </div>
  );
}
