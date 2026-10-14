export type BrowserChoice = 'edge' | 'chromium';

export type BrowserInstallState = {
  status: 'available' | 'missing' | 'installing' | 'error';
  message?: string;
};

export interface BrowserView {
  choice: BrowserChoice;
  install: BrowserInstallState;
  externalChannel?: string;
}

export function browserChannel(choice: BrowserChoice): 'msedge' | undefined {
  return choice === 'edge' ? 'msedge' : undefined;
}
