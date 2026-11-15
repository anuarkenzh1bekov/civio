import Image, { type ImageProps } from "@/components/Image";
import { useState } from "react";

export function HandPhoto({ mobileSrc, ...props }: Omit<ImageProps, "alt" | "onLoad"> & { mobileSrc: string }) {
  const [loaded, setLoaded] = useState(false);
  return <picture>
    <source media="(max-width: 700px), (pointer: coarse) and (max-height: 540px) and (max-width: 960px)" srcSet={mobileSrc} />
    <Image {...props} alt="" data-loaded={loaded} onLoad={() => setLoaded(true)} />
  </picture>;
}
