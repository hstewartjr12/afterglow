import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { AnimatePresence } from "motion/react";
import * as m from "motion/react-m";
import { useReducedMotion } from "../lib/motion";

type Toast = {
  id: number;
  message: string;
  action?: { label: string; run: () => void };
};
type ShowToast = (message: string, action?: Toast["action"]) => void;

const ToastContext = createContext<ShowToast>(() => {});
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const reduced = useReducedMotion();
  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach(clearTimeout);
      pending.clear();
    };
  }, []);
  const dismiss = useCallback((id: number) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setToasts((all) => all.filter((t) => t.id !== id));
  }, []);
  const show = useCallback<ShowToast>(
    (message, action) => {
      const id = ++nextId.current;
      setToasts((all) => [...all.slice(-2), { id, message, action }]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), action ? 7000 : 3500),
      );
    },
    [dismiss],
  );
  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        <AnimatePresence initial={false}>
          {toasts.map((toast) => (
            <m.div
              className="toast"
              key={toast.id}
              layout={!reduced}
              initial={reduced ? false : { opacity: 0, y: 16, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{
                opacity: 0,
                y: reduced ? 0 : 8,
                transition: { duration: reduced ? 0 : 0.18 },
              }}
              transition={{
                duration: reduced ? 0 : 0.3,
                ease: [0.2, 0.7, 0.2, 1],
              }}
            >
              <p>{toast.message}</p>
              {toast.action && (
                <button
                  className="toast-action"
                  onClick={() => {
                    toast.action!.run();
                    dismiss(toast.id);
                  }}
                >
                  {toast.action.label}
                </button>
              )}
              <button aria-label="Dismiss" onClick={() => dismiss(toast.id)}>
                ✕
              </button>
            </m.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
