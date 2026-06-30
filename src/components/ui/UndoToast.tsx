"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type UndoableAction = {
  message: string;
  commit: () => Promise<unknown> | unknown;
  undo: () => void;
  onError?: (error: unknown) => void;
};

export function useUndoableAction(delay = 3_000) {
  const [pendingAction, setPendingAction] = useState<UndoableAction | null>(null);
  const pendingRef = useRef<UndoableAction | null>(null);
  const timerRef = useRef<number | null>(null);

  const commit = useCallback(async (action: UndoableAction) => {
    try {
      await action.commit();
    } catch (error) {
      action.undo();
      action.onError?.(error);
    }
  }, []);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const schedule = useCallback((action: UndoableAction) => {
    const previous = pendingRef.current;
    clearTimer();
    if (previous) void commit(previous);

    pendingRef.current = action;
    setPendingAction(action);
    timerRef.current = window.setTimeout(() => {
      pendingRef.current = null;
      timerRef.current = null;
      setPendingAction(null);
      void commit(action);
    }, delay);
  }, [clearTimer, commit, delay]);

  const undo = useCallback(() => {
    const action = pendingRef.current;
    if (!action) return;
    clearTimer();
    pendingRef.current = null;
    setPendingAction(null);
    action.undo();
  }, [clearTimer]);

  useEffect(() => {
    return () => {
      const action = pendingRef.current;
      clearTimer();
      pendingRef.current = null;
      if (action) void action.commit();
    };
  }, [clearTimer]);

  return { pendingAction, schedule, undo };
}

export function UndoToast({ action, onUndo }: { action: UndoableAction | null; onUndo: () => void }) {
  if (!action) return null;

  return (
    <div className="fixed inset-x-4 bottom-24 z-[80] mx-auto flex max-w-md items-center justify-between gap-4 rounded-lg bg-ink px-4 py-3 text-sm font-semibold text-paper shadow-soft lg:bottom-6">
      <span>{action.message}</span>
      <button type="button" onClick={onUndo} className="shrink-0 font-bold text-sun underline underline-offset-4">
        Desfazer
      </button>
    </div>
  );
}
