import type { ComponentProps } from "react";
import { Link as RouterLink } from "react-router";

type Props = Omit<ComponentProps<typeof RouterLink>, "to"> & { href: string };

/** A router link that takes `href`, so it also fits where a plain anchor is expected. */
export default function Link({ href, ...rest }: Props) {
  // Other sites and files are ordinary links; only the app's own pages go through the router.
  if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(href)) return <a href={href} {...rest} />;
  return <RouterLink to={href} {...rest} />;
}
