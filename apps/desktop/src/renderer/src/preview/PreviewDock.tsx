import { screens } from './scenarios';

export function PreviewDock({ current }: { current: string }) {
  return (
    <nav className="preview-dock" aria-label="Экраны">
      {screens.map(([id, label]) => (
        <a
          key={id}
          href={`?screen=${id}`}
          aria-current={current === id ? 'page' : undefined}
        >
          {label}
        </a>
      ))}
    </nav>
  );
}
