/**
 * Test script to verify fetchPageText works correctly before deploying
 *
 * Usage:
 *   npm run test:fetch <url>
 *
 * Example:
 *   npm run test:fetch https://example.com/lash-serum
 */

import { request } from 'undici';

// Fetch and extract text content from a URL
async function fetchPageText(url: string): Promise<string> {
  try {
    const { statusCode, body } = await request(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; BunkdBot/1.0)',
      },
      headersTimeout: 30000,
      bodyTimeout: 30000,
    });

    if (statusCode !== 200) {
      throw new Error(`Failed to fetch URL: ${statusCode}`);
    }

    const html = await body.text();

    // Basic HTML to text conversion
    // Remove script and style tags
    let text = html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');

    // Remove HTML tags
    text = text.replace(/<[^>]+>/g, ' ');

    // Decode HTML entities
    text = text
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");

    // Normalize whitespace
    text = text
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .join('\n');

    // Limit to reasonable length (150KB for more product details)
    if (text.length > 150000) {
      text = text.substring(0, 150000) + '\n... (truncated)';
    }

    return text;
  } catch (error: any) {
    throw new Error(`Failed to fetch page text: ${error.message}`);
  }
}

async function main() {
  const url = process.argv[2];

  if (!url) {
    console.error('❌ Error: URL required');
    console.error('');
    console.error('Usage:');
    console.error('  npm run test:fetch <url>');
    console.error('');
    console.error('Example:');
    console.error('  npm run test:fetch https://example.com/product');
    process.exit(1);
  }

  console.log('🔍 Testing fetchPageText function');
  console.log('📍 URL:', url);
  console.log('');

  try {
    console.log('⏳ Fetching page content...');
    const startTime = Date.now();
    const content = await fetchPageText(url);
    const duration = Date.now() - startTime;

    console.log('✅ Fetch successful!');
    console.log('');
    console.log('📊 Stats:');
    console.log(`  Duration: ${duration}ms`);
    console.log(`  Content length: ${content.length} characters`);
    console.log(`  Lines: ${content.split('\n').length}`);
    console.log('');
    console.log('📝 Content preview (first 500 chars):');
    console.log('─'.repeat(60));
    console.log(content.substring(0, 500));
    console.log('─'.repeat(60));
    console.log('');

    // Check for common product page elements
    console.log('🔎 Content analysis:');
    const checks = [
      { name: 'Contains "ingredient"', test: /ingredient/i.test(content) },
      { name: 'Contains "price"', test: /price|\$|USD|EUR/i.test(content) },
      { name: 'Contains volume/size', test: /ml|oz|gram|kg|liter/i.test(content) },
      { name: 'Contains product/item', test: /product|item/i.test(content) },
      { name: 'Contains study/research', test: /study|research|clinical|trial/i.test(content) },
    ];

    checks.forEach(check => {
      console.log(`  ${check.test ? '✓' : '✗'} ${check.name}`);
    });

    console.log('');
    console.log('✅ Test complete! Worker should be able to fetch this page.');

    // Save to file for inspection
    const fs = require('fs');
    const filename = 'test-fetch-output.txt';
    fs.writeFileSync(filename, content);
    console.log(`💾 Full content saved to: ${filename}`);

  } catch (error: any) {
    console.error('❌ Fetch failed:', error.message);
    console.error('');
    console.error('Possible issues:');
    console.error('  - URL is not accessible');
    console.error('  - Site blocks bots/scrapers');
    console.error('  - Network/firewall issue');
    console.error('  - Site requires JavaScript (worker cannot execute JS)');
    process.exit(1);
  }
}

main();
