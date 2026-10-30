import { Link, useRouterState } from "@tanstack/react-router";
import { clsx } from "clsx";
import { ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";
import { DateVariantSuggestionHost } from "@/components/date-variant-card";
import { RelationalEvidenceSuggestionHost } from "@/components/relational-evidence-card";

const LINKS = [
  { to: "/", label: "Bench" },
  { to: "/lab", label: "Evaluation lab" },
  { to: "/substrate", label: "Substrate" },
] as const;

export function Shell({
  children,
  variant = "default",
}: {
  children: ReactNode;
  variant?: "default" | "substrate" | "bench" | "lab";
}) {
  const path = useRouterState({ select: (state) => state.location.pathname });
  const styled = variant !== "default";
  const substrate = variant === "substrate";
  const shellClass = substrate
    ? "substrate-shell"
    : variant === "lab"
      ? "substrate-shell lab-shell"
      : variant === "bench"
        ? "substrate-shell bench-shell"
        : "min-h-screen bg-ink text-fg";

  return (
    <div className={shellClass}>
      {styled && (
        <a className="substrate-skip-link" href="#substrate-content">
          Skip to content
        </a>
      )}
      <header
        className={
          styled
            ? "substrate-nav"
            : "sticky top-0 z-20 border-b border-line bg-ink/95 backdrop-blur"
        }
      >
        <div
          className={
            styled
              ? "substrate-nav-inner"
              : "mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3"
          }
        >
          <Link to="/" className={styled ? "substrate-wordmark" : "min-w-0"}>
            {styled ? (
              <>
                <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
                  <path
                    d="M16 4 28 11v10l-12 7L4 21V11L16 4Z"
                    stroke="currentColor"
                    strokeWidth="1.4"
                  />
                  <path
                    d="m4 11 12 7 12-7M16 18v10M10 7.5l12 7V24"
                    stroke="currentColor"
                    strokeWidth="1.4"
                  />
                </svg>
                <span>second thought.</span>
              </>
            ) : (
              <>
                <span className="block font-display text-2xl leading-none text-fg">
                  Second <span className="italic text-amber">Thought</span>
                </span>
                <span className="mt-1 block text-xs tracking-widest text-muted uppercase">
                  Powered by NMM
                </span>
              </>
            )}
          </Link>
          <nav
            className={styled ? "substrate-nav-links" : "flex flex-wrap gap-2"}
            aria-label="Main navigation"
          >
            {LINKS.map((link) => {
              const active = link.to === "/" ? path === "/" : path.startsWith(link.to);
              return (
                <Link
                  key={link.to}
                  to={link.to}
                  aria-current={active ? "page" : undefined}
                  className={clsx(
                    styled ? "substrate-nav-link" : "inline-flex h-11 items-center px-3 text-sm",
                    styled
                      ? active && "is-current"
                      : active
                        ? "bg-amber text-ink"
                        : "border border-line text-fg hover:border-amber",
                  )}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
          {styled && (
            <a
              className="substrate-nav-action"
              href={
                substrate ? "#connections" : variant === "lab" ? "#lab-results" : "#bench-workbench"
              }
            >
              {substrate
                ? "Check connections"
                : variant === "lab"
                  ? "Explore results"
                  : "Enter the replay"}
              <ArrowUpRight size={14} aria-hidden="true" />
            </a>
          )}
        </div>
      </header>
      <main
        id={styled ? "substrate-content" : undefined}
        className={styled ? "substrate-main" : "mx-auto max-w-7xl px-4 py-6"}
      >
        {children}
      </main>
      <DateVariantSuggestionHost />
      <RelationalEvidenceSuggestionHost />
    </div>
  );
}