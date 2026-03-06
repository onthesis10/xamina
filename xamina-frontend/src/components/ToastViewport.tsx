import { useEffect } from "react";

import { useToastStore } from "@/store/toast.store";

function ToastRow({ id, type, message }: { id: string; type: "success" | "error" | "info"; message: string }) {
  const remove = useToastStore((s) => s.remove);

  useEffect(() => {
    const timer = window.setTimeout(() => remove(id), 3500);
    return () => window.clearTimeout(timer);
  }, [id, remove]);

  return (
    <div className={`toast-row toast-${type}`}>
      <span>{message}</span>
      <button className="btn btn-ghost" onClick={() => remove(id)}>x</button>
    </div>
  );
}

export function ToastViewport() {
  const items = useToastStore((s) => s.items);
  if (items.length === 0) return null;

  return (
    <section className="toast-viewport" aria-live="polite" aria-atomic="true">
      {items.map((item) => (
        <ToastRow key={item.id} id={item.id} type={item.type} message={item.message} />
      ))}
    </section>
  );
}
