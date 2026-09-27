import {
  lazy,
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

// Home is the landing view; everything else loads on first use, or while idle.
const loadDiscover = () => import("./views/Discover");
const loadLibrary = () => import("./views/LibraryView");
const loadTaste = () => import("./views/Taste");
const loadDetail = () => import("./detail/Detail");
const Discover = lazy(() =>
  loadDiscover().then((m) => ({ default: m.Discover })),
);
const LibraryView = lazy(() =>
  loadLibrary().then((m) => ({ default: m.LibraryView })),
);
const Taste = lazy(() => loadTaste().then((m) => ({ default: m.Taste })));
const Detail = lazy(() => loadDetail().then((m) => ({ default: m.Detail })));

type SearchRequest = {
  term: string;
  id: number;
};
export default function App() {
  const [view, setView] = useState<View>("home");
  // The view being transitioned to while the eyecatch covers the screen.
  const [pending, setPending] = useState<View | null>(null);
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
      for (const load of [loadDetail, loadDiscover, loadLibrary, loadTaste])
        void load();
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
    if (next === view || prefersReducedMotion()) setView(next);
    else setPending(next);
    return true;
  };
  const reveal = () => {
    if (!pending) return;
    setView(pending);
    setPending(null);
    window.scrollTo(0, 0);
  };
  return (
    <LazyMotion features={domMax} strict>
      <ToastProvider>
        <Shell
          view={pending ?? view}
          setView={navigate}
          onSearch={(term) => {
            if (!navigate("discover")) return;
            setSearchRequest((current) => ({
              term: term.trim(),
              id: current.id + 1,
            }));
          }}
        >
          {view === "home" && <Home go={navigate} open={setSelected} />}
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
                open={setSelected}
              />
            )}
            {view === "library" && (
              <LibraryView
                open={setSelected}
                discover={() => navigate("discover")}
              />
            )}
            {view === "taste" && <Taste onDirtyChange={setTasteDirty} />}
          </Suspense>
          <AnimatePresence>
            {pending && <Eyecatch view={pending} onCovered={reveal} />}
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
