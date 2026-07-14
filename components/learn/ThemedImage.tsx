/* eslint-disable @next/next/no-img-element */
import { cn } from "@/lib/utils";

/**
 * Renders the screenshot matching the viewer's theme. `src` is the dark
 * variant (e.g. /learn/roster.png); the light variant sits alongside it
 * with a -light suffix (/learn/roster-light.png). Pure CSS switch, so the
 * SSG HTML needs no JS and never flashes the wrong theme.
 */
export function ThemedImage({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const lightSrc = src.replace(/\.png$/, "-light.png");
  // Display control stays last so callers' classes can't merge it away;
  // callers must not pass display utilities (block/hidden) in className.
  return (
    <>
      <img src={src} alt={alt} className={cn(className, "hidden dark:block")} loading="lazy" />
      <img src={lightSrc} alt={alt} className={cn(className, "block dark:hidden")} loading="lazy" />
    </>
  );
}
