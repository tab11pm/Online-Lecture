export type BrowserChoice = 'edge' | 'chromium';

export type BrowserInstallState = {
  status: 'available' | 'missing' | 'installing' | 'error';
  message?: string;
};

export function browserChannel(choice: BrowserChoice): 'msedge' | undefined {
  return choice === 'edge' ? 'msedge' : undefined;
}
