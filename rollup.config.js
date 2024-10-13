import replace from '@rollup/plugin-replace';
import terser from '@rollup/plugin-terser';
import typescript from 'rollup-plugin-typescript2';

import { execSync } from "node:child_process";
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const pkg = JSON.parse(await readFile('package.json'));

const commonPlugins = () => [
	typescript(),
	terser(),
	replace({
		'self.BARE_MUX_VERSION': JSON.stringify(
		  pkg.version
		),
		'self.BARE_MUX_COMMITHASH': (() => {
			try {
				let hash = JSON.stringify(
					execSync("git rev-parse --short HEAD", {
						encoding: "utf-8",
					}).replace(/\r?\n|\r/g, "")
				);

				return hash;
			} catch (e) {
				return "unknown";
			}
		})(),
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
