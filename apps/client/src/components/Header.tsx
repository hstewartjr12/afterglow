import { useEffect, useState } from "react";
import * as m from "motion/react-m";
import { Menu, Monitor, Moon, Search, Sun, X } from "lucide-react";
import type { View } from "../types";
import { useTheme, type ThemeChoice } from "../lib/theme";

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
        placeholder="Search titles…"
      />
    </form>
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
        <button
          className="nav-scrim"
          aria-label="Close navigation"
          onClick={() => setOpen(false)}
        />
      )}
      <nav className={open ? "open" : ""} aria-label="Main">
        <span className="nav-label label">Contents</span>
        {views.map(({ view: v, label }, i) => (
          <button
            key={v}
            className={view === v ? "active" : ""}
            aria-current={view === v ? "page" : undefined}
            onClick={() => go(v)}
          >
            <small aria-hidden="true">0{i + 1}</small>
            {label}
            {view === v && (
              <m.span
                className="nav-underline"
                layoutId="nav-underline"
                transition={{ type: "spring", stiffness: 500, damping: 40 }}
              />
            )}
          </button>
        ))}
        {open && (
          <>
            <SearchForm
              className="nav-search"
              onSearch={(term) => {
                setOpen(false);
                onSearch(term);
              }}
            />
            <div className="nav-theme">
              <span className="label">Theme</span>
              <ThemeSwitch />
            </div>
          </>
        )}
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
    <>
      <div className="accent-rail" aria-hidden="true" />
      <div className="site">
        <Header view={view} setView={setView} onSearch={onSearch} />
        {children}
      </div>
    </>
  );
}
