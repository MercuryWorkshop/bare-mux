import inject from '@rollup/plugin-inject';
import terser from '@rollup/plugin-terser';
import typescript from 'rollup-plugin-typescript2';
import { fileURLToPath } from 'node:url';

const commonPlugins = () => [
	typescript(),
	terser(),
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
