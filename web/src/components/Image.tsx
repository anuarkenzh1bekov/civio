import type { ComponentProps, CSSProperties } from "react";

export type ImageProps = Omit<ComponentProps<"img">, "src" | "alt"> & {
  src: string;
  alt: string;
  /** Cover the nearest positioned ancestor instead of taking a size of its own. */
  fill?: boolean;
  /** Above the fold: load at once and ahead of other images. */
  preload?: boolean;
};

const FILL: CSSProperties = { position: "absolute", inset: 0, width: "100%", height: "100%", color: "transparent" };

/** An image from `public/`. Lazy by default; `width` and `height` reserve its space before it loads. */
export default function Image({ fill, preload, loading, style, alt, ...rest }: ImageProps) {
  return (
    <img
      alt={alt}
      decoding="async"
      loading={preload ? "eager" : loading ?? "lazy"}
      fetchPriority={preload ? "high" : undefined}
      style={fill ? { ...FILL, ...style } : { color: "transparent", ...style }}
      {...rest}
    />
  );
}
