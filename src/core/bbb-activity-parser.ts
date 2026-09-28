import { JSDOM } from 'jsdom';

/**
 * BbbActivityParser - Parses BBB activity page HTML to extract join information
 *
 * Responsibilities:
 * - Detect if activity is a lecture (requires group selection) or practical
 * - Extract the join button/link from HTML
 * - Find group selection dropdown if present
 * - Generate CSS/XPath selectors for Playwright automation
 */
export class BbbActivityParser {
  private html: string;
  private activityUrl: string;
  private dom: JSDOM;
  private document: Document;

  constructor(html: string, activityUrl: string) {
    this.html = html;
    this.activityUrl = activityUrl;
    this.dom = new JSDOM(html);
    this.document = this.dom.window.document;
  }

  /**
   * Check if this is a lecture activity (requires group selection)
   */
  isLecture(): boolean {
    // Lectures typically have a group selection dropdown or "select all groups" message
    return this.hasGroupSelectionDropdown() || this.hasGroupSelectionMessage();
  }

  /**
   * More robust check: does page require group selection before joining?
   */
  requiresGroupSelection(): boolean {
    // Check for group selection elements
    return this.hasGroupSelectionDropdown() || this.hasGroupSelectionMessage();
  }

  /**
   * Get available group options from dropdown
   */
  getGroupOptions(): string[] {
    const select = this.document.querySelector('select[name*="group"]');
    if (!select) {
      return [];
    }

    const options: string[] = [];
    select.querySelectorAll('option').forEach((option) => {
      const text = (option as HTMLOptionElement).textContent?.trim();
      // Skip empty options and "-- No group --" placeholders
      if (text && text !== '--' && !text.startsWith('-- ')) {
        options.push(text);
      }
    });

    return options;
  }

  /**
   * Extract the BBB meeting URL or join button information
   * Handles multiple common patterns in Moodle BBB modules
   */
  getJoinUrl(): string {
    let url: string | null = null;

    // Pattern 1: Direct link in <a> tag
    const joinLink = this.document.querySelector(
      'a[href*="bigbluebuttonbn"][href*="action=join"]'
    ) as HTMLAnchorElement;
    if (joinLink?.href) {
      url = joinLink.href;
    }

    // Pattern 2: Form-based join (hidden fields)
    if (!url) {
      const joinForm = this.document.querySelector(
        'form[action*="bigbluebuttonbn"]'
      ) as HTMLFormElement;
      if (joinForm) {
        const action = joinForm.getAttribute('action');
        if (action) {
          url = action;
        }
      }
    }

    // Pattern 3: JavaScript onclick with URL
    if (!url) {
      const joinButton = this.document.querySelector('[onclick*="join"]') as HTMLElement;
      if (joinButton) {
        const onclick = joinButton.getAttribute('onclick') || '';
        const pattern = /(['"])([^'"]*bigbluebuttonbn[^'"]*)\1/;
        const urlMatch = onclick.match(pattern);
        if (urlMatch?.[2]) {
          url = urlMatch[2];
        }
      }
    }

    // Pattern 4: Data attribute (newer Moodle versions)
    if (!url) {
      const joinContainer = this.document.querySelector('[data-meeting-url]') as HTMLElement;
      if (joinContainer) {
        url = joinContainer.getAttribute('data-meeting-url');
      }
    }

    // Fallback: look for any link with 'join' or 'meeting' text
    if (!url) {
      const fallbackLink = Array.from(this.document.querySelectorAll('a')).find((a) => {
        const text = (a.textContent || '').toLowerCase();
        return text.includes('join') || text.includes('meeting') || text.includes('подключ');
      }) as HTMLAnchorElement;

      if (fallbackLink?.href) {
        url = fallbackLink.href;
      }
    }

    if (!url) {
      throw new Error(
        'Could not find BBB join URL in activity page. ' +
        'Page may not be loaded or BBB module structure is unknown.'
      );
    }

    // Always resolve URLs to absolute form
    return this.resolveUrl(url);
  }

  /**
   * Get CSS selector for the join button (for Playwright automation)
   */
  getJoinButtonSelector(): string {
    // Try common selectors in order of specificity
    const selectors = [
      // Direct BBB join link
      'a[href*="bigbluebuttonbn"][href*="action=join"]',
      // Join button with specific class
      'button.btn-join, button.btn-primary:has-text("join")',
      // Button or link with join text
      'button:has-text("подключиться"), button:has-text("Join")',
      'a:has-text("подключиться"), a:has-text("Join")',
      // Form submit button
      'form[action*="bigbluebuttonbn"] button[type="submit"]',
    ];

    for (const selector of selectors) {
      try {
        if (this.document.querySelector(selector)) {
          return selector;
        }
      } catch (e) {
        // Selector might be invalid CSS, skip it
        continue;
      }
    }

    // Fallback: generic selector that should work
    return 'a[href*="bigbluebuttonbn"], button:contains("Join"), button:contains("join")';
  }

  /**
   * Extract meeting ID from activity page if available
   */
  getMeetingId(): string | null {
    // Try to extract from various common patterns
    const patterns = [
      /meetingid[=:][ ]*["']?(\d+)["']?/i,
      /meetingID[=:][ ]*["']?([a-f0-9]+)["']?/i,
      /data-meeting-id[=:][ ]*["']?([a-f0-9\d-]+)["']?/i,
    ];

    for (const pattern of patterns) {
      const match = this.html.match(pattern);
      if (match?.[1]) {
        return match[1];
      }
    }

    return null;
  }

  /**
   * Check if page contains "all groups" or similar message (typical for lectures)
   */
  private hasGroupSelectionMessage(): boolean {
    const textContent = this.document.body.textContent || '';
    const lowerText = textContent.toLowerCase();

    return (
      lowerText.includes('all groups') ||
      lowerText.includes('все группы') ||
      lowerText.includes('select group') ||
      lowerText.includes('выберите группу')
    );
  }

  /**
   * Check if page has a group selection dropdown
   */
  private hasGroupSelectionDropdown(): boolean {
    // Look for select element with group-related name
    const groupSelects = this.document.querySelectorAll(
      'select[name*="group"], select[id*="group"]'
    );
    return groupSelects.length > 0;
  }

  /**
   * Resolve relative URLs to absolute
   */
  private resolveUrl(url: string): string {
    try {
      // If URL starts with http, it's already absolute
      if (url.startsWith('http://') || url.startsWith('https://')) {
        return url;
      }
      // Otherwise resolve relative to the activity URL
      return new URL(url, this.activityUrl).toString();
    } catch (e) {
      // If URL parsing fails, return as-is (might be a relative path)
      return url;
    }
  }

  /**
   * Get full page HTML for debugging
   */
  getHtml(): string {
    return this.html;
  }

  /**
   * Extract text content (useful for debugging)
   */
  getTextContent(): string {
    return this.document.body.textContent || '';
  }
}
