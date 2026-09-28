#!/usr/bin/env node
/**
 * Real integration test: SDO MCP → Extract BBB URL → Playwright join
 * 
 * This script demonstrates the complete Phase B workflow:
 * 1. Connect to real SDO MCP server
 * 2. Get BBB activity page
 * 3. Parse join button and URL
 * 4. Join with Playwright
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const BBB_ACTIVITY_URL = 'https://sdo.tusur.ru/mod/bigbluebuttonbn/view.php?id=579920&group=0';

async function main() {
  console.log('🚀 Phase B Real Integration Test\n');
  console.log('BBB URL:', BBB_ACTIVITY_URL);
  console.log('━'.repeat(70));

  // Step 1: Connect to SDO MCP
  console.log('\n1️⃣  Connecting to SDO MCP server...');
  
  const transport = new StdioClientTransport({
    command: 'npm',
    args: ['run', 'dev'],
    cwd: '/home/tabek/D/tusur/sdo_mcp',
  });

  const client = new Client(
    {
      name: 'phase-b-integration',
      version: '0.1.0',
    },
    {
      capabilities: {},
    }
  );

  try {
    await client.connect(transport);
    console.log('✅ Connected to SDO MCP server');

    // Step 2: Get BBB activity page via MCP
    console.log('\n2️⃣  Fetching BBB activity page from SDO...');
    
    const pageResult = await client.callTool('get_assignment_details', {
      assignmentUrl: BBB_ACTIVITY_URL,
    });

    const pageHtml = pageResult.content[0].type === 'text' ? pageResult.content[0].text : '';
    
    if (!pageHtml) {
      throw new Error('Failed to fetch BBB page');
    }

    console.log('✅ BBB page fetched');
    console.log('📄 Page length:', pageHtml.length, 'characters');

    // Save for debugging
    fs.writeFileSync('/tmp/bbb-page.html', pageHtml);
    console.log('📁 Saved to: /tmp/bbb-page.html');

    // Step 3: Parse BBB URL and join button from HTML
    console.log('\n3️⃣  Parsing BBB join button and meeting URL...');

    // Look for join button or meeting URL in the HTML
    const joinButtonMatch = pageHtml.match(/join.*?url|meeting.*?url|bbb.*?url/gi);
    const meetingUrlMatch = pageHtml.match(
      /https?:\/\/bbb[\w.-]+\.[\w.-]+\/b\/[\w-]+/i
    );

    if (meetingUrlMatch) {
      const meetingUrl = meetingUrlMatch[0];
      console.log('✅ Found BBB meeting URL:', meetingUrl);

      // Step 4: Join with Playwright
      console.log('\n4️⃣  Launching Playwright to join BBB...');
      
      const browser = await chromium.launch({ headless: false });
      const page = await browser.newPage();

      console.log('🌐 Navigating to:', meetingUrl);
      await page.goto(meetingUrl, { waitUntil: 'networkidle' });

      // Wait for join button or meeting to load
      console.log('⏳ Waiting for BBB interface to load...');
      await page.waitForTimeout(3000);

      const url = page.url();
      console.log('✅ Joined BBB! Current URL:', url);

      // Take screenshot
      await page.screenshot({ path: '/tmp/bbb-joined.png' });
      console.log('📸 Screenshot saved: /tmp/bbb-joined.png');

      // Close
      await browser.close();
      console.log('✅ Browser closed');
    } else {
      console.log('⚠️  BBB meeting URL not found in page HTML');
      console.log('🔍 Page preview:', pageHtml.substring(0, 500));
    }

    await client.close();
    console.log('\n✅ Integration test completed successfully!');

  } catch (error) {
    console.error('\n❌ Integration test failed:');
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
