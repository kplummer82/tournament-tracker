import { useEffect, useRef, useState } from "react";

/**
 * Track a container's pixel width so charts can be laid out in real pixels
 * rather than a scaled viewBox. Scaling a viewBox to fit shrinks axis labels
 * along with everything else — at 375px they become unreadable — so charts
 * here recompute their geometry against the measured width instead.
 */
export function useElementWidth<T extends HTMLElement>(fallback = 640) {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(fallback);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setWidth(el.clientWidth || fallback);
    update();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [fallback]);

  return { ref, width };
}
