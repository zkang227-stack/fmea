const fs = require('fs');
const path = require('path');

const rootDir = __dirname;
const htmlPath = path.join(rootDir, 'index.html');
const cssPath = path.join(rootDir, 'style.css');
const appJsPath = path.join(rootDir, 'app.js');
const syncJsPath = path.join(rootDir, 'sync.js');
const outputPath = path.join(rootDir, 'fmea.html');
const aliasPath = path.join(rootDir, 'adhesive_fmea_portal.html');

console.log('[Bundler] Reading source files...');
const html = fs.readFileSync(htmlPath, 'utf8');
const css = fs.readFileSync(cssPath, 'utf8');
const appJs = fs.readFileSync(appJsPath, 'utf8');
const syncJs = fs.readFileSync(syncJsPath, 'utf8');

console.log('[Bundler] Assembling all-in-one standalone HTML...');
let bundle = html;

// Inline CSS
bundle = bundle.replace('<link rel="stylesheet" href="style.css">', () => '<style>\n' + css + '\n</style>');

// Inline Sync JS
bundle = bundle.replace('<script src="sync.js"></script>', () => '<script>\n' + syncJs + '\n</script>');

// Inline Main App JS
bundle = bundle.replace('<script src="app.js"></script>', () => '<script>\n' + appJs + '\n</script>');

fs.writeFileSync(outputPath, bundle, 'utf8');
fs.writeFileSync(aliasPath, bundle, 'utf8');
const stats = fs.statSync(outputPath);
console.log(`[Bundler] SUCCESS: Created ${outputPath} (${(stats.size / 1024).toFixed(1)} KB)`);
console.log(`[Bundler] File size: ${(stats.size / 1024).toFixed(1)} KB`);
