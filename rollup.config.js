import inject from '@rollup/plugin-inject';
import { fileURLToPath } from 'node:url';
import typescript from 'rollup-plugin-typescript2';

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
    plugins: commonPlugins(),
  },
  // require
  {
    input: 'src/index.ts',
    output: {
      file: `dist/bare.cjs`,
      format: 'umd',
      name: 'bare',
      sourcemap: true,
      exports: 'auto',
    },
    plugins: commonPlugins(),
  },
];

export default configs;
