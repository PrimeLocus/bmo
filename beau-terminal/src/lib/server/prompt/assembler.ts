import type { SectionName } from './sections.js';
import type { Mode } from '../mqtt/topics.js';
import { INJECTION_POLICY, PLACEHOLDER_FALLBACKS } from './policies.js';

/**
 * Parse a prompt file into named sections.
 * Sections are delimited by <!-- SECTION: NAME --> markers.
 */
export function parseSections(promptText: string): Partial<Record<SectionName, string>> {
  const sections: Partial<Record<SectionName, string>> = {};
  const marker = /<!--\s*SECTION:\s*(\w+)\s*-->/g;
  let match: RegExpExecArray | null;
  const markers: { name: string; contentStart: number; markerStart: number }[] = [];

  while ((match = marker.exec(promptText)) !== null) {
    markers.push({
      name: match[1],
      contentStart: match.index + match[0].length,
      markerStart: match.index,
    });
  }

  for (let i = 0; i < markers.length; i++) {
    const start = markers[i].contentStart;
    const end = i + 1 < markers.length ? markers[i + 1].markerStart : promptText.length;
    const content = promptText.slice(start, end).trim();
    sections[markers[i].name as SectionName] = content;
  }

  return sections;
}

/**
 * Replace {{PLACEHOLDER}} tokens with provided values or fallbacks.
 * Lines that contained placeholders and become whitespace-only after substitution are removed.
 * Intentional blank lines (no placeholders) are preserved.
 */
export function substitutePlaceholders(
  text: string,
  values: Record<string, string>,
): string {
  const placeholderPattern = /\{\{(\w+)\}\}/g;

  return text
    .split('\n')
    .filter((line) => {
      if (!placeholderPattern.test(line)) return true;
      placeholderPattern.lastIndex = 0;
      const substituted = line.replace(placeholderPattern, (_, key: string) =>
        values[key] ?? PLACEHOLDER_FALLBACKS[key] ?? ''
      );
      return substituted.trim() !== '';
    })
    .map((line) =>
      line.replace(placeholderPattern, (_, key: string) =>
        values[key] ?? PLACEHOLDER_FALLBACKS[key] ?? ''
      )
    )
    .join('\n');
}

/**
 * Assemble a complete prompt for a given mode.
 * Reads section markers, applies injection policy, substitutes placeholders.
 */
export function assemblePrompt(
  promptText: string,
  mode: Mode,
  values: Record<string, string>,
): string {
  const sections = parseSections(promptText);
  const parts: string[] = [];

  for (const [name, content] of Object.entries(sections)) {
    const sectionName = name as SectionName;
    const policy = INJECTION_POLICY[sectionName];
    if (!policy) continue;

    const level = policy[mode];
    if (level === 'omit') continue;

    parts.push(substitutePlaceholders(content, values));
  }

  return parts.join('\n\n---\n\n');
}

/**
 * Build a stripped reflex-tier prompt.
 * Only: CORE_IDENTITY (paragraph 1), VOICE_RULES, CONTEXT, MODE_PROTOCOL (current mode).
 */
export function buildReflexPrompt(
  promptText: string,
  mode: Mode,
  values: Record<string, string>,
): string {
  const sections = parseSections(promptText);
  const parts: string[] = [];

  if (sections.CORE_IDENTITY) {
    const firstPara = sections.CORE_IDENTITY.split('\n\n')[0];
    parts.push(substitutePlaceholders(firstPara, values));
  }

  if (sections.VOICE_RULES) {
    parts.push(substitutePlaceholders(sections.VOICE_RULES, values));
  }

  if (sections.CONTEXT) {
    parts.push(substitutePlaceholders(sections.CONTEXT, values));
  }

  if (sections.MODE_PROTOCOL) {
    const modeLines = sections.MODE_PROTOCOL.split('\n');
    const currentModeLine = modeLines.find((l) =>
      l.toLowerCase().startsWith(mode.toLowerCase() + ':') ||
      l.toLowerCase().startsWith(mode.toLowerCase() + ' :')
    );
    if (currentModeLine) {
      parts.push(currentModeLine.trim());
    }
  }

  return parts.join('\n\n');
}
