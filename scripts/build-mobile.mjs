// Build the self-contained mobile web bundle (www/) that Capacitor packages into the native
// iOS/Android apps. Reuses the exact SPA (public/app.js) + styles (app/globals.css); the SPA
// detects the native shell at runtime and calls the hosted API at clout.kytepush.com.
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const www = path.join(root, 'www');
fs.rmSync(www, { recursive: true, force: true });
fs.mkdirSync(www, { recursive: true });

const copy = (src, dst) => fs.copyFileSync(path.join(root, src), path.join(www, dst));
copy('public/app.js', 'app.js');
copy('app/globals.css', 'styles.css');
for (const f of ['icon.svg', 'icon-192.png', 'icon-512.png', 'manifest.json', 'sw.js']) copy('public/' + f, f);

const tabs = [
  ['debut', '🔥', 'Debut'], ['index', '📈', 'Index'], ['discover', '🃏', 'Cards'],
  ['collection', '📚', 'Vault'], ['chat', '💬', 'Chat'], ['profile', '👤', 'You'],
].map(([go, ic, lbl]) => `<button class="tab" data-go="${go}"><span class="ti">${ic}</span><span>${lbl}</span></button>`).join('');

fs.writeFileSync(path.join(www, 'index.html'), `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1" />
  <meta name="theme-color" content="#08090f" />
  <title>CLOUT</title>
  <link rel="stylesheet" href="styles.css" />
</head>
<body>
  <div id="phone">
    <header class="topbar" id="topbar">
      <div class="brand" data-go="index">◈ CLOUT</div>
      <div class="top-actions"><button class="chip" id="balanceChip" data-go="profile">◈ —</button></div>
    </header>
    <main id="view"></main>
    <nav class="tabbar" id="tabbar">${tabs}</nav>
  </div>
  <script src="app.js"></script>
</body>
</html>
`);

console.log('✓ built www/ (mobile bundle):', fs.readdirSync(www).join(', '));
