import Link from "next/link";

/** The mark: an open route that closes on a single point. One change, one place. */
export function LogoMark({ className = "size-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <path d="M23.5 8.6a10.5 10.5 0 1 0 0 14.8" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" />
      <circle cx="23.6" cy="16" r="2.8" fill="currentColor" />
    </svg>
  );
}

export function Logo({ tone = "ink" }: { tone?: "ink" | "dark" }) {
  return (
    <Link
      href="/"
      className={`inline-flex items-center gap-2 font-display text-xl font-semibold tracking-tight ${
        tone === "dark" ? "text-on-dark" : "text-ink"
      }`}
    >
      <LogoMark className={`size-6 ${tone === "dark" ? "text-on-dark" : "text-oxblood"}`} />
      Civio
    </Link>
  );
}
