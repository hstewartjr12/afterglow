import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, domMax, LazyMotion } from "motion/react";
import type { VnSummary } from "@afterglow/shared";
import { api } from "./api";
import type { View } from "./types";
import { Shell } from "./components/Header";
import { Home } from "./views/Home";
import { Loading } from "./components/status";
import { ToastProvider } from "./components/Toasts";
import { Eyecatch } from "./components/Eyecatch";
import { prefersReducedMotion } from "./lib/motion";
import { preloadable } from "./lib/lazy";

// Home is the landing view; everything else loads on first use, or while idle.
const Discover = preloadable(() =>
  import("./views/Discover").then((m) => m.Discover),
);
const LibraryView = preloadable(() =>
  import("./views/LibraryView").then((m) => m.LibraryView),
);
const Taste = preloadable(() => import("./views/Taste").then((m) => m.Taste));
const Detail = preloadable(() =>
  import("./detail/Detail").then((m) => m.Detail),
);
const preloadView = (view: View) =>
  ({ home: undefined, discover: Discover, library: LibraryView, taste: Taste })[
    view
  ]
    ?.preload()
    .catch(() => {
      // Rendering retries the import and reports a failure itself.
    });

type SearchRequest = {
  term: string;
  id: number;
};
export default function App() {
  const [view, setView] = useState<View>("home");
  // The view being transitioned to while the eyecatch covers the screen.
  const [pending, setPending] = useState<{ view: View; id: number } | null>(
    null,
  );
  const navigation = useRef(0);
  const [selected, setSelected] = useState<VnSummary | null>(null);
  const [searchRequest, setSearchRequest] = useState<SearchRequest>({
    term: "",
    id: 0,
  });
  const recs = useQuery({
    queryKey: ["recommendations"],
    queryFn: api.recommendations,
  });
  const matching = useMemo(
    () => recs.data?.find((r) => r.vn.id === selected?.id),
    [recs.data, selected],
  );
  // Fetch the other screens once the first one has settled, so page changes
  // and the detail sheet never flash a loading state.
  useEffect(() => {
    const timer = setTimeout(() => {
      for (const screen of [Detail, Discover, LibraryView, Taste])
        screen.preload().catch(() => {});
    }, 1200);
    return () => clearTimeout(timer);
  }, []);
  // The taste page reports unsaved edits so leaving it can be confirmed first.
  const tasteDirty = useRef(false);
  const setTasteDirty = useCallback((dirty: boolean) => {
    tasteDirty.current = dirty;
  }, []);
  const navigate = (next: View) => {
    if (
      next !== view &&
      tasteDirty.current &&
      !window.confirm("Leave without saving your taste profile changes?")
    )
      return false;
    const id = ++navigation.current;
    if (next === view) {
      setPending(null);
      return true;
    }
    const ready = preloadView(next);
    if (prefersReducedMotion())
      void Promise.resolve(ready).then(() => {
        if (id !== navigation.current) return;
        setView(next);
        window.scrollTo(0, 0);
      });
    else setPending({ view: next, id });
    return true;
  };
  const reveal = () => {
    const transition = pending;
    if (!transition) return;
    const { view: next, id } = transition;
    // Mount the new page while the eyecatch still covers the screen, and give
    // it a frame to paint before the eyecatch sweeps away.
    void Promise.resolve(preloadView(next)).then(() => {
      if (id !== navigation.current) return;
      setView(next);
      window.scrollTo(0, 0);
      requestAnimationFrame(() =>
        requestAnimationFrame(() =>
          setPending((current) => (current?.id === id ? null : current)),
        ),
      );
    });
  };
  const open = (vn: VnSummary) =>
    void Detail.preload()
      .catch(() => {})
      .then(() => setSelected(vn));
  return (
    <LazyMotion features={domMax} strict>
      <ToastProvider>
        <Shell
          view={pending?.view ?? view}
          setView={navigate}
          onSearch={(term) => {
            if (!navigate("discover")) return;
            setSearchRequest((current) => ({
              term: term.trim(),
              id: current.id + 1,
            }));
          }}
        >
          {view === "home" && <Home go={navigate} open={open} />}
          <Suspense
            fallback={
              <main className="page">
                <Loading />
              </main>
            }
          >
            {view === "discover" && (
              <Discover
                key={searchRequest.id}
                initialTerm={searchRequest.term}
                open={open}
              />
            )}
            {view === "library" && (
              <LibraryView open={open} discover={() => navigate("discover")} />
            )}
            {view === "taste" && <Taste onDirtyChange={setTasteDirty} />}
          </Suspense>
          <AnimatePresence>
            {pending && (
              <Eyecatch
                key={pending.id}
                view={pending.view}
                onCovered={reveal}
              />
            )}
          </AnimatePresence>
          <AnimatePresence>
            {selected && (
              <Suspense key={selected.id} fallback={null}>
                <Detail
                  vn={selected}
                  recommendation={matching}
                  onClose={() => setSelected(null)}
                />
              </Suspense>
            )}
          </AnimatePresence>
        </Shell>
      </ToastProvider>
    </LazyMotion>
  );
}
