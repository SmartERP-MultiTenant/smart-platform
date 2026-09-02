import { useEffect, useState } from 'react';

/**
 * Tracks the shell's `dark` class on <html> so ApexCharts options can follow
 * the daisyUI theme (corporate / black) without a global store.
 */
const useIsDark = () => {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const element = document.documentElement;
    const update = () => setIsDark(element.classList.contains('dark'));

    update();

    const observer = new MutationObserver(update);
    observer.observe(element, { attributes: true, attributeFilter: ['class'] });

    return () => observer.disconnect();
  }, []);

  return isDark;
};

export default useIsDark;
