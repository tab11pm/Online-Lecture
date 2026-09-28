import { describe, it, expect } from 'vitest';
import { BbbActivityParser } from '../../src/core/bbb-activity-parser.js';

describe('BbbActivityParser', () => {
  describe('Lecture detection (group selection required)', () => {
    it('should detect lecture activity with group dropdown', () => {
      const html = `
        <html>
          <body>
            <h1>Lecture 1: Introduction</h1>
            <div class="activity-info">
              <p>Select all groups before joining:</p>
              <select name="group" id="group-select">
                <option value="">-- No group --</option>
                <option value="1">Group 1</option>
                <option value="2">Group 2</option>
              </select>
              <button onclick="joinMeeting()">Join Meeting</button>
            </div>
          </body>
        </html>
      `;

      const parser = new BbbActivityParser(html, 'https://sdo.tusur.ru/mod/bigbluebuttonbn/view.php?id=123');
      expect(parser.isLecture()).toBe(true);
    });

    it('should detect lecture with "all groups" message', () => {
      const html = `
        <html>
          <body>
            <h1>Lecture: Operating Systems</h1>
            <div class="status">
              <p>Please select all groups before joining the meeting.</p>
              <a href="https://sdo.tusur.ru/mod/bigbluebuttonbn/view.php?id=123&action=join">
                Join Meeting
              </a>
            </div>
          </body>
        </html>
      `;

      const parser = new BbbActivityParser(html, 'https://sdo.tusur.ru/mod/bigbluebuttonbn/view.php?id=123');
      expect(parser.isLecture()).toBe(true);
    });

    it('should detect Russian lecture message "все группы"', () => {
      const html = `
        <html>
          <body>
            <h1>Лекция: Операционные системы</h1>
            <div class="info">
              <p>Пожалуйста выберите все группы перед подключением к сеансу.</p>
              <a href="view.php?id=123&action=join">Подключиться</a>
            </div>
          </body>
        </html>
      `;

      const parser = new BbbActivityParser(html, 'https://sdo.tusur.ru/mod/bigbluebuttonbn/view.php?id=123');
      expect(parser.isLecture()).toBe(true);
    });
  });

  describe('Practical detection (no group selection needed)', () => {
    it('should detect practical activity without group dropdown', () => {
      const html = `
        <html>
          <body>
            <h1>Practical 1: Lab Exercise</h1>
            <div class="activity-info">
              <p>Join the meeting to participate:</p>
              <a href="https://sdo.tusur.ru/mod/bigbluebuttonbn/view.php?id=124&action=join">
                Join Meeting
              </a>
            </div>
          </body>
        </html>
      `;

      const parser = new BbbActivityParser(html, 'https://sdo.tusur.ru/mod/bigbluebuttonbn/view.php?id=124');
      expect(parser.isLecture()).toBe(false);
    });
  });

  describe('Group option extraction', () => {
    it('should extract all group options from dropdown', () => {
      const html = `
        <html>
          <body>
            <select name="group" id="group-select">
              <option value="">-- No group --</option>
              <option value="1">Group 1 (Monday)</option>
              <option value="2">Group 2 (Tuesday)</option>
              <option value="3">Group 3 (Wednesday)</option>
            </select>
          </body>
        </html>
      `;

      const parser = new BbbActivityParser(html, 'https://sdo.tusur.ru/mod/bigbluebuttonbn/view.php?id=123');
      const groups = parser.getGroupOptions();

      expect(groups).toHaveLength(3);
      expect(groups).toContain('Group 1 (Monday)');
      expect(groups).toContain('Group 2 (Tuesday)');
      expect(groups).toContain('Group 3 (Wednesday)');
    });

    it('should return empty array if no group dropdown exists', () => {
      const html = `
        <html>
          <body>
            <h1>Practical: No groups</h1>
            <a href="view.php?id=124&action=join">Join</a>
          </body>
        </html>
      `;

      const parser = new BbbActivityParser(html, 'https://sdo.tusur.ru/mod/bigbluebuttonbn/view.php?id=124');
      expect(parser.getGroupOptions()).toEqual([]);
    });
  });

  describe('Join URL extraction', () => {
    it('should extract direct join link from href attribute', () => {
      const html = `
        <html>
          <body>
            <a href="https://sdo.tusur.ru/mod/bigbluebuttonbn/view.php?id=123&action=join">
              Join Meeting
            </a>
          </body>
        </html>
      `;

      const parser = new BbbActivityParser(html, 'https://sdo.tusur.ru/mod/bigbluebuttonbn/view.php?id=123');
      const url = parser.getJoinUrl();

      expect(url).toContain('bigbluebuttonbn');
      expect(url).toContain('action=join');
    });

    it('should extract join URL from form action', () => {
      const html = `
        <html>
          <body>
            <form action="/mod/bigbluebuttonbn/view.php?id=123&action=join" method="POST">
              <input type="hidden" name="meeting_id" value="abc123" />
              <button type="submit">Join Meeting</button>
            </form>
          </body>
        </html>
      `;

      const parser = new BbbActivityParser(html, 'https://sdo.tusur.ru/mod/bigbluebuttonbn/view.php?id=123');
      const url = parser.getJoinUrl();

      expect(url).toContain('bigbluebuttonbn');
      expect(url).toContain('action=join');
    });

    it('should extract URL from data attribute (modern Moodle)', () => {
      const html = `
        <html>
          <body>
            <div class="bigbluebuttonbn-join" data-meeting-url="https://bbb.example.com/b/meeting123">
              <button onclick="window.location=this.parentElement.dataset.meetingUrl">
                Join Meeting
              </button>
            </div>
          </body>
        </html>
      `;

      const parser = new BbbActivityParser(html, 'https://sdo.tusur.ru/mod/bigbluebuttonbn/view.php?id=123');
      const url = parser.getJoinUrl();

      expect(url).toContain('bbb.example.com');
      expect(url).toContain('meeting123');
    });

    it('should resolve relative URLs to absolute', () => {
      const html = `
        <html>
          <body>
            <a href="view.php?id=123&action=join">Join Meeting</a>
          </body>
        </html>
      `;

      const parser = new BbbActivityParser(
        html,
        'https://sdo.tusur.ru/mod/bigbluebuttonbn/view.php?id=456'
      );
      const url = parser.getJoinUrl();

      expect(url).toContain('https://');
      expect(url).toContain('sdo.tusur.ru');
    });

    it('should throw error if no join URL found', () => {
      const html = `
        <html>
          <body>
            <h1>Meeting not available</h1>
            <p>This meeting has ended.</p>
          </body>
        </html>
      `;

      const parser = new BbbActivityParser(html, 'https://sdo.tusur.ru/mod/bigbluebuttonbn/view.php?id=123');

      expect(() => parser.getJoinUrl()).toThrow();
    });
  });

  describe('Join button selector generation', () => {
    it('should return valid CSS selector for direct link', () => {
      const html = `
        <html>
          <body>
            <a href="https://sdo.tusur.ru/mod/bigbluebuttonbn/view.php?id=123&action=join">
              Join Meeting
            </a>
          </body>
        </html>
      `;

      const parser = new BbbActivityParser(html, 'https://sdo.tusur.ru/mod/bigbluebuttonbn/view.php?id=123');
      const selector = parser.getJoinButtonSelector();

      expect(typeof selector).toBe('string');
      expect(selector.length).toBeGreaterThan(0);
      // Should contain bigbluebuttonbn reference
      expect(selector.toLowerCase()).toContain('bigbluebuttonbn');
    });

    it('should return fallback selector if specific patterns not found', () => {
      const html = `
        <html>
          <body>
            <div>Some content</div>
          </body>
        </html>
      `;

      const parser = new BbbActivityParser(html, 'https://sdo.tusur.ru/mod/bigbluebuttonbn/view.php?id=123');
      const selector = parser.getJoinButtonSelector();

      // Should return a string that looks like a selector
      expect(typeof selector).toBe('string');
      expect(selector.length).toBeGreaterThan(0);
    });
  });

  describe('Meeting ID extraction', () => {
    it('should extract meeting ID from data attribute', () => {
      const html = `
        <html>
          <body>
            <div data-meeting-id="abc123def456">Join Meeting</div>
          </body>
        </html>
      `;

      const parser = new BbbActivityParser(html, 'https://sdo.tusur.ru/mod/bigbluebuttonbn/view.php?id=123');
      const meetingId = parser.getMeetingId();

      expect(meetingId).toBe('abc123def456');
    });

    it('should extract numeric meeting ID', () => {
      const html = `
        <html>
          <body>
            <div>meetingid=123456</div>
          </body>
        </html>
      `;

      const parser = new BbbActivityParser(html, 'https://sdo.tusur.ru/mod/bigbluebuttonbn/view.php?id=123');
      const meetingId = parser.getMeetingId();

      expect(meetingId).toBe('123456');
    });

    it('should return null if meeting ID not found', () => {
      const html = `
        <html>
          <body>
            <h1>No Meeting Info</h1>
          </body>
        </html>
      `;

      const parser = new BbbActivityParser(html, 'https://sdo.tusur.ru/mod/bigbluebuttonbn/view.php?id=123');
      const meetingId = parser.getMeetingId();

      expect(meetingId).toBeNull();
    });
  });

  describe('requiresGroupSelection method', () => {
    it('should return true for activities requiring group selection', () => {
      const html = `
        <html>
          <body>
            <select name="group">
              <option value="1">Group 1</option>
            </select>
          </body>
        </html>
      `;

      const parser = new BbbActivityParser(html, 'https://sdo.tusur.ru/mod/bigbluebuttonbn/view.php?id=123');
      expect(parser.requiresGroupSelection()).toBe(true);
    });

    it('should return false for activities not requiring group selection', () => {
      const html = `
        <html>
          <body>
            <a href="view.php?id=124&action=join">Join</a>
          </body>
        </html>
      `;

      const parser = new BbbActivityParser(html, 'https://sdo.tusur.ru/mod/bigbluebuttonbn/view.php?id=124');
      expect(parser.requiresGroupSelection()).toBe(false);
    });
  });

  describe('Content access methods', () => {
    it('should provide raw HTML access for debugging', () => {
      const testHtml = '<html><body>Test content</body></html>';
      const parser = new BbbActivityParser(testHtml, 'https://sdo.tusur.ru/mod/bigbluebuttonbn/view.php?id=123');

      const html = parser.getHtml();
      expect(html).toContain('Test content');
    });

    it('should provide text content extraction', () => {
      const html = `
        <html>
          <body>
            <h1>Lecture Title</h1>
            <p>Meeting starts at 10:00 AM</p>
          </body>
        </html>
      `;

      const parser = new BbbActivityParser(html, 'https://sdo.tusur.ru/mod/bigbluebuttonbn/view.php?id=123');
      const text = parser.getTextContent();

      expect(text).toContain('Lecture Title');
      expect(text).toContain('Meeting starts');
    });
  });

  describe('Real-world HTML samples', () => {
    it('should handle typical Moodle BigBlueButton lecture HTML', () => {
      const html = `
        <!DOCTYPE html>
        <html>
          <head><title>BigBlueButton Activity</title></head>
          <body>
            <div class="mod-bigbluebuttonbn">
              <h1 class="activity-title">Lecture 1: Database Fundamentals</h1>
              
              <div class="join-container">
                <p>To join this meeting, select all groups:</p>
                <select id="user-groups" name="group">
                  <option value="">-- Select group --</option>
                  <option value="1">1. Monday 9:00-10:30</option>
                  <option value="2">2. Tuesday 13:00-14:30</option>
                  <option value="3">3. Wednesday 15:00-16:30</option>
                </select>
                
                <a href="view.php?id=579920&group=0&action=join" class="btn btn-primary">
                  Join Meeting
                </a>
              </div>
            </div>
          </body>
        </html>
      `;

      const parser = new BbbActivityParser(
        html,
        'https://sdo.tusur.ru/mod/bigbluebuttonbn/view.php?id=579920'
      );

      expect(parser.isLecture()).toBe(true);
      expect(parser.getGroupOptions()).toContain('1. Monday 9:00-10:30');
      expect(parser.getJoinUrl()).toContain('action=join');
    });

    it('should handle typical practical HTML without groups', () => {
      const html = `
        <!DOCTYPE html>
        <html>
          <head><title>BBB Practical</title></head>
          <body>
            <div class="mod-bigbluebuttonbn">
              <h1>Practical 1: Hands-on Exercise</h1>
              <p>Join the session to start working:</p>
              <a href="https://bbb.tusur.ru/b/meeting123456789" target="_blank">
                Подключиться к сеансу
              </a>
            </div>
          </body>
        </html>
      `;

      const parser = new BbbActivityParser(
        html,
        'https://sdo.tusur.ru/mod/bigbluebuttonbn/view.php?id=579921'
      );

      expect(parser.isLecture()).toBe(false);
      expect(parser.getGroupOptions()).toHaveLength(0);
      expect(parser.getJoinUrl()).toContain('bbb.tusur.ru');
    });
  });
});
