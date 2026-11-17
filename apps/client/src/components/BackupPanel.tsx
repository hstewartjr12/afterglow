import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Upload, X } from "lucide-react";
import { backupSchema, MAX_BACKUP_BYTES, type Backup } from "@afterglow/shared";
import { api } from "../api";
import { invalidateMatches } from "../queries";
import { plural } from "../lib/format";
import { ErrorState } from "./status";
import "../styles/backup.css";

export async function readBackupFile(file: File): Promise<Backup> {
  if (!file.size)
    throw new Error("This backup file is empty. No data was changed.");
  if (file.size > MAX_BACKUP_BYTES)
    throw new Error("Choose a backup smaller than 10 MB. No data was changed.");
  let value: unknown;
  try {
    value = JSON.parse((await file.text()).replace(/^\uFEFF/, ""));
  } catch {
    throw new Error(
      "This file could not be read as JSON. No data was changed.",
    );
  }
  const parsed = backupSchema.safeParse(value);
  if (!parsed.success)
    throw new Error(
      "This is not a complete, valid Afterglow backup. No data was changed.",
    );
  return parsed.data;
}

export function BackupPanel() {
  const client = useQueryClient();
  const library = useQuery({ queryKey: ["library"], queryFn: api.library });
  const feedback = useQuery({ queryKey: ["feedback"], queryFn: api.feedback });
  const input = useRef<HTMLInputElement>(null);
  const selection = useRef(0);
  const [file, setFile] = useState<{ name: string; backup: Backup } | null>(
    null,
  );
  const [fileError, setFileError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [overwrite, setOverwrite] = useState(false);
  const [includePreferences, setIncludePreferences] = useState(false);
  const download = useMutation({
    mutationFn: async () => {
      const backup = backupSchema.parse(await api.backup());
      const blob = new Blob([JSON.stringify(backup)], {
        type: "application/json",
      });
      if (blob.size > MAX_BACKUP_BYTES)
        throw new Error(
          "This backup exceeds the 10 MB restore limit. Your data has not changed.",
        );
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `afterglow-backup-${backup.exportedAt.slice(0, 10)}.json`;
      document.body.append(link);
      link.click();
      link.remove();
      // Safari may start reading a download after the click handler completes.
      const revoke = URL.revokeObjectURL.bind(URL);
      setTimeout(() => revoke(url), 1000);
      return backup;
    },
  });
  const restore = useMutation({
    mutationFn: api.importBackup,
    onSuccess: (_result, variables) => {
      if (variables.includePreferences) {
        // Taste initializes its editable draft from cached data. Publish the
        // confirmed restored profile before a visit can consume the old cache.
        client.setQueryData(["preferences"], variables.backup.preferences);
      }
      setFile(null);
      void client.invalidateQueries({ queryKey: ["library"] });
      void client.invalidateQueries({ queryKey: ["preferences"] });
      void client.invalidateQueries({ queryKey: ["feedback"] });
      void invalidateMatches(client);
    },
  });
  const preview = useMemo(() => {
    if (!file) return null;
    const existing = new Set(library.data?.map((entry) => entry.vndbId));
    const hidden = new Set(feedback.data?.map((entry) => entry.vndbId));
    const matching = file.backup.library.filter((entry) =>
      existing.has(entry.vndbId),
    ).length;
    const dismissals = file.backup.feedback.filter(
      (entry) => entry.until === null || Date.parse(entry.until) > Date.now(),
    );
    return {
      matching,
      added: file.backup.library.length - matching,
      dismissals: dismissals.length,
      matchingDismissals: dismissals.filter((entry) => hidden.has(entry.vndbId))
        .length,
    };
  }, [file, library.data, feedback.data]);
  const chooseFile = async (chosen: File | undefined) => {
    const version = ++selection.current;
    restore.reset();
    setFile(null);
    setFileError(null);
    setOverwrite(false);
    setIncludePreferences(false);
    setReading(Boolean(chosen));
    if (!chosen) return;
    try {
      const backup = await readBackupFile(chosen);
      if (version === selection.current) setFile({ name: chosen.name, backup });
    } catch (error) {
      if (version === selection.current)
        setFileError(
          error instanceof Error
            ? error.message
            : "The backup could not be read.",
        );
    } finally {
      if (version === selection.current) setReading(false);
    }
  };
  const busy = reading || restore.isPending;
  const previewReady =
    library.isSuccess && (!preview?.dismissals || feedback.isSuccess);
  return (
    <section className="backup-panel" aria-labelledby="backup-title">
      <header className="backup-head">
        <div>
          <h2 id="backup-title">Backup & restore</h2>
          <p className="muted">
            Keep a copy of your library, private notes, taste profile and saved
            recommendation dismissals.
          </p>
        </div>
        <div className="backup-actions">
          <button
            className="btn btn-small"
            disabled={download.isPending || restore.isPending}
            onClick={() => download.mutate()}
          >
            <Download aria-hidden="true" />{" "}
            {download.isPending ? "Preparing backup…" : "Download backup"}
          </button>
          <button
            className="btn btn-small"
            disabled={busy}
            onClick={() => input.current?.click()}
          >
            <Upload aria-hidden="true" />{" "}
            {reading ? "Reading backup…" : "Choose backup"}
          </button>
          <input
            ref={input}
            type="file"
            accept=".json,application/json"
            aria-label="Choose an Afterglow backup"
            hidden
            disabled={busy}
            onChange={(event) => {
              const chosen = event.target.files?.[0];
              event.target.value = "";
              void chooseFile(chosen);
            }}
          />
        </div>
      </header>
      {download.isError && <ErrorState message={download.error.message} />}
      {fileError && <ErrorState message={fileError} />}
      {file && preview && (
        <div className="backup-preview" aria-label="Backup preview">
          <div className="backup-preview-head">
            <div>
              <h3>{file.name}</h3>
              <p className="muted">
                Exported {new Date(file.backup.exportedAt).toLocaleString()}
              </p>
            </div>
            <button
              className="icon-button"
              aria-label="Cancel restore"
              disabled={restore.isPending}
              onClick={() => {
                selection.current++;
                setFile(null);
              }}
            >
              <X aria-hidden="true" />
            </button>
          </div>
          <p>
            {plural(file.backup.library.length, "story", "stories")} in this
            backup.
          </p>
          {previewReady ? (
            <p className="backup-counts" role="status">
              {preview.added.toLocaleString()} new ·{" "}
              {preview.matching.toLocaleString()} already in your library
              {preview.dismissals > 0 && (
                <>
                  {" "}
                  ·{" "}
                  {plural(
                    preview.dismissals,
                    "active recommendation dismissal",
                  )}{" "}
                  ({preview.matchingDismissals.toLocaleString()} already saved)
                </>
              )}
            </p>
          ) : (
            <p className="muted" role="status">
              Checking your current library…
            </p>
          )}
          <div className="backup-options">
            <label>
              <input
                type="checkbox"
                checked={overwrite}
                disabled={restore.isPending}
                onChange={(event) => setOverwrite(event.target.checked)}
              />{" "}
              <span>
                Replace matching stories and recommendation dismissals with
                backup versions
              </span>
            </label>
            <label>
              <input
                type="checkbox"
                checked={includePreferences}
                disabled={restore.isPending}
                onChange={(event) =>
                  setIncludePreferences(event.target.checked)
                }
              />{" "}
              <span>Restore the backup’s taste profile</span>
            </label>
          </div>
          <p className="muted">
            New stories and dismissals are added. Existing entries and your
            taste profile are kept unless you select the options above.
          </p>
          {library.isError && (
            <ErrorState
              message={library.error.message}
              retry={() => void library.refetch()}
            />
          )}
          {preview.dismissals > 0 && feedback.isError && (
            <ErrorState
              message={feedback.error.message}
              retry={() => void feedback.refetch()}
            />
          )}
          <button
            className="btn btn-primary btn-small"
            disabled={restore.isPending || !previewReady}
            onClick={() =>
              restore.mutate({
                backup: file.backup,
                overwrite,
                includePreferences,
              })
            }
          >
            {restore.isPending ? "Restoring…" : "Restore backup"}
          </button>
        </div>
      )}
      {restore.isError && <ErrorState message={restore.error.message} />}
      {restore.isSuccess ? (
        <p className="backup-result" role="status">
          Backup restored. {restore.data.added.toLocaleString()} added ·{" "}
          {restore.data.updated.toLocaleString()} replaced ·{" "}
          {restore.data.kept.toLocaleString()} kept.
          {restore.variables?.includePreferences && " Taste profile restored."}
        </p>
      ) : (
        download.isSuccess && (
          <p className="backup-result" role="status">
            Backup downloaded.
          </p>
        )
      )}
    </section>
  );
}
