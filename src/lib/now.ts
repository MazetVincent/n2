import { useEffect, useState } from "react";

/** L'heure courante, mise à jour régulièrement (« en cours », « dans 5 min », fin d'un report) */
export function useNow(everyMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(id);
  }, [everyMs]);
  return now;
}
