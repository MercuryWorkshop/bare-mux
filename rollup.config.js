import inject from '@rollup/plugin-inject';
import replace from '@rollup/plugin-replace';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import typescript from 'rollup-plugin-typescript2';
import terser from '@rollup/plugin-terser';
const pkg = JSON.parse(await readFile('package.json'));
process.env.BARE_MUX_VERSION = pkg.version;

/**
 * @typedef {import('rollup').OutputOptions} OutputOptions
 * @typedef {import('rollup').RollupOptions} RollupOptions
 */

/**
 * @returns {RollupOptions['plugins']!}
 */
const commonPlugins = () => [
  typescript(),
  inject(
    Object.fromEntries(
      ['fetch', 'Request', 'Response', 'WebSocket', 'XMLHttpRequest'].map(
        (name) => [
          name,
          [fileURLToPath(new URL('./src/snapshot.ts', import.meta.url)), name],
        ]
      )
    )
  ),
  replace({
    'process.env.BARE_MUX_VERSION': JSON.stringify(
      process.env.BARE_MUX_VERSION
    ),
  }),
];

/**
 * @type {RollupOptions[]}
 */
const configs = [
  // import
  {
    input: 'src/index.ts',
    output: {
      file: `dist/index.js`,
      format: 'esm',
      sourcemap: true,
      exports: 'named',
    },
    plugins: [commonPlugins(),terser()],
  },
  // require
  {
    input: 'src/index.ts',
    output: {
      file: `dist/bare.cjs`,
      format: 'umd',
      name: 'BareMux',
      sourcemap: true,
      exports: 'auto',
    },
    plugins: [commonPlugins(),terser()],
  },
];

export default configs;
