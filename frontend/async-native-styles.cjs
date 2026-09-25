// The inline native skeleton owns first paint; the full theme must not delay it.
const fs = require('node:fs');
const path = require('node:path');
const root = process.argv[2] || 'dist/mempool/browser';
function visit(dir) {
  for (const entry of fs.readdirSync(dir, {withFileTypes:true})) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) visit(file);
    else if (entry.name === 'index.html') {
      const html = fs.readFileSync(file, 'utf8');
      const next = html.replace(/<link\b[^>]*rel="stylesheet"[^>]*>/g, tag => {
        if (!/href="(?:[^"/]*\/)*styles[^"/]*\.css"/.test(tag) || /data-taxi-styles/.test(tag)) return tag;
        return tag.replace(/>$/, ' data-taxi-styles media="print" onload="this.media=\'all\'">') + '<noscript>' + tag + '</noscript>';
      });
      fs.writeFileSync(file, next);
    }
  }
}
visit(root);
