import { useEffect, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import * as m from "motion/react-m";
import { Menu, Monitor, Moon, Search, Sun, X } from "lucide-react";
import type { View } from "../types";
import { useTheme, type ThemeChoice } from "../lib/theme";
import { useModal } from "../useModal";

const views: { view: View; label: string }[] = [
  { view: "discover", label: "Discover" },
  { view: "library", label: "Library" },
  { view: "taste", label: "My taste" },
];

function ThemeSwitch() {
  const [choice, setChoice] = useTheme();
  const options: { value: ThemeChoice; label: string; icon: typeof Sun }[] = [
    { value: "system", label: "Match system theme", icon: Monitor },
    { value: "light", label: "Light theme", icon: Sun },
    { value: "dark", label: "Dark theme", icon: Moon },
  ];
  return (
    <div className="theme-switch" role="group" aria-label="Color theme">
      {options.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          aria-label={label}
          title={label}
          aria-pressed={choice === value}
          onClick={(e) => {
            const box = e.currentTarget.getBoundingClientRect();
            setChoice(value, {
              x: box.left + box.width / 2,
              y: box.top + box.height / 2,
            });
          }}
        >
          <Icon aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}

function SearchForm({
  onSearch,
  className,
}: {
  onSearch: (term: string) => void;
  className: string;
}) {
  const [query, setQuery] = useState("");
  return (
    <form
      className={`search-field ${className}`}
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        onSearch(query);
      }}
    >
      <button type="submit" aria-label="Search visual novels">
        <Search aria-hidden="true" />
      </button>
      <input
        maxLength={100}
        aria-label="Search titles and aliases"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.nativeEvent.isComposing) {
            e.preventDefault();
            onSearch(query);
          }
        }}
        placeholder="Search titles…"
      />
    </form>
  );
}

function NavigationLinks({
  view,
  onNavigate,
  mobile = false,
}: {
  view: View;
  onNavigate: (view: View) => void;
  mobile?: boolean;
}) {
  return views.map(({ view: v, label }, i) => (
    <button
      key={v}
      className={`nav-link ${view === v ? "active" : ""}`}
      aria-current={view === v ? "page" : undefined}
      onClick={() => onNavigate(v)}
    >
      <small aria-hidden="true">0{i + 1}</small>
      {label}
      {view === v && !mobile && (
        <m.span
          className="nav-underline"
          layoutId="nav-underline"
          transition={{ type: "spring", stiffness: 500, damping: 40 }}
        />
      )}
    </button>
  ));
}

function MobileNavigation({
  view,
  onNavigate,
  onSearch,
  onClose,
}: {
  view: View;
  onNavigate: (view: View) => void;
  onSearch: (term: string) => void;
  onClose: () => void;
}) {
  // Lock the root below; clipping the body would cut off the page-sized backgrounds.
  const ref = useModal<HTMLDivElement>({ lockScroll: false });
  const readViewport = () => ({
    top: window.scrollY + (window.visualViewport?.offsetTop ?? 0),
    height: window.visualViewport?.height ?? window.innerHeight,
  });
  const [viewport, setViewport] = useState(readViewport);
  useEffect(() => {
    const root = document.documentElement;
    const overflow = root.style.overflow;
    root.style.overflow = "hidden";
    const update = () => setViewport(readViewport());
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update);
    window.visualViewport?.addEventListener("resize", update);
    window.visualViewport?.addEventListener("scroll", update);
    return () => {
      root.style.overflow = overflow;
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update);
      window.visualViewport?.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("scroll", update);
    };
  }, []);

  return createPortal(
    <div
      className="mobile-nav"
      style={
        {
          "--nav-top": `${viewport.top}px`,
          "--nav-height": `${viewport.height}px`,
        } as CSSProperties
      }
    >
      <button
        className="nav-scrim"
        aria-label="Close navigation"
        tabIndex={-1}
        onClick={onClose}
      />
      <div className="mobile-nav-panel">
        <div
          ref={ref}
          className="mobile-nav-content"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation"
        >
          <button
            className="mobile-nav-close icon-button"
            aria-label="Close navigation"
            onClick={onClose}
          >
            <X />
          </button>
          <nav aria-label="Main">
            <span className="nav-label label">Contents</span>
            <NavigationLinks view={view} onNavigate={onNavigate} mobile />
            <SearchForm className="nav-search" onSearch={onSearch} />
            <div className="nav-theme">
              <span className="label">Theme</span>
              <ThemeSwitch />
            </div>
          </nav>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function Header({
  view,
  setView,
  onSearch,
}: {
  view: View;
  setView: (v: View) => void;
  onSearch: (term: string) => void;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const mobile = window.matchMedia("(max-width: 800px)");
    const resize = () => {
      if (!mobile.matches) setOpen(false);
    };
    mobile.addEventListener("change", resize);
    return () => mobile.removeEventListener("change", resize);
  }, []);
  useEffect(() => {
    if (!open) return;
    const close = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [open]);
  const go = (next: View) => {
    setView(next);
    setOpen(false);
  };
  return (
    <header className="site-header">
      <button className="wordmark" onClick={() => go("home")}>
        Afterglow
        <span className="jp" lang="ja">
          アフターグロウ
        </span>
      </button>
      {open && (
        <MobileNavigation
          view={view}
          onNavigate={go}
          onSearch={(term) => {
            setOpen(false);
            onSearch(term);
          }}
          onClose={() => setOpen(false)}
        />
      )}
      <nav aria-label="Main">
        <NavigationLinks view={view} onNavigate={go} />
      </nav>
      <SearchForm className="header-search" onSearch={onSearch} />
      <ThemeSwitch />
      <button
        className="menu icon-button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-label={open ? "Close navigation" : "Open navigation"}
      >
        {open ? <X /> : <Menu />}
      </button>
    </header>
  );
}

export function Shell({
  children,
  view,
  setView,
  onSearch,
}: {
  children: React.ReactNode;
  view: View;
  setView: (v: View) => void;
  onSearch: (term: string) => void;
}) {
  return (
    <div className="site">
      <Header view={view} setView={setView} onSearch={onSearch} />
      {children}
    </div>
  );
}
