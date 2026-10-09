import { useEffect, useState } from "react";
import { getAlbumArt } from "../../platform";
import { MediaSession } from "../../platform/media";

// Art is keyed by content hash, so a cache hit is always current.
const cache = new Map<string, string>();
const MAX_CACHED = 16;

/** Resolve a session's album art to a data URL, fetching only when its artKey changes. */
export function useAlbumArt(media: MediaSession | null | undefined): string | null {
  const key = media?.artKey;
  const sessionId = media?.id;
  const [url, setUrl] = useState<string | null>(() => (key ? cache.get(key) ?? null : null));

  useEffect(() => {
    if (!key || !sessionId) {
      setUrl(null);
      return;
    }
    const cached = cache.get(key);
    if (cached) {
      setUrl(cached);
      return;
    }
    let cancelled = false;
    getAlbumArt(sessionId).then((base64) => {
      if (cancelled) return;
      if (!base64) {
        setUrl(null);
        return;
      }
      const dataUrl = `data:image/jpeg;base64,${base64}`;
      if (cache.size >= MAX_CACHED) {
        cache.delete(cache.keys().next().value!);
      }
      cache.set(key, dataUrl);
      setUrl(dataUrl);
    });
    return () => {
      cancelled = true;
    };
  }, [key, sessionId]);

  return url;
}
