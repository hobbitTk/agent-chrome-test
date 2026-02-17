import { mkdirSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export class BaselineStore {
  constructor(private baseDir: string) {
    mkdirSync(this.baseDir, { recursive: true, mode: 0o700 });
    mkdirSync(join(this.baseDir, 'diffs'), { recursive: true, mode: 0o700 });
  }

  private validateName(name: string): void {
    if (name.includes('..') || name.includes('/') || name.includes('\\')) {
      throw new Error(`Invalid baseline name: "${name}". Must not contain path separators.`);
    }
  }

  async save(name: string, pngBuffer: Buffer): Promise<string> {
    this.validateName(name);
    const filePath = join(this.baseDir, `${name}.png`);
    writeFileSync(filePath, pngBuffer, { mode: 0o600 });
    return filePath;
  }

  async saveDiff(name: string, pngBuffer: Buffer): Promise<string> {
    this.validateName(name);
    const filePath = join(this.baseDir, 'diffs', `${name}.diff.png`);
    writeFileSync(filePath, pngBuffer, { mode: 0o600 });
    return filePath;
  }

  async load(name: string): Promise<Buffer | null> {
    this.validateName(name);
    const filePath = join(this.baseDir, `${name}.png`);
    if (!existsSync(filePath)) return null;
    return readFileSync(filePath);
  }

  async exists(name: string): Promise<boolean> {
    this.validateName(name);
    return existsSync(join(this.baseDir, `${name}.png`));
  }

  async list(): Promise<string[]> {
    return readdirSync(this.baseDir)
      .filter((f) => f.endsWith('.png'))
      .map((f) => f.replace(/\.png$/, ''));
  }
}
