/* eslint-disable @next/next/no-img-element */
import { ThemedImage } from "./ThemedImage";

/**
 * Bordered screenshot with an uppercase micro-caption. Src lives under
 * /learn/ and is the dark variant; a -light twin is shown in light mode
 * unless `themed` is false (for theme-neutral images like PDF pages).
 */
export function Figure({
  src,
  alt,
  caption,
  themed = true,
}: {
  src: string;
  alt: string;
  caption?: string;
  themed?: boolean;
}) {
  return (
    <figure className="my-5">
      <div className="border border-border bg-card overflow-hidden">
        {themed ? (
          <ThemedImage src={src} alt={alt} className="w-full" />
        ) : (
          <img src={src} alt={alt} className="w-full block" loading="lazy" />
        )}
      </div>
      {caption && (
        <figcaption
          className="mt-2 text-[10px] uppercase tracking-[0.1em] text-muted-foreground"
          style={{ fontFamily: "var(--font-body)" }}
        >
          {caption}
        </figcaption>
      )}
    </figure>
  );
}
