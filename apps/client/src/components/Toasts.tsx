import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from "react";

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
  const dismiss = useCallback(
    (id: number) => setToasts((all) => all.filter((t) => t.id !== id)),
    [],
  );
  const show = useCallback<ShowToast>(
    (message, action) => {
      const id = ++nextId.current;
      setToasts((all) => [...all.slice(-2), { id, message, action }]);
      setTimeout(() => dismiss(id), action ? 7000 : 3500);
    },
    [dismiss],
  );
  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div className="toast" key={toast.id}>
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
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
