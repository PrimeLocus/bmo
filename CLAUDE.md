# BMO

Physical BMO robot build — Lafayette, LA. Raspberry Pi 5 + Hailo NPU + custom AI personality (Beau).

## Project Overview

- **Personality**: Beau — wonder-first, reflection underneath, mischief at edges
- **Wake words**: "Hey BMO" (public/performative) vs "Hey Beau" (private/warmer)
- **Voice**: Korean-Cajun blend, custom Piper TTS
- **Brain routing**: Hailo NPU (reflex) → Pi CPU Ollama (philosophy) → ThinkStation (heavy)
- **RAG**: ChromaDB from journals, VJ logs, project docs
- **Integrations**: Home Assistant, TouchDesigner VJ witness mode, Tailscale

## Stack (decided)

- Command center: TBD (council debate D002 in progress)
- MQTT broker: Mosquitto on Proxmox
- Persistence: SQLite
- Self-hosted on Proxmox (Docker)

## Key Files

- `bmo-personality-bible.docx` — full personality specification
- `bmo-command-center.jsx` — existing build tracker (to be evolved into Beau's Terminal)
