import Image from "@/components/Image";
import { useState } from "react";
import { isStateCode } from "@/lib/states";
import styles from "./RoutePhotos.module.css";

function Photo({ code, sizes, side }: { code: string; sizes: string; side: "origin" | "destination" }) {
  const [ready, setReady] = useState(false);
  return <Image src={`/states/${code.toLowerCase()}.webp`} alt="" fill sizes={sizes} loading="eager"
    className={styles[side]} data-ready={ready} onLoad={() => setReady(true)} onError={() => setReady(false)} />;
}

export function RoutePhotos({ origin, destination, sizes }: { origin?: string; destination?: string; sizes: string }) {
  return <div className={styles.photos} aria-hidden="true">
    {origin && isStateCode(origin) && <Photo key={`from-${origin}`} code={origin} sizes={sizes} side="origin" />}
    {destination && destination !== origin && isStateCode(destination) &&
      <Photo key={`to-${destination}`} code={destination} sizes={sizes} side="destination" />}
  </div>;
}
