import React, { useEffect, useState } from "react";
import {
  CalendarEvent,
  getCalendarEvents,
  getSystemStats,
  getWeather,
  SystemStats,
  Weather,
} from "../../platform";
import { FloatSettings, loadSettings, subscribeToSettings } from "../../services/settings";
import "./Widgets.css";

function useSettings(): FloatSettings {
  const [settings, setSettings] = useState(() => loadSettings());
  useEffect(() => subscribeToSettings(setSettings), []);
  return settings;
}

/* ---- Weather ------------------------------------------------------------------ */

type Sky = "clear" | "partly" | "cloud" | "fog" | "rain" | "snow" | "storm";

/** WMO weather interpretation codes -> a small icon family. */
function skyFor(code: number): Sky {
  if (code === 0) return "clear";
  if (code <= 2) return "partly";
  if (code === 3) return "cloud";
  if (code === 45 || code === 48) return "fog";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
  if (code >= 95) return "storm";
  return "rain";
}

const SKY_LABEL: Record<Sky, string> = {
  clear: "Clear",
  partly: "Partly cloudy",
  cloud: "Cloudy",
  fog: "Fog",
  rain: "Rain",
  snow: "Snow",
  storm: "Thunderstorm",
};

const cloudPath = "M7 18h10a4 4 0 0 0 .6-7.96A6 6 0 0 0 6.1 11.1 3.5 3.5 0 0 0 7 18z";

const SkyIcon: React.FC<{ sky: Sky; day: boolean }> = ({ sky, day }) => (
  <svg className={`wx-icon ${sky} ${day ? "day" : "night"}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    {(sky === "clear" || sky === "partly") &&
      (day ? (
        <g className="wx-sun" transform={sky === "partly" ? "translate(4 -3) scale(0.7)" : undefined}>
          <circle cx="12" cy="12" r="4" fill="currentColor" />
          <path d="M12 2.5v2M12 19.5v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2.5 12h2M19.5 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </g>
      ) : (
        <path
          className="wx-moon"
          d="M20 13.5A8 8 0 1 1 10.5 4a6.2 6.2 0 0 0 9.5 9.5z"
          fill="currentColor"
          transform={sky === "partly" ? "translate(5 -3) scale(0.65)" : undefined}
        />
      ))}
    {sky !== "clear" && <path className="wx-cloud" d={cloudPath} fill="currentColor" stroke="none" />}
    {sky === "rain" && <path className="wx-drops" d="M9 20.5l-.6 1.6M13 20.5l-.6 1.6M17 20.5l-.6 1.6" />}
    {sky === "snow" && <path className="wx-drops" d="M9 21h.01M13 22h.01M17 21h.01" strokeWidth="2.4" />}
    {sky === "storm" && <path className="wx-bolt" d="m13 17-2.5 3.5h3L12 23" />}
    {sky === "fog" && <path className="wx-drops" d="M5 21h14" />}
  </svg>
);

/** Temperature and sky for the configured city (opt-in). Renders nothing when off. */
export const WeatherChip: React.FC = () => {
  const { weatherEnabled, weatherCity, weatherFahrenheit } = useSettings();
  const [weather, setWeather] = useState<Weather | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setWeather(null);
    setError(null);
    if (!weatherEnabled || !weatherCity.trim()) return;
    let cancelled = false;
    const load = () =>
      getWeather(weatherCity, weatherFahrenheit)
        .then((w) => !cancelled && (setWeather(w), setError(null)))
        .catch((e) => !cancelled && setError(String(e)));
    load();
    const timer = setInterval(load, 15 * 60_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [weatherEnabled, weatherCity, weatherFahrenheit]);

  if (!weatherEnabled) return null;
  if (!weather) {
    return (
      <div className="wx-chip muted" title={error ?? undefined}>
        {error ? "Weather unavailable" : weatherCity.trim() ? "…" : "Set a city"}
      </div>
    );
  }
  const sky = skyFor(weather.code);
  const range =
    weather.high != null && weather.low != null ? ` · H ${Math.round(weather.high)}° L ${Math.round(weather.low)}°` : "";
  return (
    <div className="wx-chip" title={`${weather.city}: ${SKY_LABEL[sky]}${range}`}>
      <SkyIcon sky={sky} day={weather.isDay} />
      <span className="wx-temp">{Math.round(weather.temperature)}°</span>
    </div>
  );
};

/* ---- Calendar -------------------------------------------------------------------- */

/** "Now", "in 25 min", "in 3 h", "Tomorrow", or a short date. */
export function upcomingLabel(event: CalendarEvent, now: number): string {
  if (event.start <= now) return "Now";
  const mins = Math.round((event.start - now) / 60_000);
  if (mins < 60) return `in ${mins} min`;
  const start = new Date(event.start);
  const today = new Date(now);
  const dayOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((dayOf(start) - dayOf(today)) / 86_400_000);
  if (days === 0) return `in ${Math.round(mins / 60)} h`;
  if (days === 1) return "Tomorrow";
  return start.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

/** The next event from the linked ICS calendar, or null (none, or no link). */
export function useNextEvent(): CalendarEvent | null {
  const { calendarUrl } = useSettings();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    setEvents([]);
    if (!calendarUrl.trim()) return;
    let cancelled = false;
    const load = () =>
      getCalendarEvents(calendarUrl)
        .then((list) => !cancelled && setEvents(list))
        .catch(() => !cancelled && setEvents([]));
    load();
    const timer = setInterval(load, 5 * 60_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [calendarUrl]);

  return events.find((e) => e.end > now) ?? null;
}

/* ---- System stats ------------------------------------------------------------------ */

function rate(bytesPerSec: number): string {
  if (bytesPerSec >= 1024 * 1024) return `${(bytesPerSec / 1024 / 1024).toFixed(1)} MB/s`;
  if (bytesPerSec >= 1024) return `${Math.round(bytesPerSec / 1024)} KB/s`;
  return "0 KB/s";
}

const Meter: React.FC<{ label: string; percent: number }> = ({ label, percent }) => (
  <span className="stat" title={`${label} ${Math.round(percent)}%`}>
    <span className="stat-label">{label}</span>
    <span className="stat-bar">
      <span className={percent > 85 ? "hot" : ""} style={{ width: `${Math.min(100, percent)}%` }} />
    </span>
    <span className="stat-value">{Math.round(percent)}%</span>
  </span>
);

/** CPU, memory and network speed; sampled only while mounted. */
export const StatsStrip: React.FC = () => {
  const [stats, setStats] = useState<SystemStats | null>(null);
  useEffect(() => {
    let isMounted = true;
    const load = () => getSystemStats().then((s) => isMounted && s && setStats(s));
    load();
    const timer = setInterval(load, 1500);
    return () => {
      isMounted = false;
      clearInterval(timer);
    };
  }, []);
  if (!stats) return <div className="cc-card stats-strip" />;
  return (
    <div className="cc-card stats-strip">
      <Meter label="CPU" percent={stats.cpu} />
      <Meter label="RAM" percent={(stats.memoryUsed / stats.memoryTotal) * 100} />
      <span className="stat net" title="Download / upload">
        <span>↓ {rate(stats.down)}</span>
        <span>↑ {rate(stats.up)}</span>
      </span>
    </div>
  );
};
