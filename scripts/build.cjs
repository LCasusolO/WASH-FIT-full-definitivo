const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
require('esbuild').buildSync({entryPoints:['js/supabase-entry.js'],bundle:true,minify:true,format:'iife',outfile:'vendor/supabase.js',target:['es2022']});
fs.copyFileSync('node_modules/@supabase/supabase-js/LICENSE','vendor/supabase-LICENSE');
const context = { tailwind: {} };
vm.runInNewContext(fs.readFileSync('js/config/tailwind-config.js', 'utf8'), context);
const config = { ...context.tailwind.config, content: ['./index.html', './js/**/*.js'] };
fs.mkdirSync('work', { recursive: true });
fs.writeFileSync('work/tailwind.cjs', 'module.exports = ' + JSON.stringify(config));
fs.mkdirSync('vendor', { recursive: true });
for (const [from, to] of [
  ['vue/dist/vue.global.js', 'vue.global.js'],
  ['lucide/dist/umd/lucide.js', 'lucide.js'],
  ['leaflet/dist/leaflet.js', 'leaflet.js'],
  ['leaflet/dist/leaflet.css', 'leaflet.css'],
  ['vue/LICENSE', 'vue-LICENSE'],
  ['lucide/LICENSE', 'lucide-LICENSE'],
  ['leaflet/LICENSE', 'leaflet-LICENSE']
]) fs.copyFileSync(path.join('node_modules', from), path.join('vendor', to));
fs.cpSync('node_modules/leaflet/dist/images', 'vendor/images', { recursive: true });
const result = spawnSync(process.execPath, ['node_modules/@tailwindcss/cli/dist/index.mjs', '-i', 'css/tailwind-input.css', '-o', 'vendor/tailwind.css', '--minify'], { stdio: 'inherit' });
if (result.status !== 0) process.exit(result.status || 1);
const files = ['index.html', 'plataforma.html', 'privacidad.html', 'css/platform.css', 'css/privacy.css', 'css/styles.css', 'js/platform-model.js', 'js/platform-client.js', 'js/platform-editor.js', 'js/platform-portal.js', 'js/core.js', 'js/storage.js', 'js/chrome-report.js', 'js/report-radar.js', 'js/drive-archive.js', 'js/app.js', 'js/config/tailwind-config.js', 'js/data/indicators.js', 'img/barra.png', 'img/paho-logo-blanco.png', ...fs.readdirSync('vendor', { recursive: true }).filter(file => !/^(pdfmake|vfs_fonts)/.test(file) && fs.statSync(path.join('vendor', file)).isFile()).map(file => 'vendor/' + file.replace(/\\/g, '/'))];
const hash = require('node:crypto').createHash('sha256');
for (const file of files) hash.update(fs.readFileSync(file));
const revision = hash.digest('hex').slice(0,12);
const linkedFiles = new Set();
const versionHtml = page => fs.readFileSync(page, 'utf8').replace(/(src|href)="((?:css|js|vendor|img)\/[^"?]+)"/g, (match, attribute, file) => {
  if (!files.includes(file)) throw new Error('Recurso no incluido en el despliegue: ' + file);
  linkedFiles.add(file);
  return `${attribute}="${file}?v=${revision}"`;
});
const deployedHtml = versionHtml('index.html');
const platformHtml = versionHtml('plataforma.html');
// Cada HTML solicita su propia versión; un worker anterior no puede mezclar JS/CSS.
const assets = ['./', ...files.map(file => './' + file + (linkedFiles.has(file) ? '?v=' + revision : ''))];
fs.writeFileSync('sw.js', `const CACHE = 'wash-fit-${revision}';\nconst ASSETS = ${JSON.stringify(assets)};\n` + fs.readFileSync('scripts/sw-template.js', 'utf8'));
for (const file of [...files, 'sw.js']) {
  const destination = path.join('dist', file);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(file, destination);
}
fs.writeFileSync('dist/index.html', deployedHtml);
fs.writeFileSync('dist/plataforma.html', platformHtml);
console.log('Recursos locales y caché offline generados.');
