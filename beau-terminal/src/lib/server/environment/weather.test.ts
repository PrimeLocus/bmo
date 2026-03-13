import { describe, it, expect } from 'vitest';
import { parseWeatherResponse, getSeasonalContext, formatWeatherSummary } from './weather.js';

describe('parseWeatherResponse', () => {
  it('extracts condition, temp, humidity, pressure from OWM response', () => {
    const owmResponse = {
      weather: [{ main: 'Rain', description: 'light rain' }],
      main: { temp: 289.5, humidity: 82, pressure: 1013 },
    };
    const result = parseWeatherResponse(owmResponse);
    expect(result).toEqual({
      condition: 'light rain',
      tempC: expect.closeTo(16.35, 1),
      humidity: 82,
      pressureHpa: 1013,
    });
  });

  it('returns null for malformed response', () => {
    expect(parseWeatherResponse({})).toBeNull();
    expect(parseWeatherResponse({ weather: [] })).toBeNull();
  });
});

describe('getSeasonalContext', () => {
  it('returns crawfish season for February in Lafayette', () => {
    const result = getSeasonalContext(new Date('2026-02-15'));
    expect(result).toContain('crawfish season');
  });

  it('returns august heat for August', () => {
    const result = getSeasonalContext(new Date('2026-08-10'));
    expect(result).toContain('August heat');
  });

  it('returns late October for October', () => {
    const result = getSeasonalContext(new Date('2026-10-25'));
    expect(result).toContain('October');
  });
});

describe('formatWeatherSummary', () => {
  it('formats weather data into a concise string', () => {
    const result = formatWeatherSummary({
      condition: 'overcast clouds',
      tempC: 18.5,
      humidity: 75,
      pressureHpa: 1015,
    });
    expect(result).toBe('overcast clouds, 65°F');
  });
});
