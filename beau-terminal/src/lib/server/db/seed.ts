import { db } from './index.js';
import { parts, softwarePhases, softwareSteps, ideas, integrations } from './schema.js';
import { llmModelVariants } from '../training/schema.js';
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

type PartRow = typeof parts.$inferSelect;
type PartSeed = typeof parts.$inferInsert;
type IdeaSeed = typeof ideas.$inferInsert;

const PART_SEEDS: PartSeed[] = [
  { id: 1, name: 'Raspberry Pi 5 16GB', category: 'Core', price: 226.91, source: 'PiShop.us', tracking: '', status: 'delivered', eta: 'Delivered', role: 'The brain. Quad-core ARM Cortex-A76 @ 2.4GHz. 16GB RAM gives headroom for Ollama + RAG + HA integration + face display all running simultaneously.', notes: '', expectedDelivery: 'Delivered' },
  { id: 2, name: 'Raspberry Pi AI HAT+ 2', category: 'AI', price: 130.00, source: 'CanaKit', tracking: '', status: 'delivered', eta: 'Delivered', role: 'Reflex brain. Hailo-10H NPU with 8GB onboard RAM. Handles vision tagging, fast banter, wake word logic at 2.5W. Note: mixed mode has segfault bugs in current firmware.', notes: '', expectedDelivery: 'Delivered' },
  { id: 3, name: 'Raspberry Pi Active Cooler', category: 'Core', price: 0, source: 'PiShop.us (bundled)', tracking: '', status: 'delivered', eta: 'Delivered', role: 'Mandatory under LLM load. Keeps the Pi 5 from throttling during sustained inference.', notes: '', expectedDelivery: 'Delivered' },
  { id: 4, name: 'Raspberry Pi Camera Module 3', category: 'Sensors', price: 27.50, source: 'PiShop.us', tracking: '', status: 'delivered', eta: 'Delivered', role: "BMO's eyes. 12MP, 76° FOV, autofocus. Feeds the HAT+ 2's vision pipeline.", notes: '', expectedDelivery: 'Delivered' },
  { id: 5, name: '27W USB-C Power Supply', category: 'Core', price: 12.95, source: 'PiShop.us', tracking: '', status: 'delivered', eta: 'Delivered', role: 'Official Pi 5 PSU. 5.1V 5A. Required — underpowered supplies cause instability under AI load.', notes: '', expectedDelivery: 'Delivered' },
  { id: 6, name: 'Micro-HDMI to HDMI Cable', category: 'Setup', price: 7.45, source: 'PiShop.us', tracking: '', status: 'delivered', eta: 'Delivered', role: 'Setup only. Pi 5 uses micro-HDMI. Needed for initial OS flash and debug.', notes: '', expectedDelivery: 'Delivered' },
  { id: 7, name: 'USB-C PD PiSwitch', category: 'Setup', price: 12.95, source: 'CanaKit', tracking: '', status: 'delivered', eta: 'Delivered', role: 'Inline power switch. Lets you cut/restore power without unplugging during build and debug.', notes: '', expectedDelivery: 'Delivered' },
  { id: 8, name: 'ReSpeaker 2-Mics HAT v2.0', category: 'Audio', price: 13.99, source: 'Seeed Studio', tracking: '', status: 'shipped', eta: 'Apr 2', role: "BMO's ears. Dual far-field microphones, TLV320AIC3104 codec. Handles wake word detection and Whisper STT.", notes: 'Must be v2.0 — v1 has Pi 5 compatibility issues', expectedDelivery: 'Apr 2' },
  { id: 9, name: 'Mono Enclosed Speaker 4R 5W', category: 'Audio', price: 2.00, source: 'Seeed Studio', tracking: '', status: 'shipped', eta: 'Apr 2', role: "Beau's voice. Plugs into ReSpeaker HAT's JST 2.0 connector. 4Ω 5W.", notes: '', expectedDelivery: 'Apr 2' },
  { id: 10, name: 'Geekworm X1200 UPS HAT', category: 'Power', price: 43.00, source: 'Amazon', tracking: '', status: 'delivered', eta: 'Delivered', role: 'Battery backup for Pi 5. 2× 18650 cells, auto power-on, safe shutdown on power loss.', notes: '', expectedDelivery: 'Delivered' },
  { id: 11, name: 'Samsung 30Q 18650 Batteries ×2', category: 'Power', price: 21.72, source: 'Illumn', tracking: '', status: 'delivered', eta: 'Delivered', role: '3000mAh flat-top 18650 cells for X1200 UPS HAT.', notes: 'Flat top only', expectedDelivery: 'Delivered' },
  { id: 12, name: 'Freenove 5" DSI Touchscreen', category: 'Display', price: 35.95, source: 'Amazon', tracking: '', status: 'delivered', eta: 'Delivered', role: "BMO's face. 800×480 IPS, 5-point capacitive touch, driver-free MIPI DSI.", notes: '', expectedDelivery: 'Delivered' },
  { id: 13, name: 'Sabrent NVMe Enclosure (USB 3.2)', category: 'Storage', price: 19.99, source: 'Amazon', tracking: '', status: 'delivered', eta: 'Delivered', role: 'External NVMe housing. HAT+ 2 occupies the Pi PCIe slot, so NVMe must connect via USB 3.2.', notes: 'NVMe Only variant (EC-PNVO)', expectedDelivery: 'Delivered' },
  { id: 14, name: 'Team Group MP33 256GB NVMe', category: 'Storage', price: 67.57, source: 'Walmart', tracking: '', status: 'delivered', eta: 'Delivered', role: 'Primary storage. OS, Ollama models, ChromaDB RAG, custom Piper voice model.', notes: '', expectedDelivery: 'Delivered' },
  { id: 15, name: 'SanDisk 64GB High Endurance microSD', category: 'Storage', price: 29.42, source: 'Walmart', tracking: '', status: 'delivered', eta: 'Delivered', role: 'OS boot drive. High Endurance rated for 24/7 operation.', notes: '', expectedDelivery: 'Delivered' },
  { id: 16, name: 'SB Components GPIO Stacking Header', category: 'Hardware', price: 7.99, source: 'Amazon', tracking: '', status: 'delivered', eta: 'Delivered', role: 'Extra-tall 2×20 female stacking header. Solves HAT layering so ReSpeaker stacks on AI HAT+ 2.', notes: 'Pack of 5', expectedDelivery: 'Delivered' },
  { id: 17, name: 'Hilitchi 6x6mm Tactile Switch Assortment (200-pack)', category: 'Hardware', price: 9.99, source: 'Amazon', tracking: '', status: 'ordered', eta: '', role: 'Front-panel input hardware for button prototyping. 10 switch heights from 4.3mm to 13mm.', notes: 'v1 button perfboard prototype supply', expectedDelivery: '' },
  { id: 18, name: 'TRYMAG 5x2mm Neodymium Disc Magnets (200-pack)', category: 'Hardware', price: 7.99, source: 'Amazon', tracking: '', status: 'ordered', eta: '', role: 'Retention and alignment magnets for enclosure panels and button module experiments.', notes: '200-pack', expectedDelivery: '' },
  { id: 19, name: 'Jetson Orin Nano Super 8GB', category: 'AI', price: 249.00, source: 'NVIDIA', tracking: '', status: 'waiting', eta: '', role: 'Tier 3 working-mind brain. 67 TOPS INT8, 8GB LPDDR5. Runs Llama 3.1 8B for mid-weight reasoning. Connected via Tailscale.', notes: 'Replaces ThinkStation as T3', expectedDelivery: '' },
  { id: 20, name: 'WS2812B LED Ring (16 pixels)', category: 'Lighting', price: 8.95, source: 'Amazon', tracking: '', status: 'waiting', eta: '', role: 'Addressable RGB LED ring for mood lighting. Maps to personality vector — wonder=teal, reflection=blue, mischief=gold. Bible §50 glow colors.', notes: '', expectedDelivery: '' },
  { id: 21, name: 'Momentary Push Buttons ×4', category: 'Hardware', price: 3.99, source: 'Amazon', tracking: '', status: 'waiting', eta: '', role: 'Front-panel A/B/Select/Start buttons. GPIO 17/27/22/23. Clear of ReSpeaker v2.0 pins. gpiozero pull-ups.', notes: 'For perfboard v1 prototype', expectedDelivery: '' },
];

const PHASE_DATA = [
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
    { id: 's16', text: 'Stack ReSpeaker HAT v2.0 on GPIO stacking header', order: 1, requiredPartIds: [8] },
    { id: 's17', text: 'Build DTS overlay for seeed-2mic-voicecard', order: 2, requiredPartIds: [8] },
    { id: 's18', text: 'Add dtoverlay to /boot/firmware/config.txt, reboot', order: 3, requiredPartIds: [8] },
    { id: 's19', text: 'Verify: arecord -l (should show seeed-2mic-voicecard)', order: 4, requiredPartIds: [8] },
    { id: 's20', text: 'Install Piper TTS: pip install piper-tts', order: 5 },
    { id: 's21', text: 'Install Whisper STT: pip install openai-whisper', order: 6 },
    { id: 's22', text: 'Test full audio loop: speak → Whisper → Ollama → Piper → speaker', order: 7, requiredPartIds: [8, 9] },
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
    { id: 's25', text: 'Integrate wake word → Whisper → routing dispatcher → Ollama', order: 4, requiredPartIds: [8] },
  ]},
  { phase: 'Phase 6 — Face Display', order: 7, steps: [
    { id: 's26', text: 'Configure Freenove DSI display in /boot/firmware/config.txt', order: 1, requiredPartIds: [12] },
    { id: 's27', text: 'Install pygame: pip install pygame', order: 2 },
    { id: 's28', text: 'Clone brenpoly/be-more-agent for reference face animation code', order: 3 },
    { id: 's29', text: 'Build BMO face states: idle / listening / thinking / speaking / delighted', order: 4, requiredPartIds: [12] },
    { id: 's30', text: 'Sync mouth animation to Piper TTS audio waveform output', order: 5, requiredPartIds: [8, 9, 12] },
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
    { id: 's40', text: "Use Bren's Printables STLs as reference and verify interior cavity in Bambu Studio before printing", order: 1 },
    { id: 's41', text: 'Print body in teal PLA/PETG, sand and prime', order: 2 },
    { id: 's42', text: 'Paint BMO teal — reference Adventure Time Art of Ooo for color match', order: 3 },
    { id: 's43', text: 'Prototype v1 front buttons on perfboard; defer custom KiCad PCB until enclosure fit is confirmed', order: 4 },
    { id: 's44', text: 'Final assembly: mount Pi stack, route cables, install face display', order: 5 },
  ]},
  // Bible Alignment — Terminal Software (SP1–SP4)
  { phase: 'Phase 10 — Personality Engine (SP1)', order: 11, steps: [
    { id: 'sp1a', text: 'Two-layer momentum model — signal EMA (α 0.08–0.25) + momentum EMA (α 0.002), 60/40 blend', order: 1, done: true },
    { id: 'sp1b', text: '21 signal rules (15 environmental + 6 activity) — sensor-to-dimension mapping for wonder/reflection/mischief', order: 2, done: true },
    { id: 'sp1c', text: 'Mode classifier — 5 centroids (ambient/witness/collaborator/archivist/social), Euclidean distance, 3-tick hysteresis', order: 3, done: true },
    { id: 'sp1d', text: 'Contextual interpreter — phrase-pool sentence builder, deterministic, weather/time/activity aware', order: 4, done: true },
    { id: 'sp1e', text: 'Tiered snapshot retention (hot 1h / warm 24h / cool 7d / cold 30d) + DB backup every 6h + JSON export', order: 5, done: true },
    { id: 'sp1f', text: 'BeauState integration — bmo:personality CustomEvent, MQTT publish to beau/personality/*, emotionalState backward compat', order: 6, done: true },
  ]},
  { phase: 'Phase 11 — Face States & Expression (SP2)', order: 12, steps: [
    { id: 'sp2a', text: 'Pixel-art SVG face rewrite — 10 canon states from bible §49 (idle, listening, thinking, speaking, delighted, witness, sleepy, unamused, mischievous, protective)', order: 1, done: true },
    { id: 'sp2b', text: 'Frame coordinate data (FaceRect arrays) for all 10 states with per-state timing and animation config', order: 2, done: true },
    { id: 'sp2c', text: 'Face state priority stack resolver — interaction signals > sleep/mode > personality vector > idle', order: 3, done: true },
    { id: 'sp2d', text: 'LED glow borders per bible §50 — per-state color + animation (teal, blue-teal, amber, yellow-green, etc.)', order: 4, done: true },
    { id: 'sp2e', text: 'MQTT interaction signal topics (voice/listening, voice/speaking, voice/thinking, security/stranger) + blink transitions (240ms)', order: 5, done: true },
  ]},
  { phase: 'Phase 12 — Personality Widgets (SP3)', order: 13, steps: [
    { id: 'sp3a', text: 'InnerWeatherWidget — ambient interpretation display + mode indicator + whisper bars', order: 1, done: true },
    { id: 'sp3b', text: 'VectorGaugeWidget — horizontal bars with signal/momentum layer toggle for diagnostic view', order: 2, done: true },
    { id: 'sp3c', text: 'SignalSourcesWidget — active rules list + per-dimension delta contributions', order: 3, done: true },
    { id: 'sp3d', text: 'PersonalityTimelineWidget — SVG area chart with ambient/detail toggle, mode bands, hover, 500-row cap', order: 4, done: true },
    { id: 'sp3e', text: "Client-safe rule-meta.ts (21 rules) + SVG scale utilities + 'Beau\\'s Mind' page template", order: 5, done: true },
  ]},
  { phase: 'Phase 13 — Pending Thoughts & Haiku Dispatch (SP4)', order: 14, steps: [
    { id: 'sp4a', text: 'Pressure accumulation engine — vector magnitude + time silence + novelty spikes + random novelty (4%)', order: 1, done: true },
    { id: 'sp4b', text: 'Three thought types with decay windows — observation (2–4h), reaction (8–12h), haiku (24h)', order: 2, done: true },
    { id: 'sp4c', text: 'Priority queue — max 5 pending, single ready slot, 30s generation timeout, daily budget (3 haiku + 5 total)', order: 3, done: true },
    { id: 'sp4d', text: 'MQTT round-trip generation — terminal publishes request → standalone Ollama listener generates → publishes result', order: 4, done: true },
    { id: 'sp4e', text: 'Glow overlay system (independent of face state, 3 styles) + BmoFace click-to-surface + toast notifications', order: 5, done: true },
    { id: 'sp4f', text: 'PendingThoughtsWidget diagnostic — pressure bar, active queue, daily counts, surfaced/decayed history', order: 6, done: true },
  ]},
  { phase: 'Phase 14 — Brain Dispatcher (SP6)', order: 15, steps: [
    { id: 'sp6t1', text: 'Types — BrainRequestV1, BrainResponse, TierConfig interfaces + health status enums', order: 1, done: true },
    { id: 'sp6t2', text: 'TierRegistry — config loader, tier availability probing (HTTP GET /health endpoints)', order: 2, done: true },
    { id: 'sp6t3', text: 'Router — voice caster (mood → model), context scaler (token budget), precedence arbiter (quality vs latency)', order: 3, done: true },
    { id: 'sp6t4', text: 'Prepare — thought request + manual prompt assembly (template expansion, RAG fragment trimming, mode injection)', order: 4, done: true },
    { id: 'sp6t5', text: 'Executor — HTTP tier calls, fallback chain, escalation logic, quality gate enforcement', order: 5, done: true },
    { id: 'sp6t6', text: 'Dispatch logging + schema migration (14 new columns: requestId, parentRequestId, kind, status, voicePreferred, thoughtFloor, contextFloor, highestAvailable, clamped, trimmed, fallbackFrom, qualityEscalatedFrom)', order: 6, done: true },
    { id: 'sp6t7', text: 'MQTT topics update — add beau/brain/dispatch and beau/brain/availability', order: 7, done: true },
    { id: 'sp6t8', text: 'Public dispatch() API (sync wrapper, 10s timeout, quality/latency tuning)', order: 8, done: true },
    { id: 'sp6t9', text: 'ThoughtDispatcher refactor — integrate BrainRouter, context scaler, quality gates', order: 9, done: true },
    { id: 'sp6t10', text: 'Bridge integration — health probing background task, tier availability broadcast, prompt assembly wiring', order: 10, done: true },
    { id: 'sp6t11', text: 'Prompt Console integration — routing reason display, tier clamping explanations, fallback chain visibility', order: 11, done: true },
  ]},
  // Hardware — Jetson Inference Backbone
  { phase: 'Phase 15 — Jetson Inference Backbone', order: 16, steps: [
    { id: 'j1', text: 'Flash JetPack 6 to Jetson Orin Nano Super, verify CUDA + cuDNN', order: 1, requiredPartIds: [19] },
    { id: 'j2', text: 'Install Ollama on Jetson, pull llama3.1:8b', order: 2, requiredPartIds: [19] },
    { id: 'j3', text: 'Configure Tailscale on Jetson, verify reachability from Pi', order: 3, requiredPartIds: [19] },
    { id: 'j4', text: 'Update TierRegistry: T3 endpoint → Jetson Ollama URL via Tailscale', order: 4, requiredPartIds: [19] },
    { id: 'j5', text: 'End-to-end test: thought dispatch routes to Jetson T3, falls back to T2 on timeout', order: 5, requiredPartIds: [19] },
  ]},
  // Hardware — LED Mood Lighting
  { phase: 'Phase 16 — LED Mood Lighting', order: 17, steps: [
    { id: 'l1', text: 'Wire WS2812B ring to Pi GPIO 18 (PWM), test with rpi_ws281x library', order: 1, requiredPartIds: [20] },
    { id: 'l2', text: 'Build LED controller service: personality vector → color mapping (wonder=teal, reflection=blue, mischief=gold)', order: 2, requiredPartIds: [20] },
    { id: 'l3', text: 'Wire MQTT subscription: beau/personality/vector → LED color updates', order: 3, requiredPartIds: [20] },
    { id: 'l4', text: 'Implement face-state glow sync: LED ring mirrors BmoFace glow border colors (bible §50)', order: 4, requiredPartIds: [20] },
    { id: 'l5', text: 'Add thought overlay glow: steady/pulse/rhythm LED patterns by thought type', order: 5, requiredPartIds: [20] },
  ]},
  // Hardware — Physical Controls
  { phase: 'Phase 17 — Physical Controls', order: 18, steps: [
    { id: 'b1', text: 'Wire 4 buttons to GPIO 17/27/22/23 with pull-ups, test with gpiozero', order: 1, requiredPartIds: [21] },
    { id: 'b2', text: 'Map button actions: A=cycle personality, B=room survey, Select=witness toggle, Start=wake/text-adventure', order: 2, requiredPartIds: [21] },
    { id: 'b3', text: 'Publish button presses to MQTT beau/buttons/{a,b,select,start} topics', order: 3, requiredPartIds: [21] },
  ]},
] as const;

const IDEA_SEEDS: IdeaSeed[] = [
  { id: 'i1', priority: 'high', text: "Beau's voice — Korean-Cajun blend. Musical vowels + Louisiana rhythm. TextyMcSpeechy on Legion RTX 4090.", done: false },
  { id: 'i2', priority: 'high', text: 'Proactive haiku dispatch — 1–3 haikus/day unprompted. Triggers: time of day, lux/weather, camera, end of work session, significant project moment.', done: true },
  { id: 'i3', priority: 'high', text: 'Brain routing dispatcher — reflex/vision → HAT Qwen2.5 1.5B, poetry/philosophy → Pi CPU Gemma 3 4B, heavy → ThinkStation via Tailscale.', done: false },
  { id: 'i3b', priority: 'high', text: "Dual wake word — 'Hey BMO' = public/performative. 'Hey Beau' = private/warmer. Different system prompt tone injection.", done: false },
  { id: 'i4', priority: 'medium', text: 'VJ witness mode — Resolume OSC session detection, witness mode controller, post-session debrief reflection, photo pipeline with vision captions.', done: false },
  { id: 'i5', priority: 'medium', text: 'Physical button mapping — A/GPIO 17: cycle emotion, B/GPIO 27: room survey, Select/GPIO 22: witness mode, Start/GPIO 23: wake/text adventure. Clear of ReSpeaker v2.0; gpiozero pull-ups.', done: false },
  { id: 'i6', priority: 'medium', text: 'Personality vector model — wonder/reflection/mischief 3D vector with two-layer EMA momentum. Replaces simple emotional states. Drives mode classification, face state, and prompt tone.', done: true },
  { id: 'i7', priority: 'medium', text: 'RAG from creative + reflective life — ChromaDB + nomic-embed-text indexes journals, VJ logs, noticings, project READMEs. Folder watcher auto-indexes.', done: false },
  { id: 'i8', priority: 'low', text: 'ThinkStation backbone — heavy queries via Tailscale to Qwen3-30B. Auto-fallback when offline.', done: false },
  { id: 'i9', priority: 'low', text: 'HAT+ 2 mixed mode — once Hailo fixes segfault bugs, enable simultaneous vision+LLM.', done: false },
  { id: 'i10', priority: 'low', text: 'Anbernic RG353V as creative video source — retro game visuals into BMO camera for VJ set material.', done: false },
];

const TOTAL_STEPS = PHASE_DATA.reduce((sum, phase) => sum + phase.steps.length, 0);

function shouldAdvancePartStatus(currentStatus: string, desiredStatus: string) {
  if (currentStatus === desiredStatus) return false;
  if (currentStatus === 'ordered' && (desiredStatus === 'shipped' || desiredStatus === 'delivered' || desiredStatus === 'installed')) return true;
  if (currentStatus === 'shipped' && (desiredStatus === 'delivered' || desiredStatus === 'installed')) return true;
  if (currentStatus === 'delivered' && desiredStatus === 'installed') return true;
  return false;
}

function buildPartSyncPatch(existing: PartRow, desired: PartSeed): Partial<PartSeed> | null {
  const patch: Partial<PartSeed> = {};

  if (shouldAdvancePartStatus(existing.status, desired.status ?? 'ordered')) {
    patch.status = desired.status;
    patch.eta = desired.eta;
    patch.expectedDelivery = desired.expectedDelivery;
  }

  const wantsDeliveredMarker = desired.expectedDelivery === 'Delivered' &&
    (existing.status === 'delivered' || existing.status === 'installed');
  if (wantsDeliveredMarker) {
    if (!existing.expectedDelivery) patch.expectedDelivery = 'Delivered';
    if (!existing.eta) patch.eta = desired.eta;
  }

  if (existing.status === 'shipped' && desired.status === 'shipped') {
    if (desired.expectedDelivery && !existing.expectedDelivery) {
      patch.expectedDelivery = desired.expectedDelivery;
    }
    if (desired.eta && !existing.eta) {
      patch.eta = desired.eta;
    }
  }

  return Object.keys(patch).length ? patch : null;
}

function syncParts() {
  const existingParts = new Map(db.select().from(parts).all().map((part) => [part.id, part]));
  let inserted = 0;
  let updated = 0;

  for (const part of PART_SEEDS) {
    const existing = existingParts.get(part.id ?? -1);
    if (!existing) {
      db.insert(parts).values(part).run();
      inserted++;
      continue;
    }

    const patch = buildPartSyncPatch(existing, part);
    if (!patch) continue;

    db.update(parts).set(patch).where(eq(parts.id, existing.id)).run();
    updated++;
  }

  return { inserted, updated };
}

function syncSoftware() {
  const existingPhases = db.select().from(softwarePhases).all();
  const phaseIds = new Map(existingPhases.map((phase) => [phase.phase, phase.id]));
  let insertedPhases = 0;
  let insertedSteps = 0;
  let updatedSteps = 0;

  for (const phase of PHASE_DATA) {
    let phaseId = phaseIds.get(phase.phase);
    if (phaseId === undefined) {
      phaseId = db.insert(softwarePhases)
        .values({ phase: phase.phase, order: phase.order })
        .returning()
        .get().id;
      phaseIds.set(phase.phase, phaseId);
      insertedPhases++;
    }

    const resolvedPhaseId = phaseId;
    for (const step of phase.steps) {
      const seedDone = 'done' in step ? (step as { done: boolean }).done : false;
      const seedReqParts = 'requiredPartIds' in step
        ? JSON.stringify((step as { requiredPartIds: number[] }).requiredPartIds)
        : '[]';
      const existingStep = db.select().from(softwareSteps).where(eq(softwareSteps.id, step.id)).get();
      if (!existingStep) {
        db.insert(softwareSteps)
          .values({ id: step.id, phaseId: resolvedPhaseId, text: step.text, done: seedDone, order: step.order, requiredPartIds: seedReqParts })
          .run();
        insertedSteps++;
        continue;
      }

      // Advance done status (true→false never happens), update text/order/phase/requiredPartIds if changed
      const shouldAdvanceDone = seedDone && !existingStep.done;
      const existingReqParts = existingStep.requiredPartIds ?? '[]';
      const needsUpdate = existingStep.phaseId !== resolvedPhaseId ||
        existingStep.text !== step.text ||
        existingStep.order !== step.order ||
        existingReqParts !== seedReqParts ||
        shouldAdvanceDone;

      if (!needsUpdate) continue;

      const patch: Record<string, unknown> = { phaseId: resolvedPhaseId, text: step.text, order: step.order, requiredPartIds: seedReqParts };
      if (shouldAdvanceDone) patch.done = true;

      db.update(softwareSteps)
        .set(patch)
        .where(eq(softwareSteps.id, step.id))
        .run();
      updatedSteps++;
    }
  }

  return { insertedPhases, insertedSteps, updatedSteps };
}

function syncIdeas() {
  const existingIdeas = new Map(db.select().from(ideas).all().map((idea) => [idea.id, idea]));
  let inserted = 0;
  let updated = 0;

  for (const idea of IDEA_SEEDS) {
    const existing = existingIdeas.get(idea.id ?? '');
    if (!existing) {
      db.insert(ideas).values(idea).run();
      inserted++;
      continue;
    }

    // Advance done status (true→false never happens)
    const shouldAdvanceDone = idea.done && !existing.done;
    const textOrPriorityChanged = existing.priority !== idea.priority || existing.text !== idea.text;

    if (!textOrPriorityChanged && !shouldAdvanceDone) continue;

    const patch: Record<string, unknown> = { priority: idea.priority, text: idea.text };
    if (shouldAdvanceDone) patch.done = true;

    db.update(ideas)
      .set(patch)
      .where(eq(ideas.id, existing.id))
      .run();
    updated++;
  }

  return { inserted, updated };
}

export function seed() {
  const partStats = syncParts();
  const softwareStats = syncSoftware();
  const ideaStats = syncIdeas();
  seedLlmVariants();
  const appliedChanges = partStats.inserted + partStats.updated + softwareStats.insertedPhases +
    softwareStats.insertedSteps + softwareStats.updatedSteps + ideaStats.inserted + ideaStats.updated;

  console.log(
    `[seed] Synced — ${PART_SEEDS.length} parts, ${PHASE_DATA.length} phases, ${TOTAL_STEPS} steps, ${IDEA_SEEDS.length} ideas` +
    (appliedChanges ? ` (${appliedChanges} changes applied)` : '')
  );
}

/** Additive seed for LLM model variants — inserts missing base-model rows for all 4 tiers. */
export function seedLlmVariants() {
  const llmVariantSeeds = [
    { displayName: 'Qwen 2.5 1.5B (T1 base)', family: 'qwen2.5', baseModel: 'qwen2.5:1.5b', trainingMethod: 'base', runtime: 'ollama', tier: 't1', status: 'active' },
    { displayName: 'Gemma 3 4B (T2 base)', family: 'gemma3', baseModel: 'gemma3:4b', trainingMethod: 'base', runtime: 'ollama', tier: 't2', status: 'active' },
    { displayName: 'Llama 3.1 8B (T3 base)', family: 'llama3.1', baseModel: 'llama3.1:8b', trainingMethod: 'base', runtime: 'ollama', tier: 't3', status: 'active' },
    { displayName: 'Qwen 3 30B (T4 base)', family: 'qwen3', baseModel: 'qwen3:30b', trainingMethod: 'base', runtime: 'ollama', tier: 't4', status: 'active' },
  ] as const;

  const existing = db.select().from(llmModelVariants).all();
  const existingBaseModels = new Set(existing.map(v => v.baseModel));
  let inserted = 0;

  for (const variant of llmVariantSeeds) {
    if (existingBaseModels.has(variant.baseModel)) continue;
    db.insert(llmModelVariants).values(variant).run();
    inserted++;
  }

  if (inserted > 0) {
    console.log(`[seedLlmVariants] Inserted ${inserted} LLM model variant(s)`);
  }
}

export function seedIntegrations() {
  const existing = db.select().from(integrations).all();
  if (existing.length > 0) return;

  const seeds = [
    { name: 'MQTT (Mosquitto)', icon: '📡', type: 'mqtt', endpoint: 'mqtt://localhost:1883', healthCheck: 'mqtt-ping', sortOrder: 0 },
    { name: 'Home Assistant', icon: '🏠', type: 'api', endpoint: 'http://homeassistant.local:8123', healthCheck: 'http-get', sortOrder: 1 },
    { name: 'Resolume Arena', icon: '🎛', type: 'osc', endpoint: 'osc://localhost:7000', healthCheck: 'none', sortOrder: 2 },
    { name: 'Tailscale', icon: '🌐', type: 'custom', endpoint: null, healthCheck: 'none', notes: 'Auto-detected via tailscale status', sortOrder: 3 },
    { name: 'Ollama (Pi)', icon: '🧠', type: 'api', endpoint: 'http://localhost:11434', healthCheck: 'http-get', sortOrder: 4 },
    { name: 'Ollama (ThinkStation)', icon: '🧠', type: 'api', endpoint: 'http://thinkstation:11434', healthCheck: 'http-get', sortOrder: 5 },
    { name: 'ChromaDB', icon: '🔍', type: 'api', endpoint: 'http://localhost:8000', healthCheck: 'http-get', sortOrder: 6 },
    { name: 'Piper TTS', icon: '🗣', type: 'pipe', endpoint: 'pipe:///usr/bin/piper', healthCheck: 'none', sortOrder: 7 },
    { name: 'Hailo NPU', icon: '⚡', type: 'hardware', endpoint: '/dev/hailo0', healthCheck: 'none', sortOrder: 8 },
  ];

  for (const seed of seeds) {
    db.insert(integrations).values(seed).run();
  }

  console.log('[seedIntegrations] 9 integrations seeded');
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
