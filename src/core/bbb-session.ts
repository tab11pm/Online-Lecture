import { chromium, Browser, Page } from 'playwright';
import type { SessionConfig, BbbSession, SessionState } from './types.js';

/**
 * Manages BigBlueButton sessions using Playwright
 */
export class PlaywrightBbbSessionManager {
  private browser: Browser | null = null;
  private sessions: Map<string, BbbSession> = new Map();

  /**
   * Start a new browser session and navigate to BBB URL
   */
  async startSession(url: string, config: SessionConfig): Promise<BbbSession> {
    this.validateUrl(url);

    this.browser = await chromium.launch({
      headless: config.headless,
    });

    const page = await this.browser.newPage();

    const session: BbbSession = {
      page,
      status: 'starting',
      url,
      startedAt: new Date(),
    };

    try {
      await page.goto(url, { waitUntil: 'networkidle' });
      session.status = 'started';
      this.sessions.set(url, session);
      return session;
    } catch (error) {
      session.status = 'error';
      await page.close();
      throw new Error(
        `Failed to start session: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Join the session as a listener (audio only, no video)
   */
  async joinAsListener(session: BbbSession): Promise<void> {
    if (session.status !== 'started') {
      throw new Error(
        `Cannot join: session status is ${session.status}, expected 'started'`
      );
    }

    session.status = 'joining';

    try {
      // Wait for the join screen to load
      await session.page.waitForSelector('button:has-text("Listen Only")', {
        timeout: 10000,
      });

      // Disable camera and microphone before joining
      await this.disableMediaDevices(session.page);

      // Click "Listen Only" button
      await session.page.click('button:has-text("Listen Only")');

      // Wait for connection to establish
      await session.page.waitForSelector('[data-testid="audio-connected"]', {
        timeout: 15000,
      });

      session.status = 'joined';
    } catch (error) {
      session.status = 'error';
      throw new Error(
        `Failed to join as listener: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Monitor the session state
   */
  async monitorSession(session: BbbSession): Promise<SessionState> {
    if (session.status !== 'joined') {
      throw new Error(
        `Cannot monitor: session status is ${session.status}, expected 'joined'`
      );
    }

    session.status = 'monitoring';

    try {
      // Get current meeting status
      const meetingStatus = await session.page.evaluate(() => {
        // Check if user is still in the meeting
        const disconnectButton = document.querySelector(
          '[data-testid="leave-button"]'
        );
        if (!disconnectButton) {
          return 'ended';
        }

        // Check audio status
        const audioIndicator = document.querySelector(
          '[data-testid="audio-connected"]'
        );
        return audioIndicator ? 'connected' : 'error';
      });

      return {
        isConnected: meetingStatus === 'connected',
        isAudioEnabled: true,
        isVideoEnabled: false,
        meetingStatus:
          (meetingStatus as 'connected' | 'ended' | 'error') || 'error',
      };
    } catch (error) {
      session.status = 'error';
      throw new Error(
        `Failed to monitor session: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Leave the session and close the browser
   */
  async leaveSession(session: BbbSession): Promise<void> {
    session.status = 'leaving';

    try {
      // Look for leave button
      const leaveButton = await session.page.$('[data-testid="leave-button"]');

      if (leaveButton) {
        await leaveButton.click();
        // Wait a moment for the leave action to complete
        await session.page.waitForTimeout(1000);
      }

      session.status = 'left';
    } catch (error) {
      console.warn(
        `Warning while leaving session: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      session.status = 'left';
    } finally {
      // Always close the page and browser
      try {
        await session.page.close();
      } catch (e) {
        // Ignore errors during page close
      }

      if (this.browser) {
        await this.browser.close();
        this.browser = null;
      }

      this.sessions.delete(session.url);
    }
  }

  /**
   * Disable camera and microphone for the session
   */
  private async disableMediaDevices(page: Page): Promise<void> {
    // Override getUserMedia to return empty streams
    await page.addInitScript(() => {
      const originalGetUserMedia =
        navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);

      navigator.mediaDevices.getUserMedia = async (constraints) => {
        const stream = new MediaStream();

        // If video was requested, add a black video track
        if ((constraints as any).video) {
          const canvas = document.createElement('canvas');
          canvas.width = 320;
          canvas.height = 240;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.fillStyle = 'black';
            ctx.fillRect(0, 0, 320, 240);
          }
          const videoTrack = canvas.captureStream(30).getVideoTracks()[0];
          if (videoTrack) {
            stream.addTrack(videoTrack);
          }
        }

        // If audio was requested, add a silent audio track
        if ((constraints as any).audio) {
          const audioContext = new AudioContext();
          const oscillator = audioContext.createOscillator();
          const gain = audioContext.createGain();
          gain.gain.setValueAtTime(0, audioContext.currentTime); // Mute
          oscillator.connect(gain);
          gain.connect(audioContext.destination);
          const dest = audioContext.createMediaStreamDestination();
          const audioTrack = dest.stream.getAudioTracks()[0];
          if (audioTrack) {
            stream.addTrack(audioTrack);
          }
        }

        return stream;
      };
    });
  }

  /**
   * Validate BBB URL format
   */
  private validateUrl(url: string): void {
    try {
      const parsed = new URL(url);
      if (!parsed.hostname.includes('bbb') && !parsed.hostname.includes('tusur')) {
        throw new Error('URL does not appear to be a BigBlueButton instance');
      }
    } catch (error) {
      throw new Error(`Invalid URL: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Close all open sessions
   */
  async closeAll(): Promise<void> {
    for (const [, session] of this.sessions) {
      try {
        await this.leaveSession(session);
      } catch (error) {
        console.warn(
          `Error closing session ${session.url}: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }
  }
}