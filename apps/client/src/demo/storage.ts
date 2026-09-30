import {
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
  action: (tx: IDBTransaction, done: (result: T) => void) => void,
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
    try {
      action(tx, (value) => {
        result = value;
      });
    } catch (error) {
      tx.abort();
      reject(error);
    }
  });
}
export const storage = {
  library: () =>
    transaction<LibraryEntry[]>("library", "readonly", (tx, done) => {
      const request = tx.objectStore("library").getAll();
      request.onsuccess = () =>
        done(
          (request.result as LibraryEntry[]).sort((a, b) =>
            b.updatedAt.localeCompare(a.updatedAt),
          ),
        );
    }),
  saveLibrary: (id: string, input: LibraryInput) => {
    if (!/^v\d+$/.test(id) || input.vn.id !== id)
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
