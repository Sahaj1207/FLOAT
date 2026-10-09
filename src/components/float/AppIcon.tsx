import React, { useEffect, useState } from "react";
import { getAppIcon } from "../../platform";
import "./AppIcon.css";

// appId -> data URL, or null when the app has no readable logo.
const cache = new Map<string, string | null>();
const pending = new Map<string, Promise<string | null>>();

function loadIcon(appId: string): Promise<string | null> {
  let request = pending.get(appId);
  if (!request) {
    request = getAppIcon(appId).then((base64) => {
      const url = base64 ? `data:image/png;base64,${base64}` : null;
      cache.set(appId, url);
      pending.delete(appId);
      return url;
    });
    pending.set(appId, request);
  }
  return request;
}

interface AppIconProps {
  appId?: string;
  appName?: string;
  size?: number;
  className?: string;
}

/** The sending app's logo, falling back to its initial on a tinted tile. */
export const AppIcon: React.FC<AppIconProps> = ({ appId, appName, size = 20, className = "" }) => {
  const [url, setUrl] = useState<string | null>(() => (appId ? cache.get(appId) ?? null : null));

  useEffect(() => {
    if (!appId) {
      setUrl(null);
      return;
    }
    if (cache.has(appId)) {
      setUrl(cache.get(appId) ?? null);
      return;
    }
    let cancelled = false;
    loadIcon(appId).then((result) => {
      if (!cancelled) setUrl(result);
    });
    return () => {
      cancelled = true;
    };
  }, [appId]);

  const style = { width: size, height: size, borderRadius: Math.round(size * 0.28) };
  if (url) {
    return <img className={`app-icon ${className}`} style={style} src={url} alt="" draggable={false} />;
  }
  const initial = (appName || "?").trim().charAt(0).toUpperCase() || "?";
  return (
    <span
      className={`app-icon app-icon-fallback ${className}`}
      style={{ ...style, fontSize: Math.round(size * 0.5), background: fallbackColor(appName) }}
      aria-hidden="true"
    >
      {initial}
    </span>
  );
};

function fallbackColor(name = ""): string {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return `hsl(${Math.abs(hash) % 360} 45% 38%)`;
}

export default AppIcon;
