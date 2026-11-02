import { plugin } from 'bun';

const transpiler = new Bun.Transpiler({
  loader: 'tsx',
  autoImportJSX: true,
  tsconfig: { compilerOptions: { jsx: 'react-jsx', jsxImportSource: 'react' } },
});

plugin({
  name: 'web-react-jsx',
  setup(build) {
    build.onLoad({ filter: /[\\/]apps[\\/]web[\\/]src[\\/].*\.tsx$/ }, async ({ path }) => ({
      contents: transpiler.transformSync(await Bun.file(path).text()),
      loader: 'js',
    }));
  },
});
