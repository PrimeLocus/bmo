export type WeatherData = {
  condition: string;
  tempC: number;
  humidity: number;
  pressureHpa: number;
};

export function parseWeatherResponse(data: Record<string, unknown>): WeatherData | null {
  try {
    const weather = data.weather as { main: string; description: string }[] | undefined;
    const main = data.main as { temp: number; humidity: number; pressure: number } | undefined;
    if (!weather?.length || !main) return null;
    return {
      condition: weather[0].description,
      tempC: main.temp - 273.15,
      humidity: main.humidity,
      pressureHpa: main.pressure,
    };
  } catch {
    return null;
  }
}

export function formatWeatherSummary(weather: WeatherData): string {
  const tempF = Math.round(weather.tempC * 9 / 5 + 32);
  return `${weather.condition}, ${tempF}°F`;
}

// Lafayette, LA seasonal context — grounded in Beau's personality bible
const SEASONAL_MAP: [number[], string][] = [
  [[1, 2, 3, 4, 5, 6], 'crawfish season'],
  [[6, 7], 'Festival International afterglow, summer settling in'],
  [[8], 'the specific hell of August heat'],
  [[9], 'September — first hints of relief'],
  [[10], 'the brief perfection of late October'],
  [[11], 'cooling down, holiday season approaching'],
  [[12], 'winter in Louisiana — mild, sometimes rainy'],
];

export function getSeasonalContext(date: Date = new Date()): string {
  const month = date.getMonth() + 1; // 1-indexed
  for (const [months, desc] of SEASONAL_MAP) {
    if (months.includes(month)) return desc;
  }
  return '';
}

let pollTimer: ReturnType<typeof setInterval> | null = null;

export type WeatherPoller = {
  latest: WeatherData | null;
  stop: () => void;
};

/**
 * Start polling OpenWeatherMap. Returns the latest data + stop function.
 * If OPENWEATHER_API_KEY is not set, returns null (no-op).
 */
export function startWeatherPolling(
  onUpdate: (weather: WeatherData, summary: string) => void,
  intervalMs = 15 * 60 * 1000, // 15 minutes
): WeatherPoller | null {
  const apiKey = process.env.OPENWEATHER_API_KEY;
  if (!apiKey) return null;

  // Lafayette, LA coordinates
  const lat = 30.2241;
  const lon = -92.0198;
  const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${apiKey}`;

  const poller: WeatherPoller = { latest: null, stop: () => {} };

  async function poll() {
    try {
      const res = await fetch(url);
      if (!res.ok) return;
      const json = await res.json();
      const weather = parseWeatherResponse(json);
      if (weather) {
        poller.latest = weather;
        onUpdate(weather, formatWeatherSummary(weather));
      }
    } catch {
      // Network errors are non-fatal
    }
  }

  // Initial poll
  poll();
  pollTimer = setInterval(poll, intervalMs);

  poller.stop = () => {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  };

  return poller;
}
