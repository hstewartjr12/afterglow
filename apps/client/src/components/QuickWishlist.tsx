import { useId } from "react";
import {
  useIsMutating,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { BookmarkPlus, Check } from "lucide-react";
import type { LibraryEntry, VnSummary } from "@afterglow/shared";
import { api } from "../api";
import { statusLabel } from "../lib/format";
import { invalidateMatches } from "../queries";
import { useToast } from "./Toasts";

/** The atomic endpoint adds a wishlist entry without replacing an existing tracker. */
export function useQuickWishlist(vn: VnSummary) {
  const client = useQueryClient();
  const toast = useToast();
  const library = useQuery({ queryKey: ["library"], queryFn: api.library });
  const entry = library.data?.find((item) => item.vndbId === vn.id);
  const mutationKey = ["quick-wishlist", vn.id];
  const pending = useIsMutating({ mutationKey, exact: true }) > 0;
  const add = useMutation({
    mutationKey,
    mutationFn: () => api.quickWishlist(vn),
    onSuccess: ({ entry: saved, created }) => {
      client.setQueryData<LibraryEntry[]>(["library"], (all = []) =>
        all.some((item) => item.vndbId === saved.vndbId)
          ? all
          : [...all, saved],
      );
      void client.invalidateQueries({ queryKey: ["library"] });
      if (created) void invalidateMatches(client);
      toast(
        created
          ? `${vn.title} added to your wishlist`
          : `${vn.title} is already in your library`,
      );
    },
    onError: (error) => toast(error.message),
  });
  return {
    entry,
    pending,
    checking: library.isPending,
    error: add.error,
    add: () => {
      // The mutation cache changes immediately, before React disables either
      // copy of a card. This also blocks two quick clicks in the same frame.
      if (entry || client.isMutating({ mutationKey, exact: true })) return;
      add.mutate();
    },
  };
}

export function QuickWishlist({
  vn,
  className = "",
}: {
  vn: VnSummary;
  className?: string;
}) {
  const wishlist = useQuickWishlist(vn);
  const descriptionId = useId();
  const errorId = useId();
  return (
    <div className={`quick-wishlist ${className}`}>
      <span id={descriptionId} className="visually-hidden">
        {vn.title}
      </span>
      {wishlist.entry ? (
        <span
          className={`quick-library-status status-pill status-${wishlist.entry.status}`}
          title="Already in your library"
        >
          <Check aria-hidden="true" />
          {statusLabel(wishlist.entry.status)}
        </span>
      ) : (
        <button
          className="btn btn-small wishlist-button"
          aria-describedby={
            wishlist.error ? `${descriptionId} ${errorId}` : descriptionId
          }
          disabled={wishlist.checking || wishlist.pending}
          onClick={wishlist.add}
        >
          <BookmarkPlus aria-hidden="true" />
          {wishlist.pending
            ? "Adding…"
            : wishlist.error
              ? "Retry wishlist"
              : "Wishlist"}
        </button>
      )}
      {wishlist.error && !wishlist.entry && (
        <p id={errorId} className="quick-action-error" role="alert">
          {wishlist.error.message}
        </p>
      )}
    </div>
  );
}
