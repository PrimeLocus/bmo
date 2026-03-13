import { db } from './index.js';
import { parts, softwarePhases, softwareSteps, ideas } from './schema.js';
import { eq } from 'drizzle-orm';

type Link = { label: string; url: string; kind: 'docs' | 'github' | 'video' | 'guide' };

const STEP_LINKS: Record<string, Link[]> = {
  // Phase 1 — OS & Boot
  s1: [
    { label: 'Raspberry Pi Imager', url: 'https://www.raspberrypi.com/software/', kind: 'docs' },
    { label: 'Getting Started Guide', url: 'https://www.raspberrypi.com/documentation/computers/getting-started.html', kind: 'guide' },
  ],
  s2: [
    { label: 'Updating Raspberry Pi OS', url: 'https://www.raspberrypi.com/documentation/computers/os.html#updating-and-upgrading-raspberry-pi-os', kind: 'docs' },
  ],
  s3: [
    { label: 'SSH Remote Access', url: 'https://www.raspberrypi.com/documentation/computers/remote-access.html#ssh', kind: 'docs' },
  ],
  s4: [
    { label: 'Pi 5 NVMe SSD Boot', url: 'https://www.raspberrypi.com/documentation/computers/raspberry-pi-5.html#nvme-ssd-boot', kind: 'docs' },
  ],
  s5: [
    { label: 'Moving /home to New Partition', url: 'https://help.ubuntu.com/community/Partitioning/Home/Moving', kind: 'guide' },
  ],
  // Phase 2 — HAT+ 2 & Vision
  s6: [
    { label: 'AI Kit Setup Guide', url: 'https://www.raspberrypi.com/documentation/accessories/ai-kit.html', kind: 'docs' },
  ],
  s7: [
    { label: 'hailo-rpi5-examples', url: 'https://github.com/hailo-ai/hailo-rpi5-examples', kind: 'github' },
  ],
  s8: [
    { label: 'hailo-rpi5-examples Docs', url: 'https://github.com/hailo-ai/hailo-rpi5-examples/tree/main/doc', kind: 'github' },
  ],
  s9: [
    { label: 'AI Kit Object Detection', url: 'https://www.raspberrypi.com/documentation/accessories/ai-kit.html#rpicam-apps', kind: 'docs' },
  ],
  s10: [
    { label: 'Ollama GitHub', url: 'https://github.com/ollama/ollama', kind: 'github' },
    { label: 'Hailo TAPPAS', url: 'https://github.com/hailo-ai/tappas', kind: 'github' },
  ],
  // Phase 3 — Ollama
  s11: [
    { label: 'Ollama Linux Install', url: 'https://github.com/ollama/ollama/blob/main/docs/linux.md', kind: 'docs' },
  ],
  s12: [
    { label: 'Ollama: gemma3', url: 'https://ollama.com/library/gemma3', kind: 'docs' },
  ],
  s13: [
    { label: 'Ollama: qwen2.5', url: 'https://ollama.com/library/qwen2.5', kind: 'docs' },
  ],
  s14: [
    { label: 'Ollama: moondream', url: 'https://ollama.com/library/moondream', kind: 'docs' },
  ],
  s15: [
    { label: 'Ollama API Docs', url: 'https://github.com/ollama/ollama/blob/main/docs/api.md', kind: 'docs' },
  ],
  // Phase 4 — Audio
  s16: [
    { label: 'ReSpeaker 2-Mics HAT Wiki', url: 'https://wiki.seeedstudio.com/ReSpeaker_2_Mics_Pi_HAT/', kind: 'docs' },
  ],
  s17: [
    { label: 'HinTak seeed-voicecard (Pi 5)', url: 'https://github.com/HinTak/seeed-voicecard', kind: 'github' },
  ],
  s18: [
    { label: 'Device Tree Overlays', url: 'https://www.raspberrypi.com/documentation/computers/configuration.html#part3', kind: 'docs' },
  ],
  s19: [
    { label: 'ALSA / arecord Guide', url: 'https://wiki.archlinux.org/title/Advanced_Linux_Sound_Architecture', kind: 'guide' },
  ],
  s20: [
    { label: 'Piper TTS GitHub', url: 'https://github.com/rhasspy/piper', kind: 'github' },
  ],
  s21: [
    { label: 'OpenAI Whisper', url: 'https://github.com/openai/whisper', kind: 'github' },
    { label: 'whisper.cpp (Pi-optimized)', url: 'https://github.com/ggerganov/whisper.cpp', kind: 'github' },
  ],
  s22: [
    { label: 'Rhasspy Voice Assistant', url: 'https://rhasspy.readthedocs.io/', kind: 'docs' },
  ],
  // Phase 4.5 — Voice Training
  v1: [
    { label: 'TextyMcSpeechy', url: 'https://github.com/domesticatedviking/TextyMcSpeechy', kind: 'github' },
    { label: 'Piper TTS Training', url: 'https://github.com/rhasspy/piper/tree/master/training', kind: 'github' },
  ],
  v2: [
    { label: 'KSS Korean Dataset', url: 'https://github.com/Kyubyong/kss', kind: 'github' },
    { label: 'LibriSpeech Dataset', url: 'https://www.openslr.org/12/', kind: 'docs' },
  ],
  v3: [
    { label: 'Piper Training Guide', url: 'https://github.com/rhasspy/piper/tree/master/training', kind: 'github' },
  ],
  v4: [
    { label: 'TextyMcSpeechy Fine-Tune', url: 'https://github.com/domesticatedviking/TextyMcSpeechy', kind: 'github' },
  ],
  v5: [
    { label: 'Piper ONNX Export', url: 'https://github.com/rhasspy/piper/tree/master/training', kind: 'github' },
  ],
  v6: [
    { label: 'Piper Usage Docs', url: 'https://github.com/rhasspy/piper#usage', kind: 'github' },
  ],
  // Phase 5 — Wake Word
  s23: [
    { label: 'openWakeWord GitHub', url: 'https://github.com/dscripka/openWakeWord', kind: 'github' },
  ],
  s24: [
    { label: 'Custom Wake Word Training', url: 'https://github.com/dscripka/openWakeWord/blob/main/docs/custom_models.md', kind: 'docs' },
  ],
  s24b: [
    { label: 'Custom Wake Word Training', url: 'https://github.com/dscripka/openWakeWord/blob/main/docs/custom_models.md', kind: 'docs' },
  ],
  s25: [
    { label: 'Ollama REST API', url: 'https://github.com/ollama/ollama/blob/main/docs/api.md', kind: 'docs' },
  ],
  // Phase 6 — Face Display
  s26: [
    { label: 'Raspberry Pi DSI Display', url: 'https://www.raspberrypi.com/documentation/accessories/display.html', kind: 'docs' },
  ],
  s27: [
    { label: 'Pygame Getting Started', url: 'https://www.pygame.org/wiki/GettingStarted', kind: 'docs' },
  ],
  s28: [
    { label: 'be-more-agent (BMO face)', url: 'https://github.com/brenpoly/be-more-agent', kind: 'github' },
  ],
  s29: [
    { label: 'Pygame Sprite Animation', url: 'https://www.pygame.org/docs/tut/SpriteIntro.html', kind: 'guide' },
  ],
  s30: [
    { label: 'Rhubarb Lip Sync', url: 'https://github.com/DanielSWolf/rhubarb-lip-sync', kind: 'github' },
  ],
  // Phase 7 — Personality & RAG
  s31: [
    { label: 'Semantic Router', url: 'https://github.com/aurelio-labs/semantic-router', kind: 'github' },
  ],
  s32: [
    { label: 'Ollama Modelfile (system prompt)', url: 'https://github.com/ollama/ollama/blob/main/docs/modelfile.md', kind: 'docs' },
  ],
  s33: [
    { label: 'ChromaDB Docs', url: 'https://docs.trychroma.com/', kind: 'docs' },
    { label: 'nomic-embed-text on Ollama', url: 'https://ollama.com/library/nomic-embed-text', kind: 'docs' },
  ],
  s34: [
    { label: 'Watchdog (Python file watcher)', url: 'https://github.com/gorakhargosh/watchdog', kind: 'github' },
  ],
  s35: [
    { label: 'Ollama Modelfile Params', url: 'https://github.com/ollama/ollama/blob/main/docs/modelfile.md', kind: 'docs' },
  ],
  s35b: [
    { label: 'LangGraph (State Machine)', url: 'https://github.com/langchain-ai/langgraph', kind: 'github' },
  ],
  // Phase 8 — Home Assistant
  s36: [
    { label: 'Home Assistant Install', url: 'https://www.home-assistant.io/installation/', kind: 'docs' },
  ],
  s37: [
    { label: 'HA Ollama Integration', url: 'https://www.home-assistant.io/integrations/ollama/', kind: 'docs' },
  ],
  s38: [
    { label: 'HA Automations', url: 'https://www.home-assistant.io/docs/automation/', kind: 'docs' },
  ],
  s39: [
    { label: 'Resolume OSC Reference', url: 'https://resolume.com/support/en/osc', kind: 'docs' },
    { label: 'HA MQTT Integration', url: 'https://www.home-assistant.io/integrations/mqtt/', kind: 'docs' },
  ],
  // Phase 9 — Enclosure
  s40: [
    { label: 'BMO Models on Printables', url: 'https://www.printables.com/search/models?q=BMO+adventure+time', kind: 'guide' },
  ],
  s41: [
    { label: 'Adafruit 3D Printing Guide', url: 'https://learn.adafruit.com/adafruit-3d-printing-guide', kind: 'guide' },
  ],
  s42: [
    { label: 'Adafruit BMO Reference', url: 'https://learn.adafruit.com/mini-mac-pi/bmo-mod', kind: 'guide' },
  ],
  s43: [
    { label: 'KiCad Documentation', url: 'https://docs.kicad.org/', kind: 'docs' },
  ],
  s44: [
    { label: 'Raspberry Pi Hardware Docs', url: 'https://www.raspberrypi.com/documentation/computers/raspberry-pi.html', kind: 'docs' },
  ],
};

const IDEA_LINKS: Record<string, Link[]> = {
  i1: [
    { label: 'TextyMcSpeechy', url: 'https://github.com/domesticatedviking/TextyMcSpeechy', kind: 'github' },
    { label: 'Piper TTS Training', url: 'https://github.com/rhasspy/piper/tree/master/training', kind: 'github' },
  ],
  i2: [
    { label: 'APScheduler (Python)', url: 'https://apscheduler.readthedocs.io/', kind: 'docs' },
  ],
  i3: [
    { label: 'Ollama REST API', url: 'https://github.com/ollama/ollama/blob/main/docs/api.md', kind: 'docs' },
    { label: 'Semantic Router', url: 'https://github.com/aurelio-labs/semantic-router', kind: 'github' },
  ],
  i3b: [
    { label: 'openWakeWord Custom Models', url: 'https://github.com/dscripka/openWakeWord/blob/main/docs/custom_models.md', kind: 'docs' },
  ],
  i4: [
    { label: 'Resolume OSC Reference', url: 'https://resolume.com/support/en/osc', kind: 'docs' },
    { label: 'HA MQTT Integration', url: 'https://www.home-assistant.io/integrations/mqtt/', kind: 'docs' },
  ],
  i5: [
    { label: 'gpiozero Docs', url: 'https://gpiozero.readthedocs.io/', kind: 'docs' },
  ],
  i6: [
    { label: 'Ollama Modelfile', url: 'https://github.com/ollama/ollama/blob/main/docs/modelfile.md', kind: 'docs' },
  ],
  i7: [
    { label: 'ChromaDB Docs', url: 'https://docs.trychroma.com/', kind: 'docs' },
    { label: 'Watchdog (file watcher)', url: 'https://github.com/gorakhargosh/watchdog', kind: 'github' },
  ],
  i8: [
    { label: 'Tailscale Docs', url: 'https://tailscale.com/kb/', kind: 'docs' },
    { label: 'Ollama FAQ (remote access)', url: 'https://github.com/ollama/ollama/blob/main/docs/faq.md', kind: 'docs' },
  ],
  i9: [
    { label: 'Hailo RPi5 Issues', url: 'https://github.com/hailo-ai/hailo-rpi5-examples/issues', kind: 'github' },
  ],
  i10: [
    { label: 'V4L2 Capture (Linux)', url: 'https://www.kernel.org/doc/html/latest/userspace-api/media/v4l/capture.html', kind: 'docs' },
  ],
};

export function seed() {
  const existingParts = db.select().from(parts).all();
  if (existingParts.length >= 16) return;

  // PARTS
  db.insert(parts).values([
    { id: 1, name: 'Raspberry Pi 5 16GB', category: 'Core', price: 226.91, source: 'PiShop.us', tracking: '', status: 'ordered', eta: 'Mar 13', role: 'The brain. Quad-core ARM Cortex-A76 @ 2.4GHz. 16GB RAM gives headroom for Ollama + RAG + HA integration + face display all running simultaneously.', notes: '' },
    { id: 2, name: 'Raspberry Pi AI HAT+ 2', category: 'AI', price: 130.00, source: 'CanaKit', tracking: '', status: 'ordered', eta: 'Mar 13–14', role: 'Reflex brain. Hailo-10H NPU with 8GB onboard RAM. Handles vision tagging, fast banter, wake word logic at 2.5W. Note: mixed mode has segfault bugs in current firmware.', notes: '' },
    { id: 3, name: 'Raspberry Pi Active Cooler', category: 'Core', price: 0, source: 'PiShop.us (bundled)', tracking: '', status: 'ordered', eta: 'Mar 13', role: 'Mandatory under LLM load. Keeps the Pi 5 from throttling during sustained inference.', notes: '' },
    { id: 4, name: 'Raspberry Pi Camera Module 3', category: 'Sensors', price: 27.50, source: 'PiShop.us', tracking: '', status: 'ordered', eta: 'Mar 13', role: "BMO's eyes. 12MP, 76° FOV, autofocus. Feeds the HAT+ 2's vision pipeline.", notes: '' },
    { id: 5, name: '27W USB-C Power Supply', category: 'Core', price: 12.95, source: 'PiShop.us', tracking: '', status: 'ordered', eta: 'Mar 13', role: 'Official Pi 5 PSU. 5.1V 5A. Required — underpowered supplies cause instability under AI load.', notes: '' },
    { id: 6, name: 'Micro-HDMI to HDMI Cable', category: 'Setup', price: 7.45, source: 'PiShop.us', tracking: '', status: 'ordered', eta: 'Mar 13', role: 'Setup only. Pi 5 uses micro-HDMI. Needed for initial OS flash and debug.', notes: '' },
    { id: 7, name: 'USB-C PD PiSwitch', category: 'Setup', price: 12.95, source: 'CanaKit', tracking: '', status: 'ordered', eta: 'Mar 13–14', role: 'Inline power switch. Lets you cut/restore power without unplugging during build and debug.', notes: '' },
    { id: 8, name: 'ReSpeaker 2-Mics HAT v2.0', category: 'Audio', price: 13.99, source: 'Seeed Studio', tracking: '', status: 'ordered', eta: 'Mar 19–26', role: "BMO's ears. Dual far-field microphones, TLV320AIC3104 codec. Handles wake word detection and Whisper STT.", notes: 'Must be v2.0 — v1 has Pi 5 compatibility issues' },
    { id: 9, name: 'Mono Enclosed Speaker 4R 5W', category: 'Audio', price: 2.00, source: 'Seeed Studio', tracking: '', status: 'ordered', eta: 'Mar 19–26', role: "Beau's voice. Plugs into ReSpeaker HAT's JST 2.0 connector. 4Ω 5W.", notes: '' },
    { id: 10, name: 'Geekworm X1200 UPS HAT', category: 'Power', price: 43.00, source: 'Amazon', tracking: '', status: 'ordered', eta: 'Mar 13', role: 'Battery backup for Pi 5. 2× 18650 cells, auto power-on, safe shutdown on power loss.', notes: '' },
    { id: 11, name: 'Samsung 30Q 18650 Batteries ×2', category: 'Power', price: 21.72, source: 'Illumn', tracking: '', status: 'ordered', eta: 'TBD', role: '3000mAh flat-top 18650 cells for X1200 UPS HAT.', notes: 'Flat top only' },
    { id: 12, name: 'Freenove 5" DSI Touchscreen', category: 'Display', price: 35.95, source: 'Amazon', tracking: '', status: 'ordered', eta: 'Mar 14', role: "BMO's face. 800×480 IPS, 5-point capacitive touch, driver-free MIPI DSI.", notes: '' },
    { id: 13, name: 'Sabrent NVMe Enclosure (USB 3.2)', category: 'Storage', price: 19.99, source: 'Amazon', tracking: '', status: 'ordered', eta: 'Mar 12–13', role: 'External NVMe housing. HAT+ 2 occupies the Pi PCIe slot, so NVMe must connect via USB 3.2.', notes: 'NVMe Only variant (EC-PNVO)' },
    { id: 14, name: 'Team Group MP33 256GB NVMe', category: 'Storage', price: 67.57, source: 'Walmart', tracking: '', status: 'ordered', eta: 'TBD', role: 'Primary storage. OS, Ollama models, ChromaDB RAG, custom Piper voice model.', notes: '' },
    { id: 15, name: 'SanDisk 64GB High Endurance microSD', category: 'Storage', price: 29.42, source: 'Walmart', tracking: '', status: 'ordered', eta: 'TBD', role: 'OS boot drive. High Endurance rated for 24/7 operation.', notes: '' },
    { id: 16, name: 'SB Components GPIO Stacking Header', category: 'Hardware', price: 7.99, source: 'Amazon', tracking: '', status: 'ordered', eta: 'Mar 12–13', role: 'Extra-tall 2×20 female stacking header. Solves HAT layering so ReSpeaker stacks on AI HAT+ 2.', notes: 'Pack of 5' },
  ]).run();

  // SOFTWARE PHASES + STEPS
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
      { id: 's13', text: 'Pull reflex brain: ollama pull qwen2.5:1.5b', order: 3 },
      { id: 's14', text: 'Pull vision model: ollama pull moondream', order: 4 },
      { id: 's15', text: 'Test Ollama: curl http://localhost:11434/api/generate', order: 5 },
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
    { phase: "Phase 4.5 — Voice Training (Beau's Voice)", order: 5, steps: [
      { id: 'v1', text: 'Goal: Korean-Cajun blend voice. TextyMcSpeechy on Legion RTX 4090.', order: 1 },
      { id: 'v2', text: 'Source: KSS Korean Single Speaker + LibriSpeech Southern English subset', order: 2 },
      { id: 'v3', text: 'Train blend: ~70% Korean phoneme / 30% Louisiana rhythm', order: 3 },
      { id: 'v4', text: 'Fine-tune on 30–50 hand-recorded phrases', order: 4 },
      { id: 'v5', text: 'Export .onnx model + config.json to /mnt/bmo/voice/beau/', order: 5 },
      { id: 'v6', text: "Test: echo 'humidity holds everything' | piper --model beau.onnx | aplay", order: 6 },
    ]},
    { phase: 'Phase 5 — Wake Word', order: 6, steps: [
      { id: 's23', text: 'Install openWakeWord: pip install openwakeword', order: 1 },
      { id: 's24', text: "Train 'Hey BMO' (public) wake word", order: 2 },
      { id: 's24b', text: "Train 'Hey Beau' (private) wake word", order: 3 },
      { id: 's25', text: 'Integrate wake word → Whisper → routing dispatcher → Ollama', order: 4 },
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
      { id: 's34', text: 'Set up folder watcher to auto-index journals, VJ logs, project READMEs', order: 4 },
      { id: 's35', text: 'Build emotional state model: curious / contemplative / playful / sleepy', order: 5 },
      { id: 's35b', text: 'Implement context modes: Witness / Collaborator / Archivist / Ambient / Social', order: 6 },
    ]},
    { phase: 'Phase 8 — Home Assistant', order: 9, steps: [
      { id: 's36', text: 'Install Home Assistant on ThinkStation or separate Pi', order: 1 },
      { id: 's37', text: 'Connect BMO to HA via Ollama integration', order: 2 },
      { id: 's38', text: 'Configure BMO to greet on arrival, announce sensor states', order: 3 },
      { id: 's39', text: 'Resolume VJ integration — OSC session detection, witness mode, debrief scheduler, photography pipeline', order: 4 },
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
    const inserted = db.insert(softwarePhases).values({ phase: p.phase, order: p.order }).returning().get();
    for (const s of p.steps) {
      db.insert(softwareSteps).values({ id: s.id, phaseId: inserted.id, text: s.text, done: false, order: s.order }).run();
    }
  }

  // IDEAS
  db.insert(ideas).values([
    { id: 'i1', priority: 'high', text: "Beau's voice — Korean-Cajun blend. Musical vowels + Louisiana rhythm. TextyMcSpeechy on Legion RTX 4090.", done: false },
    { id: 'i2', priority: 'high', text: 'Proactive haiku dispatch — 1–3 haikus/day unprompted. Triggers: time of day, lux/weather, camera, end of work session, significant project moment.', done: false },
    { id: 'i3', priority: 'high', text: 'Brain routing dispatcher — reflex/vision → HAT Qwen2.5 1.5B, poetry/philosophy → Pi CPU Gemma 3 4B, heavy → ThinkStation via Tailscale.', done: false },
    { id: 'i3b', priority: 'high', text: "Dual wake word — 'Hey BMO' = public/performative. 'Hey Beau' = private/warmer. Different system prompt tone injection.", done: false },
    { id: 'i4', priority: 'medium', text: 'VJ witness mode — Resolume OSC session detection, witness mode controller, post-session debrief reflection, photo pipeline with vision captions.', done: false },
    { id: 'i5', priority: 'medium', text: 'Physical button mapping — A: cycle emotional state, B: camera look, Select: witness mode, Start: wake/text adventure.', done: false },
    { id: 'i6', priority: 'medium', text: 'Emotional state model — curious/contemplative/playful/sleepy probabilistically influences system prompt tone.', done: false },
    { id: 'i7', priority: 'medium', text: 'RAG from creative life — ChromaDB + nomic-embed-text indexes journals, VJ logs, project READMEs. Folder watcher auto-indexes.', done: false },
    { id: 'i8', priority: 'low', text: 'ThinkStation backbone — heavy queries via Tailscale to Qwen3-30B. Auto-fallback when offline.', done: false },
    { id: 'i9', priority: 'low', text: 'HAT+ 2 mixed mode — once Hailo fixes segfault bugs, enable simultaneous vision+LLM.', done: false },
    { id: 'i10', priority: 'low', text: 'Anbernic RG353V as creative video source — retro game visuals into BMO camera for VJ set material.', done: false },
  ]).run();

  console.log('[seed] Complete — 16 parts, 10 phases, 44 steps, 11 ideas');
}

export function seedLinks() {
  // Check if any steps are missing links — runs once after column is added
  const missing = db.select().from(softwareSteps).all().filter(s => s.links === '[]');
  if (missing.length > 0) {
    for (const [id, links] of Object.entries(STEP_LINKS)) {
      db.update(softwareSteps).set({ links: JSON.stringify(links) }).where(eq(softwareSteps.id, id)).run();
    }
    console.log('[seedLinks] Step links populated');
  }

  const missingIdeas = db.select().from(ideas).all().filter(i => i.links === '[]');
  if (missingIdeas.length > 0) {
    for (const [id, links] of Object.entries(IDEA_LINKS)) {
      db.update(ideas).set({ links: JSON.stringify(links) }).where(eq(ideas.id, id)).run();
    }
    console.log('[seedLinks] Idea links populated');
  }
}
