import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { storage } from "./storage";
import { useToast } from "../components/Toasts";
export function DemoNotice({ onReset }: { onReset: () => void }) {
  const client = useQueryClient();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const reset = async () => {
    if (
      !window.confirm(
        "Reset this demo? Your library, notes, and taste profile in this browser will be cleared.",
      )
    )
      return;
    setBusy(true);
    try {
      await client.cancelQueries();
      await storage.reset();
      client.clear();
      onReset();
      toast("Demo reset. Start exploring again.");
    } catch (error) {
      toast(
        error instanceof Error ? error.message : "The demo could not be reset.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <aside className="demo-notice" aria-label="About this demo">
      <p>
        <strong>Try Afterglow</strong>
        <span>
          Your library and notes stay in this browser. Clearing site data
          removes them.
        </span>
      </p>
      <div>
        <a
          href="https://github.com/hstewartjr12/afterglow"
          target="_blank"
          rel="noreferrer"
        >
          View on GitHub <span aria-hidden="true">↗</span>
        </a>
        <button type="button" disabled={busy} onClick={() => void reset()}>
          {busy ? "Resetting…" : "Reset demo"}
        </button>
      </div>
    </aside>
  );
}
