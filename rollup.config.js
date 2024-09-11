import inject from '@rollup/plugin-inject';
import replace from '@rollup/plugin-replace';
import typescript from 'rollup-plugin-typescript2';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const pkg = JSON.parse(await readFile('package.json'));

const commonPlugins = () => [
	typescript(),
	inject(
		Object.fromEntries(
			['fetch', 'Request', 'Response', 'WebSocket', 'XMLHttpRequest', 'SharedWorker', 'localStorage', 'serviceWorker'].map(
				(name) => [
					name,
					[fileURLToPath(new URL('./src/snapshot.ts', import.meta.url)), name],
				]
			)
		)
	),
	replace({
		'self.BARE_MUX_VERSION': JSON.stringify(
		  pkg.version
		),
	  }),
];

const configs = [
	{
		input: './src/worker.ts',
		output: {
			file: 'dist/worker.js',
			format: 'iife',
			sourcemap: true,
			exports: 'none',
		},
		plugins: commonPlugins(),
	},
	{
		input: './src/index.ts',
		output: {
			file: 'dist/index.mjs',
			format: 'esm',
			sourcemap: true,
			exports: 'named',
		},
		plugins: commonPlugins()
	},
	{
		input: './src/index.ts',
		output: {
			file: 'dist/index.js',
			format: 'umd',
			name: 'BareMux',
			sourcemap: true,
			exports: 'named',
		},
		plugins: commonPlugins(),
	},
];

export default configs;
