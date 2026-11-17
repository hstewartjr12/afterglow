import {
  backupImportSchema,
  backupSchema,
  feedbackListSchema,
  recommendationFeedbackSchema,
  timestampSchema,
  vndbIdSchema,
  vnSummarySchema,
  MAX_BACKUP_BYTES,
  type Backup,
  type BackupImportInput,
  type BackupImportResult,
  type RecommendationFeedback,
  type VnSummary,
  libraryInputSchema,
  preferencesSchema,
  type LibraryEntry,
  type LibraryInput,
  type Preferences,
} from "@afterglow/shared";
const DB_NAME = "afterglow-demo-v1";
let connection: Promise<IDBDatabase> | undefined;
function openDatabase(): Promise<IDBDatabase> {
  if (connection) return connection;
  connection = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(
        new Error(
          "Browser storage is unavailable. Try a regular browser window.",
        ),
      );
      return;
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("library", { keyPath: "vndbId" });
      request.result.createObjectStore("settings");
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        connection = undefined;
      };
      resolve(db);
    };
    request.onerror = () =>
      reject(
        new Error(
          "The demo could not open browser storage. Check your browser's site permissions.",
        ),
      );
    request.onblocked = () =>
      reject(new Error("Close other Afterglow demo tabs and try again."));
  });
  connection.catch(() => {
    connection = undefined;
  });
  return connection;
}
async function transaction<T>(
  name: string | string[],
  mode: IDBTransactionMode,
  action: (
    tx: IDBTransaction,
    done: (result: T) => void,
    fail: (error: unknown) => void,
  ) => void,
): Promise<T> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(name, mode);
    let result: T;
    tx.oncomplete = () => resolve(result);
    tx.onabort = () =>
      reject(
        new Error(
          "The demo could not save browser data. Check your browser's storage settings.",
        ),
      );
    tx.onerror = () => {}; // The abort handler reports transaction failures after rollback.
    const fail = (error: unknown) => {
      try {
        tx.abort();
      } catch {
        /* Already completed. */
      }
      reject(error);
    };
    try {
      action(
        tx,
        (value) => {
          result = value;
        },
        fail,
      );
    } catch (error) {
      fail(error);
    }
  });
}
const FEEDBACK_KEY = "recommendation-feedback";
const activeFeedback = (items: RecommendationFeedback[]) =>
  items.filter(
    (item) => item.until === null || Date.parse(item.until) > Date.now(),
  );
const parseFeedback = (value: unknown) => {
  const parsed = feedbackListSchema.safeParse(value ?? []);
  if (!parsed.success)
    throw new Error(
      "Your saved recommendation choices could not be read. No data was changed.",
    );
  return activeFeedback(parsed.data);
};
export const storage = {
  library: () =>
    transaction<LibraryEntry[]>("library", "readonly", (tx, done) => {
      const request = tx.objectStore("library").getAll();
      request.onsuccess = () =>
        done(
          (request.result as LibraryEntry[]).sort(
            (a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt),
          ),
        );
    }),
  saveLibrary: (id: string, input: LibraryInput) => {
    if (!vndbIdSchema.safeParse(id).success || input.vn.id !== id)
      return Promise.reject(new Error("Invalid visual novel."));
    const parsed = libraryInputSchema.parse(input);
    return transaction<LibraryEntry>("library", "readwrite", (tx, done) => {
      const store = tx.objectStore("library");
      const request = store.get(id);
      request.onsuccess = () => {
        const previous = request.result as LibraryEntry | undefined;
        const now = new Date().toISOString();
        const entry: LibraryEntry = {
          ...parsed,
          id: previous?.id ?? Number(id.slice(1)),
          vndbId: id,
          createdAt: previous?.createdAt ?? now,
          updatedAt: now,
        };
        store.put(entry);
        done(entry);
      };
    });
  },
  quickWishlist: (vn: VnSummary) => {
    const id = vndbIdSchema.parse(vn.id);
    const parsed = libraryInputSchema.parse({
      status: "wishlist",
      vn: vnSummarySchema.parse(vn),
    });
    return transaction<{ entry: LibraryEntry; created: boolean }>(
      "library",
      "readwrite",
      (tx, done) => {
        const store = tx.objectStore("library");
        const request = store.get(id);
        request.onsuccess = () => {
          if (request.result) {
            done({ entry: request.result, created: false });
            return;
          }
          const now = new Date().toISOString();
          const entry: LibraryEntry = {
            ...parsed,
            id: Number(id.slice(1)),
            vndbId: id,
            createdAt: now,
            updatedAt: now,
          };
          store.add(entry);
          done({ entry, created: true });
        };
      },
    );
  },
  feedback: () =>
    transaction<RecommendationFeedback[]>(
      "settings",
      "readonly",
      (tx, done, fail) => {
        const request = tx.objectStore("settings").get(FEEDBACK_KEY);
        request.onsuccess = () => {
          try {
            done(parseFeedback(request.result));
          } catch (error) {
            fail(error);
          }
        };
      },
    ),
  saveFeedback: (vn: VnSummary, until: string | null) => {
    const id = vndbIdSchema.parse(vn.id);
    vnSummarySchema.parse(vn);
    timestampSchema.nullable().parse(until);
    return transaction<RecommendationFeedback>(
      "settings",
      "readwrite",
      (tx, done, fail) => {
        const store = tx.objectStore("settings");
        const request = store.get(FEEDBACK_KEY);
        request.onsuccess = () => {
          try {
            const previous = parseFeedback(request.result);
            const entry = recommendationFeedbackSchema.parse({
              vndbId: id,
              vn,
              until,
              createdAt:
                previous.find((item) => item.vndbId === id)?.createdAt ??
                new Date().toISOString(),
            });
            store.put(
              [...previous.filter((item) => item.vndbId !== id), entry],
              FEEDBACK_KEY,
            );
            done(entry);
          } catch (error) {
            fail(error);
          }
        };
      },
    );
  },
  removeFeedback: (id: string) => {
    vndbIdSchema.parse(id);
    return transaction<void>("settings", "readwrite", (tx, done, fail) => {
      const store = tx.objectStore("settings");
      const request = store.get(FEEDBACK_KEY);
      request.onsuccess = () => {
        try {
          store.put(
            parseFeedback(request.result).filter((item) => item.vndbId !== id),
            FEEDBACK_KEY,
          );
          done();
        } catch (error) {
          fail(error);
        }
      };
    });
  },
  backup: () =>
    transaction<Backup>(
      ["library", "settings"],
      "readonly",
      (tx, done, fail) => {
        const library = tx.objectStore("library").getAll();
        const preferences = tx.objectStore("settings").get("preferences");
        const feedback = tx.objectStore("settings").get(FEEDBACK_KEY);
        let pending = 3;
        const complete = () => {
          if (--pending) return;
          try {
            done(
              backupSchema.parse({
                kind: "afterglow-backup",
                version: 1,
                exportedAt: new Date().toISOString(),
                library: library.result,
                preferences: preferencesSchema.parse(preferences.result ?? {}),
                feedback: parseFeedback(feedback.result),
              }),
            );
          } catch {
            fail(
              new Error(
                "Your saved data could not be read as a complete backup. No data was changed.",
              ),
            );
          }
        };
        library.onsuccess = complete;
        preferences.onsuccess = complete;
        feedback.onsuccess = complete;
      },
    ),
  importBackup: (value: BackupImportInput) => {
    const input = backupImportSchema.parse(value);
    if (
      new TextEncoder().encode(JSON.stringify(input.backup)).byteLength >
      MAX_BACKUP_BYTES
    )
      throw new Error("This backup is larger than 10 MB. No data was changed.");
    return transaction<BackupImportResult>(
      ["library", "settings"],
      "readwrite",
      (tx, done, fail) => {
        const library = tx.objectStore("library");
        const settings = tx.objectStore("settings");
        const existing = library.getAll();
        existing.onsuccess = () => {
          try {
            const ids = new Map(
              (existing.result as LibraryEntry[]).map((entry) => [
                entry.vndbId,
                entry.id,
              ]),
            );
            const result = { added: 0, updated: 0, kept: 0 };
            for (const entry of input.backup.library) {
              if (ids.has(entry.vndbId) && !input.overwrite) {
                result.kept++;
                continue;
              }
              library.put({
                ...entry,
                id: ids.get(entry.vndbId) ?? Number(entry.vndbId.slice(1)),
              });
              if (ids.has(entry.vndbId)) result.updated++;
              else result.added++;
            }
            if (input.includePreferences)
              settings.put(input.backup.preferences, "preferences");
            if (input.backup.feedback.length) {
              const request = settings.get(FEEDBACK_KEY);
              request.onsuccess = () => {
                try {
                  const merged = new Map(
                    parseFeedback(request.result).map((entry) => [
                      entry.vndbId,
                      entry,
                    ]),
                  );
                  for (const entry of activeFeedback(input.backup.feedback))
                    if (input.overwrite || !merged.has(entry.vndbId))
                      merged.set(entry.vndbId, entry);
                  settings.put([...merged.values()], FEEDBACK_KEY);
                  done(result);
                } catch (error) {
                  fail(error);
                }
              };
            } else done(result);
          } catch (error) {
            fail(error);
          }
        };
      },
    );
  },
  removeLibrary: (id: string) =>
    transaction<void>("library", "readwrite", (tx, done) => {
      tx.objectStore("library").delete(id);
      done();
    }),
  preferences: () =>
    transaction<Preferences>("settings", "readonly", (tx, done) => {
      const request = tx.objectStore("settings").get("preferences");
      request.onsuccess = () => {
        const parsed = preferencesSchema.safeParse(request.result ?? {});
        done(parsed.success ? parsed.data : preferencesSchema.parse({}));
      };
    }),
  savePreferences: (input: Preferences) => {
    const parsed = preferencesSchema.parse(input);
    return transaction<Preferences>("settings", "readwrite", (tx, done) => {
      tx.objectStore("settings").put(parsed, "preferences");
      done(parsed);
    });
  },
  reset: () =>
    transaction<void>(["library", "settings"], "readwrite", (tx, done) => {
      tx.objectStore("library").clear();
      tx.objectStore("settings").clear();
      done();
    }),
};
