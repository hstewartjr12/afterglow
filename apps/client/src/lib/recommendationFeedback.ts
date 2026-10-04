import { useEffect, useState } from "react";
import {
  useIsMutating,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { RecommendationFeedback, VnSummary } from "@afterglow/shared";
import { api } from "../api";
import { useToast } from "../components/Toasts";

const feedbackKey = ["feedback"];

export const feedbackIsActive = (
  item: RecommendationFeedback,
  now = Date.now(),
) => item.until === null || Date.parse(item.until) > now;

/** Shared by Home and the restoration panel; expired postponements stop filtering immediately. */
export function useRecommendationFeedback() {
  const client = useQueryClient();
  const query = useQuery({ queryKey: feedbackKey, queryFn: api.feedback });
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const expiry = Math.min(
      ...(query.data ?? [])
        .map((item) =>
          item.until === null ? Infinity : Date.parse(item.until),
        )
        .filter((time) => time > Date.now()),
    );
    const refresh = () => {
      setNow(Date.now());
      if (Date.now() >= expiry) {
        void client.invalidateQueries({ queryKey: feedbackKey });
        void client.invalidateQueries({ queryKey: ["recommendations"] });
      }
    };
    const visibility = () => {
      if (!document.hidden) refresh();
    };
    const timer = Number.isFinite(expiry)
      ? setTimeout(
          refresh,
          Math.min(Math.max(0, expiry - Date.now()), 2_147_483_647),
        )
      : undefined;
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("focus", refresh);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("focus", refresh);
    };
  }, [query.data, client, now]);
  return {
    ...query,
    active: (query.data ?? []).filter((item) => feedbackIsActive(item)),
  };
}

/** Optimistic changes affect only their title, so unrelated hide/restore actions are preserved. */
export function useRecommendationFeedbackActions() {
  const client = useQueryClient();
  const toast = useToast();
  const mutations = {
    predicate: (mutation: { options: { mutationKey?: readonly unknown[] } }) =>
      mutation.options.mutationKey?.[0] === "feedback-save" ||
      mutation.options.mutationKey?.[0] === "feedback-restore",
  };
  const pending = useIsMutating(mutations) > 0;
  const refresh = () => {
    // Undo can outlive its originating screen. Let the last concurrent action
    // refresh, so a response cannot overwrite another action's optimistic state.
    if (client.isMutating(mutations) > 1) return;
    void client.invalidateQueries({ queryKey: feedbackKey });
    void client.invalidateQueries({ queryKey: ["recommendations"] });
  };
  const restore = useMutation({
    mutationKey: ["feedback-restore"],
    mutationFn: (id: string) => api.removeFeedback(id),
    onMutate: async (id) => {
      await client.cancelQueries({ queryKey: feedbackKey });
      const previous = client
        .getQueryData<RecommendationFeedback[]>(feedbackKey)
        ?.find((item) => item.vndbId === id);
      client.setQueryData<RecommendationFeedback[]>(feedbackKey, (all = []) =>
        all.filter((item) => item.vndbId !== id),
      );
      return { previous };
    },
    onError: (error, id, context) => {
      if (context?.previous)
        client.setQueryData<RecommendationFeedback[]>(
          feedbackKey,
          (all = []) => [
            ...all.filter((item) => item.vndbId !== id),
            context.previous!,
          ],
        );
      toast(error.message, { label: "Retry", run: () => restore.mutate(id) });
    },
    onSuccess: (_data, _id, context) => {
      if (context?.previous)
        toast(`${context.previous.vn.title} restored to recommendations`);
    },
    onSettled: refresh,
  });
  const save = useMutation({
    mutationKey: ["feedback-save"],
    mutationFn: ({ vn, until }: { vn: VnSummary; until: string | null }) =>
      api.saveFeedback(vn, until),
    onMutate: async ({ vn, until }) => {
      await client.cancelQueries({ queryKey: feedbackKey });
      const previous = client
        .getQueryData<RecommendationFeedback[]>(feedbackKey)
        ?.find((item) => item.vndbId === vn.id);
      client.setQueryData<RecommendationFeedback[]>(feedbackKey, (all = []) => [
        ...all.filter((item) => item.vndbId !== vn.id),
        { vndbId: vn.id, vn, until, createdAt: new Date().toISOString() },
      ]);
      return { previous };
    },
    onError: (error, { vn, until }, context) => {
      client.setQueryData<RecommendationFeedback[]>(feedbackKey, (all = []) => [
        ...all.filter((item) => item.vndbId !== vn.id),
        ...(context?.previous ? [context.previous] : []),
      ]);
      toast(error.message, {
        label: "Retry",
        run: () => save.mutate({ vn, until }),
      });
    },
    onSuccess: (item) => {
      client.setQueryData<RecommendationFeedback[]>(feedbackKey, (all = []) => [
        ...all.filter((choice) => choice.vndbId !== item.vndbId),
        item,
      ]);
      toast(
        item.until === null
          ? `${item.vn.title} hidden from recommendations`
          : `${item.vn.title} postponed for 24 hours`,
        { label: "Undo", run: () => restore.mutate(item.vndbId) },
      );
    },
    onSettled: refresh,
  });
  return {
    save,
    restore,
    pending,
    hide: (vn: VnSummary, until: string | null) => {
      if (
        client.isMutating({ mutationKey: ["feedback-save"], exact: true }) ||
        client.isMutating({ mutationKey: ["feedback-restore"], exact: true })
      )
        return;
      restore.reset();
      save.mutate({ vn, until });
    },
    restoreTitle: (id: string) => {
      if (
        client.isMutating({ mutationKey: ["feedback-save"], exact: true }) ||
        client.isMutating({ mutationKey: ["feedback-restore"], exact: true })
      )
        return;
      save.reset();
      restore.mutate(id);
    },
  };
}
