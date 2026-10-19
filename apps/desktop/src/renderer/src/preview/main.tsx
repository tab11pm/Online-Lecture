import { createRoot } from 'react-dom/client';
import '@fontsource/golos-text/400.css';
import '@fontsource/golos-text/500.css';
import '@fontsource/golos-text/600.css';
import '@fontsource/source-serif-4/400.css';
import '@fontsource/source-serif-4/600.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '../styles.css';
import './preview.css';
import { installMock } from './mock-api';
import { PreviewDock } from './PreviewDock';
import { scenarios } from './scenarios';
import type { PreviewAction } from './scenarios';
import { setThemeMode } from '../theme';

const params = new URLSearchParams(window.location.search);
const screenId = params.get('screen') ?? 'welcome';
const showDock = params.get('dock') !== '0';
const themeParam = params.get('theme');
if (
  themeParam === 'light' ||
  themeParam === 'dark' ||
  themeParam === 'system'
) {
  setThemeMode(themeParam);
}
const scenario = scenarios[screenId] ?? scenarios.welcome!;

installMock(scenario);

if (showDock) {
  document.body.classList.add('has-preview');
}

const rootElement = document.getElementById('root');

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function findClickable(text: string): HTMLElement | undefined {
  const nodes = [
    ...document.querySelectorAll<HTMLElement>('button, summary, a, label'),
  ];
  return (
    nodes.find((node) => node.textContent?.trim() === text) ??
    nodes.find((node) => node.textContent?.includes(text)) ??
    nodes.find((node) => node.getAttribute('aria-label') === text) ??
    nodes.find((node) => node.getAttribute('aria-label')?.includes(text))
  );
}

async function clickText(text: string): Promise<void> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const node = findClickable(text);
    if (node) {
      node.click();
      return;
    }
    await sleep(80);
  }
}

function fillField(label: string, value: string): void {
  const labels = [...document.querySelectorAll<HTMLLabelElement>('label')];
  const target =
    labels.find((node) => node.textContent?.trim() === label) ??
    labels.find((node) => node.textContent?.includes(label));
  const input = target?.htmlFor
    ? document.getElementById(target.htmlFor)
    : target?.querySelector('input, textarea, select');
  if (
    !(input instanceof HTMLInputElement) &&
    !(input instanceof HTMLTextAreaElement)
  ) {
    return;
  }
  const prototype =
    input instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

async function runActions(actions: PreviewAction[]): Promise<void> {
  await sleep(250);
  for (const action of actions) {
    await sleep(action.delay ?? 140);
    if (action.kind === 'click') {
      await clickText(action.text);
    } else {
      fillField(action.label, action.value);
    }
  }
}

if (rootElement) {
  void import('../App').then(({ App }) => {
    createRoot(rootElement).render(
      <>
        <App />
        {showDock ? <PreviewDock current={screenId} /> : null}
      </>,
    );
    void runActions(scenario.actions ?? []);
  });
}
