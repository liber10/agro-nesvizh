import sharp from 'sharp';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const RAW_DIR = path.join('raw-photos', 'territory');
const OUTPUT_DIR = path.join('public', 'images', 'territory');
const MANIFEST_PATH = path.join('src', 'data', 'territory-gallery.json');

const MAX_ITEMS = 5;
const QUALITY = 82;

const captions = [
  {
    alt: 'Территория агроусадьбы',
    label: 'Тихий двор для отдыха после прогулок'
  },
  {
    alt: 'Зона отдыха на территории усадьбы',
    label: 'Места для спокойного отдыха'
  },
  {
    alt: 'Детали территории агроусадьбы',
    label: 'Уютные детали рядом с домом'
  },
  {
    alt: 'Вид на двор агроусадьбы',
    label: 'Пространство для семейного отдыха'
  },
  {
    alt: 'Вечерняя атмосфера на территории',
    label: 'Место для теплого вечера'
  }
];

function getTargetSize(index) {
  if (index === 0) {
    return { width: 1920, height: 1280 };
  }

  return { width: 1200, height: 900 };
}

async function getSourceImages() {
  const files = await readdir(RAW_DIR, { withFileTypes: true });

  return files
    .filter((file) => file.isFile())
    .map((file) => file.name)
    .filter((name) => /\.(jpg|jpeg|png|webp|avif)$/i.test(name))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .slice(0, MAX_ITEMS);
}

async function processImage(sourceName, index) {
  const outputName = `territory-${index + 1}.webp`;
  const sourcePath = path.join(RAW_DIR, sourceName);
  const outputPath = path.join(OUTPUT_DIR, outputName);
  const { width, height } = getTargetSize(index);

  await sharp(sourcePath)
    .rotate()
    .resize(width, height, {
      fit: 'cover',
      position: 'attention'
    })
    .modulate({
      brightness: 1.03,
      saturation: 1.08
    })
    .sharpen({
      sigma: 0.8,
      m1: 0.7,
      m2: 1.6
    })
    .webp({
      quality: QUALITY,
      effort: 6
    })
    .toFile(outputPath);

  return {
    src: `/images/territory/${outputName}`,
    alt: captions[index]?.alt || 'Территория агроусадьбы',
    label: captions[index]?.label || 'Территория усадьбы'
  };
}

async function main() {
  await mkdir(OUTPUT_DIR, { recursive: true });

  const sourceImages = await getSourceImages();

  if (!sourceImages.length) {
    console.warn(`Нет фото для обработки. Добавьте изображения в ${RAW_DIR} и запустите скрипт снова.`);
    return;
  }

  const items = [];

  for (let index = 0; index < sourceImages.length; index += 1) {
    console.log(`${index + 1}. ${sourceImages[index]} -> territory-${index + 1}.webp`);
    items.push(await processImage(sourceImages[index], index));
  }

  await writeFile(MANIFEST_PATH, `${JSON.stringify(items, null, 2)}\n`, 'utf8');

  console.log(`Готово: обработано ${items.length} фото.`);
  console.log(`Манифест обновлен: ${MANIFEST_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
