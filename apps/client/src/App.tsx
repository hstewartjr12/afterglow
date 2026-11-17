import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, domMax, LazyMotion } from "motion/react";
import type { VnSummary } from "@afterglow/shared";
import { api } from "./api";
import { DemoNotice } from "./demo/DemoNotice";
import type { View } from "./types";
import { Shell } from "./components/Header";
import { Home } from "./views/Home";
import { ErrorState, Loading } from "./components/status";
import { ToastProvider } from "./components/Toasts";
import { Eyecatch } from "./components/Eyecatch";
import { prefersReducedMotion } from "./lib/motion";
import { warmCover } from "./lib/coverColor";
import { preloadable } from "./lib/lazy";
import {
  defaultDiscover,
  defaultLibrary,
  readRoute,
  routeSearch,
  type AppRoute,
  type DiscoverState,
  type LibraryState,
} from "./lib/navigation";

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

type HistoryEntry = {
  route: AppRoute;
  index: number;
  scroll: [number, number];
  detailEntry?: boolean;
};
const historyEntry = (): HistoryEntry | null =>
  window.history.state?.afterglow ?? null;
export default function App() {
  const [demoRevision, setDemoRevision] = useState(0);
  const [route, setRoute] = useState(() =>
    readRoute(location.search, historyEntry()?.route),
  );
  const routeRef = useRef(route);
  routeRef.current = route;
  const [view, setView] = useState<View>(route.view);
  const [pending, setPending] = useState<{
    view: View;
    id: number;
    scroll: [number, number];
  } | null>(null);
  const navigation = useRef(0);
  const [selected, setSelected] = useState<VnSummary | null>(null);
  const detailGuard = useRef<((resume?: () => void) => boolean) | null>(null);
  const allowDetailLeave = useRef(false);
  const ignoringPop = useRef(false);
  const afterRollback = useRef<(() => void) | null>(null);
  const currentIndex = useRef(historyEntry()?.index ?? 0);
  const scrollByView = useRef<Partial<Record<View, [number, number]>>>({});
  const scrollFrames = useRef(new Set<number>());
  const scrollTimers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const detailExiting = useRef(false);
  const restoreAfterExit = useRef<{
    scroll: [number, number];
    epoch: number;
  } | null>(null);
  const linkedDetail = useQuery({
    queryKey: ["detail", route.vn],
    queryFn: ({ signal }) => api.detail(route.vn!, signal),
    enabled: Boolean(route.vn && selected?.id !== route.vn),
  });
  const selectedStory =
    selected?.id === route.vn ? selected : route.vn ? linkedDetail.data : null;
  const setDetailGuard = useCallback(
    (guard: (resume?: () => void) => boolean) => {
      detailGuard.current = guard;
      return () => {
        if (detailGuard.current === guard) detailGuard.current = null;
      };
    },
    [],
  );
  const restoreScroll = (scroll: [number, number], delay = 0) => {
    scrollFrames.current.forEach(cancelAnimationFrame);
    scrollFrames.current.clear();
    scrollTimers.current.forEach(clearTimeout);
    scrollTimers.current.clear();
    const epoch = navigation.current;
    const timer = setTimeout(() => {
      scrollTimers.current.delete(timer);
      let attempts = 0;
      const tick = () => {
        const id = requestAnimationFrame(() => {
          scrollFrames.current.delete(id);
          if (epoch !== navigation.current) return;
          if (
            ++attempts < 90 &&
            scroll[1] > 0 &&
            document.documentElement.scrollHeight - window.innerHeight <
              scroll[1]
          )
            tick();
          else window.scrollTo(...scroll);
        });
        scrollFrames.current.add(id);
      };
      tick();
    }, delay);
    scrollTimers.current.add(timer);
  };
  useEffect(
    () => () => {
      scrollFrames.current.forEach(cancelAnimationFrame);
      scrollTimers.current.forEach(clearTimeout);
    },
    [],
  );
  const rememberScroll = () => {
    if (
      ignoringPop.current ||
      detailExiting.current ||
      routeRef.current.vn ||
      detailGuard.current
    )
      return;
    const scroll: [number, number] = [window.scrollX, window.scrollY];
    scrollByView.current[view] = scroll;
    const entry = historyEntry();
    history.replaceState(
      {
        ...history.state,
        afterglow: {
          ...entry,
          route: routeRef.current,
          index: currentIndex.current,
          scroll,
        },
      },
      "",
    );
  };
  const snapshotScroll = useRef(() => {});
  snapshotScroll.current = () => {
    if (!pending && !routeRef.current.vn && !detailGuard.current)
      rememberScroll();
  };
  useEffect(() => {
    let frame: number | undefined;
    const snapshot = () => {
      if (frame !== undefined) return;
      frame = requestAnimationFrame(() => {
        frame = undefined;
        snapshotScroll.current();
      });
    };
    window.addEventListener("scroll", snapshot, { passive: true });
    return () => {
      window.removeEventListener("scroll", snapshot);
      if (frame !== undefined) cancelAnimationFrame(frame);
    };
  }, []);
  const writeRoute = (next: AppRoute, replace = false, detailEntry = false) => {
    const previous = historyEntry();
    const index = replace ? currentIndex.current : currentIndex.current + 1;
    const entry: HistoryEntry = {
      route: next,
      index,
      scroll:
        next.view === routeRef.current.view
          ? (previous?.scroll ?? [0, 0])
          : (scrollByView.current[next.view] ?? [0, 0]),
      detailEntry:
        detailEntry ||
        Boolean(
          replace &&
          next.vn &&
          next.vn === routeRef.current.vn &&
          previous?.detailEntry,
        ),
    };
    history[replace ? "replaceState" : "pushState"](
      { ...history.state, afterglow: entry },
      "",
      `${location.pathname}${routeSearch(next)}`,
    );
    currentIndex.current = index;
    routeRef.current = next;
    setRoute(next);
    if (selected?.id !== next.vn) setSelected(null);
    return entry;
  };
  useEffect(() => {
    const entry = historyEntry();
    history.replaceState(
      {
        ...history.state,
        afterglow: {
          route: routeRef.current,
          index: entry?.index ?? 0,
          scroll: entry?.scroll ?? [0, 0],
          detailEntry: entry?.detailEntry,
        },
      },
      "",
    );
    const original = history.scrollRestoration;
    history.scrollRestoration = "manual";
    return () => {
      history.scrollRestoration = original;
    };
  }, []);
  const recs = useQuery({
    queryKey: ["recommendations"],
    queryFn: api.recommendations,
    enabled: false, // Home loads the list. Details only reuse its cached match.
  });
  const matching = useMemo(
    () => recs.data?.find((r) => r.vn.id === route.vn),
    [recs.data, route.vn],
  );
  // Fetch the other screens once the first one has settled, so page changes
  // and the detail sheet never flash a loading state. The library's covers are
  // known by then too, so they are ready before the Library page opens.
  const queryClient = useQueryClient();
  useEffect(() => {
    const timer = setTimeout(() => {
      for (const screen of [Detail, Discover, LibraryView, Taste])
        screen.preload().catch(() => {});
      queryClient
        .ensureQueryData({ queryKey: ["library"], queryFn: api.library })
        .then((library) =>
          library
            .slice(0, 24)
            .forEach(
              (entry) => entry.vn.imageUrl && warmCover(entry.vn.imageUrl),
            ),
        )
        .catch(() => {});
    }, 1200);
    return () => clearTimeout(timer);
  }, [queryClient]);
  // The taste page reports unsaved edits so leaving it can be confirmed first.
  const tasteDirty = useRef(false);
  const setTasteDirty = useCallback((dirty: boolean) => {
    tasteDirty.current = dirty;
  }, []);
  const canLeave = (next: AppRoute, resume?: () => void) => {
    if (
      next.view !== view &&
      tasteDirty.current &&
      !window.confirm("Leave without saving your taste profile changes?")
    )
      return false;
    if (
      routeRef.current.vn &&
      (next.vn !== routeRef.current.vn || next.view !== view) &&
      detailGuard.current &&
      !detailGuard.current(resume)
    )
      return false;
    return true;
  };
  const navigateRoute = (next: AppRoute): boolean => {
    if (!canLeave(next, () => navigateRoute(next))) return false;
    rememberScroll();
    if (selectedStory && next.vn !== routeRef.current.vn)
      detailExiting.current = true;
    const entry = writeRoute(next);
    const id = ++navigation.current;
    if (next.view === view) {
      setPending(null);
      return true;
    }
    const ready = preloadView(next.view);
    if (prefersReducedMotion())
      void Promise.resolve(ready).then(() => {
        if (id !== navigation.current) return;
        setView(next.view);
        setPending(null);
        if (selectedStory && detailExiting.current)
          restoreAfterExit.current = { scroll: entry.scroll, epoch: id };
        else restoreScroll(entry.scroll);
      });
    else setPending({ view: next.view, id, scroll: entry.scroll });
    return true;
  };
  const navigate = (next: View) => {
    if (next === routeRef.current.view && !routeRef.current.vn && !pending)
      return true;
    return navigateRoute({ ...routeRef.current, view: next, vn: null });
  };
  const reveal = () => {
    const transition = pending;
    if (!transition) return;
    const { view: next, id, scroll } = transition;
    void Promise.resolve(preloadView(next)).then(() => {
      if (id !== navigation.current) return;
      setView(next);
      restoreScroll(scroll);
      requestAnimationFrame(() =>
        requestAnimationFrame(() =>
          setPending((current) => (current?.id === id ? null : current)),
        ),
      );
    });
  };
  const open = (vn: VnSummary) => {
    const id = ++navigation.current;
    void Detail.preload()
      .catch(() => {})
      .then(() => {
        if (id !== navigation.current || routeRef.current.vn === vn.id) return;
        rememberScroll();
        writeRoute({ ...routeRef.current, vn: vn.id }, false, true);
        setSelected(vn);
      });
  };
  const close = () => {
    allowDetailLeave.current = true;
    if (historyEntry()?.detailEntry) history.back();
    else {
      writeRoute({ ...routeRef.current, vn: null }, true);
      allowDetailLeave.current = false;
    }
  };
  const popHandler = useRef<(event: PopStateEvent) => void>(() => {});
  popHandler.current = () => {
    if (ignoringPop.current) {
      const arrived = historyEntry();
      if (arrived && arrived.index !== currentIndex.current) {
        // Rapid Back presses can arrive before the rollback traversal. Keep
        // the guarded story selected until history reaches its saved entry.
        history.go(currentIndex.current - arrived.index);
        return;
      }
      ignoringPop.current = false;
      const resume = afterRollback.current;
      afterRollback.current = null;
      resume?.();
      return;
    }
    const entry = historyEntry();
    const next = readRoute(location.search, entry?.route ?? routeRef.current);
    const approved = allowDetailLeave.current;
    allowDetailLeave.current = false;
    const retryPop = () => {
      const delta =
        (entry?.index ?? currentIndex.current) - currentIndex.current;
      const retry = () => {
        if (delta) history.go(delta);
        else navigateRoute(next);
      };
      if (ignoringPop.current) afterRollback.current = retry;
      else retry();
    };
    if (!approved && !canLeave(next, retryPop)) {
      const delta =
        currentIndex.current - (entry?.index ?? currentIndex.current);
      if (delta) {
        ignoringPop.current = true;
        history.go(delta);
      } else
        history.pushState(
          {
            afterglow: {
              route: routeRef.current,
              index: currentIndex.current,
              scroll: [0, 0],
            },
          },
          "",
          `${location.pathname}${routeSearch(routeRef.current)}`,
        );
      return;
    }
    if (selectedStory && next.vn !== routeRef.current.vn)
      detailExiting.current = true;
    currentIndex.current = entry?.index ?? 0;
    ++navigation.current;
    setPending(null);
    routeRef.current = next;
    setRoute(next);
    setSelected((current) => (current?.id === next.vn ? current : null));
    setView(next.view);
    if (!next.vn) {
      const scroll = entry?.scroll ?? [0, 0];
      if (detailExiting.current)
        restoreAfterExit.current = { scroll, epoch: navigation.current };
      else restoreScroll(scroll);
    }
  };
  useEffect(() => {
    const pop = (event: PopStateEvent) => popHandler.current(event);
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, []);
  const updateDiscover = (discover: DiscoverState, push = false) => {
    rememberScroll();
    writeRoute({ ...routeRef.current, discover }, !push);
  };
  const updateLibrary = (library: LibraryState) =>
    writeRoute({ ...routeRef.current, library }, true);
  return (
    <LazyMotion features={domMax} strict>
      <ToastProvider>
        <Shell
          key={demoRevision}
          view={pending?.view ?? view}
          setView={navigate}
          onSearch={(term) =>
            navigateRoute({
              ...routeRef.current,
              view: "discover",
              vn: null,
              discover: { ...defaultDiscover(), q: term.trim() },
            })
          }
        >
          <DemoNotice
            onReset={() => {
              ++navigation.current;
              tasteDirty.current = false;
              detailGuard.current = null;
              detailExiting.current = false;
              afterRollback.current = null;
              restoreAfterExit.current = null;
              setSelected(null);
              setPending(null);
              writeRoute(
                {
                  view: "home",
                  vn: null,
                  discover: defaultDiscover(),
                  library: defaultLibrary(),
                },
                true,
              );
              setView("home");
              setDemoRevision((value) => value + 1);
              restoreScroll([0, 0]);
            }}
          />
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
                state={route.discover}
                onChange={updateDiscover}
                open={open}
              />
            )}
            {view === "library" && (
              <LibraryView
                state={route.library}
                onChange={updateLibrary}
                open={open}
                discover={() => navigate("discover")}
              />
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
          {route.vn && !selectedStory && linkedDetail.isError && (
            <div className="page">
              <ErrorState
                message={linkedDetail.error.message}
                retry={() => void linkedDetail.refetch()}
              />
              <button className="btn" onClick={close}>
                Close story
              </button>
            </div>
          )}
          {route.vn && !selectedStory && linkedDetail.isLoading && (
            <div className="page" role="status">
              Loading story…
            </div>
          )}
          <AnimatePresence
            onExitComplete={() => {
              detailExiting.current = false;
              const restore = restoreAfterExit.current;
              restoreAfterExit.current = null;
              if (restore && restore.epoch === navigation.current)
                restoreScroll(restore.scroll);
            }}
          >
            {selectedStory && (
              <Suspense key={selectedStory.id} fallback={null}>
                <Detail
                  vn={selectedStory}
                  recommendation={matching}
                  onClose={() => {
                    if (routeRef.current.vn === selectedStory.id) close();
                  }}
                  onCloseGuardChange={setDetailGuard}
                  onDiscoverTag={(tag) =>
                    navigateRoute({
                      ...routeRef.current,
                      view: "discover",
                      vn: null,
                      discover: {
                        ...defaultDiscover(),
                        language: route.discover.language,
                        platform: route.discover.platform,
                        tag: tag.id,
                        tagName: tag.name,
                      },
                    })
                  }
                />
              </Suspense>
            )}
          </AnimatePresence>
        </Shell>
      </ToastProvider>
    </LazyMotion>
  );
}
