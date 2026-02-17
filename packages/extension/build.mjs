import { build, context } from 'esbuild';
import { cpSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const isWatch = process.argv.includes('--watch');

const commonOptions = {
  bundle: true,
  format: 'esm',
  target: 'chrome120',
  sourcemap: true,
  outdir: join(__dirname, 'dist'),
};

const entries = [
  {
    entryPoints: [join(__dirname, 'src/service-worker.ts')],
    outfile: join(__dirname, 'dist/service-worker.js'),
  },
  {
    entryPoints: [join(__dirname, 'src/content-script.ts')],
    outfile: join(__dirname, 'dist/content-script.js'),
    format: 'iife', // content scripts can't be ESM
  },
  {
    entryPoints: [join(__dirname, 'src/popup/popup.ts')],
    outfile: join(__dirname, 'dist/popup/popup.js'),
  },
];

async function buildAll() {
  // Build all entry points
  for (const entry of entries) {
    const opts = {
      ...commonOptions,
      ...entry,
      outdir: undefined, // use outfile instead
    };

    if (isWatch) {
      const ctx = await context(opts);
      await ctx.watch();
    } else {
      await build(opts);
    }
  }

  // Copy static files
  const distDir = join(__dirname, 'dist');

  // Copy manifest
  cpSync(join(__dirname, 'manifest.json'), join(distDir, 'manifest.json'));

  // Copy popup HTML
  mkdirSync(join(distDir, 'popup'), { recursive: true });
  cpSync(join(__dirname, 'src/popup/popup.html'), join(distDir, 'popup/popup.html'));

  // Create placeholder icons
  const iconsDir = join(distDir, 'icons');
  mkdirSync(iconsDir, { recursive: true });

  // Generate simple SVG icons as placeholders
  for (const size of [16, 48, 128]) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${size * 0.15}" fill="#1a1a1a"/>
  <text x="50%" y="55%" text-anchor="middle" dominant-baseline="middle" fill="#22c55e" font-family="monospace" font-size="${size * 0.4}" font-weight="bold">T</text>
</svg>`;
    // For now, write SVG. Chrome supports PNG icons - we'll convert later.
    // Using a simple 1x1 transparent PNG as placeholder
    const { writeFileSync } = await import('node:fs');
    writeFileSync(join(iconsDir, `icon${size}.png`), createMinimalPng(size));
  }

  if (!isWatch) {
    console.log('Extension built to dist/');
  }
}

// Create a minimal valid PNG (green square with T)
function createMinimalPng(size) {
  // Minimal 1x1 green PNG - just a valid PNG header for Chrome to accept
  // In production, replace with actual icons
  const png = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG signature
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, // 1x1
    0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xde, // 8-bit RGB
    0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41, 0x54, // IDAT chunk
    0x08, 0xd7, 0x63, 0x28, 0xc9, 0x60, 0x00, 0x00, // compressed green pixel
    0x00, 0x04, 0x00, 0x01, 0xf5, 0x5c, 0x9b, 0x5c,
    0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, // IEND chunk
    0xae, 0x42, 0x60, 0x82,
  ]);
  return png;
}

buildAll().catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});
