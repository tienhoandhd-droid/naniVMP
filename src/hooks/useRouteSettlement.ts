import { useEffect, useRef } from "react";

export function useRouteSettlement(view: string, title: string) {
  const ref = useRef<HTMLElement | null>(null);
  const previousView = useRef(view);

  useEffect(() => {
    const routeChanged = previousView.current !== view;
    previousView.current = view;
    document.title = `${title} — V/Q team`;
    const frame = requestAnimationFrame(() => {
      ref.current?.scrollTo({ top: 0, left: 0 });
      if (routeChanged) ref.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [title, view]);

  return ref;
}
