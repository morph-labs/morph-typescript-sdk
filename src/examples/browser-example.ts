#!/usr/bin/env ts-node
/**
 * Browser example following the spec.md API exactly.
 * 
 * This demonstrates the MorphBrowser API as specified in spec.md.
 * 
 * Usage:
 *   npx ts-node src/examples/browser-example.ts
 *   npx ts-node src/examples/browser-example.ts --rebuild    # Force fresh snapshot creation
 *   npx ts-node src/examples/browser-example.ts --verbose    # Enable verbose output
 */

import { chromium } from 'playwright';
import { MorphBrowser } from '../experimental/browser.js';

async function main(): Promise<void> {
  // Parse command line flags
  const args = process.argv.slice(2);
  const rebuild = args.includes('--rebuild');
  const verbose = args.includes('--verbose') || args.includes('-v');

  const mb = new MorphBrowser();

  // Create a session on MorphCloud
  const session = await mb.sessions.create({ 
    invalidate: rebuild, 
    verbose 
  });

  // Show instance information
  try {
    console.log(`✅ MorphVM Instance: ${session.instance.id}`);
  } catch {
    console.log("✅ MorphVM Instance: Details not available");
  }

  if (verbose) {
    console.log(`Connecting to: ${session.connectUrl}`);
  }

  // Connect to the remote session
  const browser = await chromium.connectOverCDP(session.connectUrl);

  if (verbose) {
    console.log(`Connected to browser, contexts: ${browser.contexts().length}`);
    browser.contexts().forEach((context, i) => {
      console.log(`  Context ${i}: ${context.pages().length} pages`);
    });
  }

  try {
    // Use the exact spec.md pattern
    const context = browser.contexts()[0];
    const page = context.pages()[0];

    await page.goto("https://news.ycombinator.com/");
    console.log(await page.title());
  } finally {
    await browser.close();
    await session.close();
  }
}

if (require.main === module) {
  main().catch(console.error);
}