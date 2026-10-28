'use client';
import { useCallback, useRef, useState } from 'react';
import { usePreventWindowUnload } from '@gitroom/react/helpers/use.prevent.window.unload';
export function useEditorDirty(signature: string, ready = true) {
  const original = useRef<string | undefined>(undefined);
  if (ready && original.current === undefined) original.current = signature;
  const [saved, setSaved] = useState<{ signature?: string }>({});
  const markSaved = useCallback(
    (signature: string) => setSaved({ signature }),
    []
  );
  const resetBaseline = useCallback(() => {
    original.current = undefined;
    setSaved({});
  }, []);
  const dirty = ready && signature !== (saved.signature ?? original.current);
  usePreventWindowUnload(dirty);
  return { dirty, markSaved, resetBaseline };
}
