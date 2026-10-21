// Bundles prototype/xp into one self-contained page, so the XP celebration can be previewed in
// a browser without Foundry. Writes a full document for opening locally and a bare fragment for
// publishing as an Artifact (the host adds the document skeleton). Run with `npm run prototype`.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, type Rollup } from 'vite';

const repo = fileURLToPath(new URL('..', import.meta.url));
const source = join(repo, 'prototype/xp');
const out = join(repo, 'prototype/dist');

const result = (await build({
  configFile: false,
  logLevel: 'warn',
  resolve: { alias: { '@': join(repo, 'src') } },
  build: {
    write: false,
    minify: true,
    target: 'es2022',
    lib: { entry: join(source, 'main.ts'), formats: ['iife'], name: 'XpPrototype' },
  },
})) as Rollup.RollupOutput | Rollup.RollupOutput[];

const outputs = Array.isArray(result) ? result : [result];
const chunk = outputs.flatMap((o) => o.output).find((file): file is Rollup.OutputChunk => file.type === 'chunk');
if (!chunk) throw new Error('build-prototype: no JS chunk produced');

// A literal `</script>` inside the bundle would close the inline tag early.
const code = chunk.code.replaceAll('</script', '<\\/script');
const page = readFileSync(join(source, 'page.html'), 'utf8').replace('/*APP*/', () => code);

mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'xp-artifact.html'), page);
writeFileSync(
  join(out, 'xp.html'),
  `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n<style>body{margin:0}[hidden]{display:none!important}</style>\n</head>\n<body>\n${page}\n</body>\n</html>\n`,
);
console.log(`build-prototype: wrote ${join('prototype/dist', 'xp.html')} (${Math.round(page.length / 1024)} KB)`);
