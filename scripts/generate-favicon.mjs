import sharp from 'sharp';
import pngToIco from 'png-to-ico';
import { mkdir, writeFile } from 'node:fs/promises';

const source = 'raw-favicon/favicon-source.png';

await mkdir('public/icons', { recursive: true });

async function makePng(size, outputPath) {
  await sharp(source)
    .trim({
      background: '#000000',
      threshold: 12
    })
    .resize(size, size, {
      fit: 'contain',
      background: {
        r: 0,
        g: 0,
        b: 0,
        alpha: 0
      }
    })
    .png()
    .toFile(outputPath);

  console.log(`OK: ${outputPath}`);
}

await makePng(16, 'public/icons/favicon-16x16.png');
await makePng(32, 'public/icons/favicon-32x32.png');
await makePng(48, 'public/icons/favicon-48x48.png');
await makePng(180, 'public/apple-touch-icon.png');
await makePng(192, 'public/icons/icon-192x192.png');
await makePng(512, 'public/icons/icon-512x512.png');

const icoBuffer = await pngToIco([
  'public/icons/favicon-16x16.png',
  'public/icons/favicon-32x32.png',
  'public/icons/favicon-48x48.png'
]);

await writeFile('public/favicon.ico', icoBuffer);

console.log('OK: public/favicon.ico');
console.log('Готово. Favicon-файлы созданы.');