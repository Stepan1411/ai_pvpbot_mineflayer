// Bundle server.js with all dependencies using esbuild
const esbuild = require('esbuild');

esbuild.build({
  entryPoints: ['server.js'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  outfile: 'server-bundle.js',
  external: [],
  minify: false,
  sourcemap: false,
  format: 'cjs'
}).then(() => {
  console.log('Bundle created: server-bundle.js');
}).catch((error) => {
  console.error('Build failed:', error);
  process.exit(1);
});
