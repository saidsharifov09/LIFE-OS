// Тема оформления: тёмная (по умолчанию), светлая или «как в системе».
// Хранится в localStorage — это настройка конкретного устройства (iPhone и ноутбук могут отличаться).
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type ThemeMode = 'dark' | 'light' | 'system';

interface ThemeApi {
  mode: ThemeMode;
  setMode: (m: ThemeMode) => void;
  lowBlur: boolean;
  setLowBlur: (v: boolean) => void;
  isDark: boolean;
}

const Ctx = createContext<ThemeApi>(null as unknown as ThemeApi);
export const useTheme = () => useContext(Ctx);

function read(key: string, fallback: string) {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}
function write(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* приватный режим */ }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(() => read('lifeos.theme', 'dark') as ThemeMode);
  const [lowBlur, setLowBlurState] = useState(() => read('lifeos.lowBlur', '0') === '1');
  const [systemDark, setSystemDark] = useState(() => matchMedia('(prefers-color-scheme: dark)').matches);

  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const fn = () => setSystemDark(mq.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);

  const isDark = mode === 'dark' || (mode === 'system' && systemDark);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', isDark ? '#0b1020' : '#f4efe9');
  }, [isDark]);
  useEffect(() => { document.documentElement.classList.toggle('low-blur', lowBlur); }, [lowBlur]);

  return (
    <Ctx.Provider
      value={{
        mode, isDark, lowBlur,
        setMode: (m) => { write('lifeos.theme', m); setModeState(m); },
        setLowBlur: (v) => { write('lifeos.lowBlur', v ? '1' : '0'); setLowBlurState(v); },
      }}
    >
      {children}
    </Ctx.Provider>
  );
}
