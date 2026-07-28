'use client';

import { useEffect, useState } from 'react';

export type ToastType = 'success' | 'error';

export interface ToastMessage {
  id: number;
  text: string;
  type: ToastType;
}

let _id = 0;
export function makeToast(text: string, type: ToastType = 'success'): ToastMessage {
  return { id: ++_id, text, type };
}

export function ToastContainer({ toasts, onRemove }: {
  toasts: ToastMessage[];
  onRemove: (id: number) => void;
}) {
  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onRemove={onRemove} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onRemove }: { toast: ToastMessage; onRemove: (id: number) => void }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(() => onRemove(toast.id), 300);
    }, 3000);
    return () => clearTimeout(timer);
  }, [toast.id, onRemove]);

  const base = 'pointer-events-auto px-4 py-2 rounded shadow text-sm text-white transition-opacity duration-300';
  const color = toast.type === 'success' ? 'bg-green-600' : 'bg-red-600';

  return (
    <div className={`${base} ${color} ${visible ? 'opacity-100' : 'opacity-0'}`}>
      {toast.text}
    </div>
  );
}

export function useToast() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  function addToast(text: string, type: ToastType = 'success') {
    setToasts((prev) => [...prev, makeToast(text, type)]);
  }

  function removeToast(id: number) {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }

  return { toasts, addToast, removeToast };
}
