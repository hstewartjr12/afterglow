import { useMemo, useState } from "react";
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
  return (
    <Shell
      view={view}
      setView={setView}
      onSearch={(term) => {
        setSearchRequest((current) => ({
          term: term.trim(),
          id: current.id + 1,
        }));
        setView("discover");
      }}
    >
      {view === "home" && <Home go={setView} open={setSelected} />}{" "}
      {view === "discover" && (
        <Discover
          key={searchRequest.id}
          initialTerm={searchRequest.term}
          open={setSelected}
        />
      )}{" "}
      {view === "library" && (
        <LibraryView open={setSelected} discover={() => setView("discover")} />
      )}{" "}
      {view === "taste" && <Taste />}
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
