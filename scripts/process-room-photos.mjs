import sharp from 'sharp';
import { readdir, mkdir, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';

const RAW_ROOT = 'raw-photos';
const MAX_BYTES = 700 * 1024;

const TARGET_WIDTH = 1920;
const TARGET_HEIGHT = 1280;

const QUALITY_STEPS = [84, 82, 80, 78, 76, 74];

const photoMap = {
  'room-1': [
    'agrousadba-nesvizhskaya-dvoryanskiy-nomer-1-spalnya.webp',
    'agrousadba-nesvizhskaya-dvoryanskiy-nomer-1-vannaya-komnata.webp',
    'agrousadba-nesvizhskaya-dvoryanskiy-nomer-1-dushevaya-zona.webp',
    'agrousadba-nesvizhskaya-dvoryanskiy-nomer-1-vtoroy-rakurs-spalni.webp',
    'agrousadba-nesvizhskaya-dvoryanskiy-nomer-1-detal-interiera.webp',
    'agrousadba-nesvizhskaya-dvoryanskiy-nomer-1-kuhonnyy-ugolok.webp',
    'agrousadba-nesvizhskaya-dvoryanskiy-nomer-1-zona-otdyha.webp',
    'agrousadba-nesvizhskaya-dvoryanskiy-nomer-1-obshchiy-vid.webp'
  ]
};

function getOutputDir(folder) {
  return path.join('public', 'images', 'rooms', folder);
}

async function pathExists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function getSourceImages(sourceDir) {
  const files = await readdir(sourceDir, { withFileTypes: true });

  return files
    .filter((file) => file.isFile())
    .map((file) => file.name)
    .filter((name) => /\.(jpg|jpeg|png|webp)$/i.test(name))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

async function convertImage(sourcePath, outputPath) {
  let finalBuffer = null;
  let finalQuality = QUALITY_STEPS.at(-1);

  for (const quality of QUALITY_STEPS) {
    const buffer = await sharp(sourcePath)
      .rotate()
      .resize(TARGET_WIDTH, TARGET_HEIGHT, {
        fit: 'cover',
        position: 'centre'
      })
      .webp({
        quality,
        effort: 6
      })
      .toBuffer();

    finalBuffer = buffer;
    finalQuality = quality;

    if (buffer.length <= MAX_BYTES) {
      break;
    }
  }

  await writeFile(outputPath, finalBuffer);

  const sizeKb = Math.round(finalBuffer.length / 1024);
  const status = finalBuffer.length <= MAX_BYTES ? 'OK' : 'WARN';

  console.log(`${status}: ${outputPath} — q${finalQuality} — ${sizeKb} KB`);
}

async function processFolder(folder, outputNames) {
  const sourceDir = path.join(RAW_ROOT, folder);
  const outputDir = getOutputDir(folder);

  if (!(await pathExists(sourceDir))) {
    console.warn(`Нет папки исходников: ${sourceDir}`);
    return;
  }

  await mkdir(outputDir, { recursive: true });

  const sourceImages = await getSourceImages(sourceDir);

  if (!sourceImages.length) {
    console.warn(`Нет изображений в папке: ${sourceDir}`);
    return;
  }

  console.log(`Найдено исходников: ${sourceImages.length}`);
  console.log(`Будет обработано: ${Math.min(sourceImages.length, outputNames.length)}`);

  if (sourceImages.length < outputNames.length) {
    console.warn(
      `В папке ${sourceDir} только ${sourceImages.length} фото, а ожидается ${outputNames.length}. Обработаю доступные.`
    );
  }

  const count = Math.min(sourceImages.length, outputNames.length);

  for (let index = 0; index < count; index += 1) {
    const sourcePath = path.join(sourceDir, sourceImages[index]);
    const outputPath = path.join(outputDir, outputNames[index]);

    console.log(`\n${index + 1}. ${sourcePath}`);
    await convertImage(sourcePath, outputPath);
  }
}

async function main() {
  console.log('Скрипт запущен. Обрабатываю только room-1.');

  for (const [folder, outputNames] of Object.entries(photoMap)) {
    console.log(`\nОбработка: ${folder}`);
    await processFolder(folder, outputNames);
  }

  console.log('\nГотово. Проверь папку: public/images/rooms/room-1');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});