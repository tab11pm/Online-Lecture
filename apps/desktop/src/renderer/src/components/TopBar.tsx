import {
  BookOpen,
  CircleCheck,
  LockKeyhole,
  Monitor,
  Moon,
  Sun,
} from 'lucide-react';
import { useThemeMode } from '../theme';
import type { ThemeMode } from '../theme';

const themes: Array<[ThemeMode, string, string, typeof Sun]> = [
  ['light', 'Светлая', 'Светлая тема', Sun],
  ['dark', 'Тёмная', 'Тёмная тема', Moon],
  ['system', 'Авто', 'Как в системе', Monitor],
];

export interface TopBarProps {
  sessionReady: boolean;
}

export function TopBar({ sessionReady }: TopBarProps) {
  const [theme, setTheme] = useThemeMode();
  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand__mark" aria-hidden="true">
          <BookOpen size={17} strokeWidth={1.8} />
        </span>
        <span className="brand__text">
          <span className="brand__name">Online Lecture</span>
          <span className="brand__meta">ТУСУР · локально</span>
        </span>
      </div>
      <div className="topbar__right">
        <div className="theme-switch" role="group" aria-label="Тема оформления">
          {themes.map(([value, label, title, Icon]) => (
            <button
              key={value}
              type="button"
              title={title}
              aria-pressed={theme === value}
              onClick={() => setTheme(value)}
            >
              <Icon size={12} strokeWidth={1.8} aria-hidden="true" />
              <span>{label}</span>
            </button>
          ))}
        </div>
        {sessionReady ? (
          <span className="session">
            <CircleCheck size={13} strokeWidth={1.8} aria-hidden="true" />
            Сессия активна.
          </span>
        ) : (
          <span className="topbar__note">
            <LockKeyhole size={12} strokeWidth={1.8} aria-hidden="true" />
            Данные остаются на этом компьютере
          </span>
        )}
      </div>
    </header>
  );
}
