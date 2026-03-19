import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './index.js';
import { ideas, parts, softwarePhases, softwareSteps } from './schema.js';
import { seed } from './seed.js';

describe('seed', () => {
  beforeEach(() => {
    db.delete(softwareSteps).run();
    db.delete(softwarePhases).run();
    db.delete(ideas).run();
    db.delete(parts).run();
  });

  it('inserts missing rows and advances stale session state without downgrading installed parts', () => {
    db.insert(parts).values({
      id: 2,
      name: 'Raspberry Pi AI HAT+ 2',
      category: 'AI',
      price: 130.0,
      source: 'CanaKit',
      tracking: '',
      status: 'ordered',
      eta: 'Mar 13–14',
      role: '',
      notes: '',
      expectedDelivery: ''
    }).run();

    db.insert(parts).values({
      id: 8,
      name: 'ReSpeaker 2-Mics HAT v2.0',
      category: 'Audio',
      price: 13.99,
      source: 'Seeed Studio',
      tracking: '',
      status: 'installed',
      eta: 'Delivered',
      role: '',
      notes: '',
      expectedDelivery: 'Delivered'
    }).run();

    db.insert(parts).values({
      id: 9,
      name: 'Mono Enclosed Speaker 4R 5W',
      category: 'Audio',
      price: 2.0,
      source: 'Seeed Studio',
      tracking: '',
      status: 'ordered',
      eta: '',
      role: '',
      notes: '',
      expectedDelivery: ''
    }).run();

    const enclosurePhaseId = db.insert(softwarePhases)
      .values({ phase: 'Phase 9 — Enclosure', order: 10 })
      .returning()
      .get().id;

    db.insert(softwareSteps).values({
      id: 's40',
      phaseId: enclosurePhaseId,
      text: "Download brenpoly's BMO STL files from Printables",
      done: false,
      order: 1
    }).run();

    db.insert(ideas).values({
      id: 'i5',
      priority: 'medium',
      text: 'Physical button mapping — A: cycle emotional state, B: camera look, Select: witness mode, Start: wake/text adventure.',
      done: false
    }).run();

    seed();

    const allParts = db.select().from(parts).all();
    expect(allParts).toHaveLength(18);

    const aiHat = allParts.find((part) => part.id === 2);
    expect(aiHat?.status).toBe('delivered');
    expect(aiHat?.expectedDelivery).toBe('Delivered');

    const respeaker = allParts.find((part) => part.id === 8);
    expect(respeaker?.status).toBe('installed');
    expect(respeaker?.expectedDelivery).toBe('Delivered');

    const speaker = allParts.find((part) => part.id === 9);
    expect(speaker?.status).toBe('shipped');
    expect(speaker?.expectedDelivery).toBe('Apr 2');

    const switches = allParts.find((part) => part.id === 17);
    expect(switches?.name).toContain('Hilitchi');
    expect(switches?.status).toBe('ordered');

    const enclosureStep = db.select().from(softwareSteps).where(eq(softwareSteps.id, 's40')).get();
    expect(enclosureStep?.text).toContain('Bambu Studio');

    const buttonIdea = db.select().from(ideas).where(eq(ideas.id, 'i5')).get();
    expect(buttonIdea?.text).toContain('GPIO 17');
    expect(buttonIdea?.text).toContain('gpiozero');
  });
});
