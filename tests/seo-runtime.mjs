import ts from 'typescript';
import { readFile, writeFile, mkdir, mkdtemp } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

// Match Vercel's TypeScript-to-JavaScript file names, rather than letting
// Node's native TypeScript loader hide broken production import extensions.
export async function compileSeoRuntime() {
  const root = await mkdtemp(join(tmpdir(), 'comicculture-seo-runtime-'));
  const files = ['api/page.ts', 'api/sitemap.ts', 'server/catalog.ts', 'server/seo.ts',
    'src/lib/seo.ts', 'src/config/store.ts', 'src/config/catalog.ts'];
  for (const file of files) {
    const output = join(root, file.replace(/\.ts$/, '.js'));
    await mkdir(dirname(output), { recursive: true });
    const source = await readFile(new URL(`../${file}`, import.meta.url), 'utf8');
    await writeFile(output, ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
    }).outputText);
  }
  await writeFile(join(root, 'package.json'), JSON.stringify({ type: 'module' }));
  return (file) => import(pathToFileURL(join(root, file)).href);
}
