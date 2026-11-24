import { build } from 'esbuild';
import { Mp3Encoder } from '@breezystack/lamejs';
import { mkdir, writeFile, copyFile } from 'node:fs/promises';

const directory = new URL('../public/painel-audio/', import.meta.url);
await mkdir(directory, { recursive: true });
await build({
  entryPoints: ['src/workers/painelMp3.worker.ts'],
  outfile: 'public/painel-audio/mp3-worker-v1.js',
  bundle: true, platform: 'browser', format: 'iife', target: 'es2018', minify: true,
  // meSpeak's optional Node-only paths are never executed in a Web Worker.
  external: ['fs', 'path'], legalComments: 'inline',
  banner: { js: '/* Painel MP3 local. GPL-3.0-or-later. Source/build and third-party notices: /painel-audio/SOURCE.txt */' },
});
const encoder = new Mp3Encoder(1, 22050, 64);
const silence = encoder.encodeBuffer(new Int16Array(2205));
const end = encoder.flush();
await writeFile(new URL('activate-v1.mp3', directory), Buffer.concat([Buffer.from(silence), Buffer.from(end)]));
await copyFile('src/workers/painelMp3.worker.ts', new URL('painelMp3.worker.ts', directory));
await copyFile('src/lib/painelMp3Encoding.ts', new URL('painelMp3Encoding.ts', directory));
