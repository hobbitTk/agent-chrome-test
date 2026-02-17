import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

export interface CompareResult {
  match: boolean;
  diffPixels: number;
  totalPixels: number;
  diffPercentage: number;
  diffImageBase64?: string;
}

export async function compareScreenshots(
  actual: Buffer,
  expected: Buffer,
  threshold = 0.1
): Promise<CompareResult> {
  const img1 = PNG.sync.read(expected);
  const img2 = PNG.sync.read(actual);

  if (img1.width !== img2.width || img1.height !== img2.height) {
    return {
      match: false,
      diffPixels: -1,
      totalPixels: img1.width * img1.height,
      diffPercentage: 100,
    };
  }

  const { width, height } = img1;
  const diff = new PNG({ width, height });

  const diffPixels = pixelmatch(
    img1.data,
    img2.data,
    diff.data,
    width,
    height,
    { threshold }
  );

  const totalPixels = width * height;
  const diffPercentage = (diffPixels / totalPixels) * 100;
  const match = diffPixels === 0;

  const diffImageBase64 = PNG.sync.write(diff).toString('base64');

  return { match, diffPixels, totalPixels, diffPercentage, diffImageBase64 };
}
