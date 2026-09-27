import { useCallback, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence } from "motion/react";
import type { VnSummary } from "@afterglow/shared";
import { api } from "./api";
import type { View } from "./types";
import { Shell } from "./components/Header";
import { Home } from "./views/Home";
import { Discover } from "./views/Discover";
import { LibraryView } from "./views/LibraryView";
import { Taste } from "./views/Taste";
import { Detail } from "./detail/Detail";

type SearchRequest = {
  term: string;
  id: number;
};
export default function App() {
  const [view, setView] = useState<View>("home");
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
    setView(next);
    return true;
  };
  return (
    <Shell
      view={view}
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
      {view === "discover" && (
        <Discover
          key={searchRequest.id}
          initialTerm={searchRequest.term}
          open={setSelected}
        />
      )}
      {view === "library" && (
        <LibraryView open={setSelected} discover={() => navigate("discover")} />
      )}
      {view === "taste" && <Taste onDirtyChange={setTasteDirty} />}
      <AnimatePresence>
        {selected && (
          <Detail
            key={selected.id}
            vn={selected}
            recommendation={matching}
            onClose={() => setSelected(null)}
          />
        )}
      </AnimatePresence>
    </Shell>
  );
}
