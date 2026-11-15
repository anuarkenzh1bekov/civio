import { LogOut, MessageCircle, Search, UserRound } from "lucide-react";
import Link from "@/components/Link";
import { useEffect, useRef, useState } from "react";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeMode";

const sections = [
  { id: "overview", label: "Overview" },
  { id: "budget", label: "Budget" },
  { id: "folders", label: "Folders" },
] as const;

type SectionId = (typeof sections)[number]["id"];

export function PlanHeader({ preview, onSearch, onAsk, onChecklist }: {
  preview: boolean; onSearch: () => void; onAsk: () => void; onChecklist: () => void;
}) {
  const headerRef = useRef<HTMLElement>(null);
  const [active, setActive] = useState<SectionId>("overview");

  useEffect(() => {
    const destinations = sections.flatMap(section => {
      const element = document.getElementById(section.id);
      return element ? [{ ...section, element }] : [];
    });
    const fragmentTarget = () => document.getElementById(window.location.hash.slice(1));

    function syncSection() {
      const top = (headerRef.current?.offsetHeight ?? 0) + 20;
      const atEnd = window.scrollY > 0 && Math.ceil(window.scrollY + window.innerHeight) >= document.documentElement.scrollHeight;
      if (atEnd) {
        // Several anchors can reach the same scroll position at the bottom of a short plan.
        const target = document.activeElement instanceof HTMLInputElement ? document.activeElement : fragmentTarget();
        const requested = target && destinations.find(({ element }) => element.contains(target));
        setActive(requested && target.getBoundingClientRect().top >= top - 6 ? requested.id : "folders");
      } else {
        const current = destinations.findLast(({ element }) => element.getBoundingClientRect().top <= top);
        setActive(current?.id ?? "overview");
      }
    }

    // A saved plan renders after hydration, when the browser may already have tried its fragment.
    fragmentTarget()?.scrollIntoView({ block: "start" });
    syncSection();
    window.addEventListener("scroll", syncSection, { passive: true });
    window.addEventListener("resize", syncSection);
    window.addEventListener("hashchange", syncSection);
    document.addEventListener("focusin", syncSection);
    return () => {
      window.removeEventListener("scroll", syncSection);
      window.removeEventListener("resize", syncSection);
      window.removeEventListener("hashchange", syncSection);
      document.removeEventListener("focusin", syncSection);
    };
  }, []);

  const ProfileIcon = preview ? LogOut : UserRound;

  return (
    <header className="plan-header sticky-glass-header" ref={headerRef}>
      <div className="ledger-shell plan-header-inner">
        <Logo />
        <nav className="plan-sections" aria-label="Plan sections">
          {sections.map(({ id, label }) => (
            <a key={id} href={`#${id}`} aria-current={id === active ? "location" : undefined}
              onClick={id === "folders" ? () => {
                if (window.matchMedia("(max-width: 650px)").matches) onChecklist();
              } : undefined}>
              {id === "folders" ? <><span className="folders-nav-label">{label}</span><span className="checklist-nav-label">Checklist</span></> : label}
            </a>
          ))}
        </nav>
        <div className="plan-tools">
          <ThemeToggle />
          <button className="plan-search" type="button" onClick={onSearch} aria-label="Search tasks and actions" title="Search tasks and actions">
            <Search aria-hidden="true" />
          </button>
          <button className="plan-ask" type="button" onClick={onAsk} aria-label="Ask Civio" title="Ask Civio">
            <MessageCircle aria-hidden="true" />
          </button>
          <Link className="plan-profile" href={preview ? "/dashboard" : "/onboarding"}>
            <ProfileIcon aria-hidden="true" /><span>{preview ? "Exit demo" : "Edit profile"}</span>
          </Link>
        </div>
      </div>
    </header>
  );
}
