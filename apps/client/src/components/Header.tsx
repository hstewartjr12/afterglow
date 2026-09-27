import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Menu, Search, X } from "lucide-react";
import type { View } from "../types";
function Rail() {
  return <div className="accent-rail" aria-hidden="true" />;
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
  const [query, setQuery] = useState("");
  useEffect(() => {
    if (!open) return;
    const close = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [open]);
  return (
    <header className="site-header">
      <button
        className="wordmark"
        onClick={() => {
          setView("home");
          setOpen(false);
        }}
      >
        AFTERGLOW<small>アフターグロウ</small>
      </button>
      <AnimatePresence>
        {open && (
          <motion.button
            className="nav-scrim"
            aria-label="Close navigation"
            onClick={() => setOpen(false)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
        )}
      </AnimatePresence>
      <nav className={open ? "open" : ""}>
        <span className="nav-label">CONTENTS / 目次</span>
        {(["discover", "library", "taste"] as View[]).map((v, i) => {
          const label = v === "taste" ? "MY TASTE" : v.toUpperCase();
          return (
            <button
              key={v}
              aria-label={label}
              className={view === v ? "active" : ""}
              onClick={() => {
                setView(v);
                setOpen(false);
              }}
            >
              <small>0{i + 1}</small>
              {label}
            </button>
          );
        })}
      </nav>
      <form
        className="header-search"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          onSearch(query);
        }}
      >
        <button type="submit" aria-label="Search visual novels">
          <Search />
        </button>
        <input
          maxLength={100}
          aria-label="Search titles and aliases"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onSearch(query);
            }
          }}
          placeholder="Search titles and aliases…"
        />
      </form>
      <button
        className={`menu ${open ? "is-open" : ""}`}
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
      <Rail />
      <div className="site">
        <Header view={view} setView={setView} onSearch={onSearch} />
        {children}
      </div>
    </>
  );
}
