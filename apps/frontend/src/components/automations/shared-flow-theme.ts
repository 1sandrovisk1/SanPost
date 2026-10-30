'use client';
import { useEffect, useState } from 'react';

export function useFlowTheme() {
  const [colorMode, setColorMode] = useState<'dark' | 'light'>('dark');
  useEffect(() => {
    const sync = () =>
      setColorMode(
        document.body.classList.contains('light') ? 'light' : 'dark'
      );
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['class'],
    });
    return () => observer.disconnect();
  }, []);
  return colorMode;
}
