const fs = require('fs');

const files = process.argv.slice(2);
if (!files.length) {
  console.error('Usage: node scripts/test-page-syntax.js <html-file> [...html-file]');
  process.exit(1);
}

let checked = 0;
for (const file of files) {
  const html = fs.readFileSync(file, 'utf8');
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)];
  scripts.forEach((match, index) => {
    try {
      new Function(match[1]);
      checked += 1;
    } catch (err) {
      err.message = `${file} inline script #${index + 1}: ${err.message}`;
      throw err;
    }
  });
}

console.log(`page syntax checks passed (${checked} scripts)`);
