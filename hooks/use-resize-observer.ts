import { useEffect, useState, useRef } from 'react';

export function useResizeObserver<T extends HTMLElement>() {
  const [width, setWidth] = useState<number>(0);
  const ref = useRef<T>(null);

  useEffect(() => {
    if (!ref.current) {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setWidth(entry.contentRect.width);
      }
    });

    observer.observe(ref.current);

    return () => {
      observer.disconnect();
    };
  }, []);

  return { ref, width };
}
