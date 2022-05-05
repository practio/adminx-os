import { existsSync } from 'fs';
import path from 'path';
import pug from 'pug';
import resolve from 'resolve';
import sass from 'sass';

export function createEngine({ enableViewEngineCache }) {
  let cache = {};

  return engine;

  function engine(pugFilePath, options, callback) {
    if (!enableViewEngineCache) {
      cache = {};
    }

    const pugTemplate = (cache[pugFilePath] = cache[pugFilePath] || compilePugFile(pugFilePath));
    const html = pugTemplate(options);

    const scssFilePath = pugFilePath.replace(/.pug$/, '.scss');

    if (existsSync(scssFilePath)) {
      const css = (cache[scssFilePath] = cache[scssFilePath] || renderSassFile(scssFilePath));

      return callback(null, embedCssInHtml(css, html));
    }

    return callback(null, html);
  }

  function compilePugFile(path) {
    return pug.compileFile(path, {
      plugins: [
        {
          resolve: resolvePugFile,
        },
      ],
    });
  }

  function embedCssInHtml(css, html) {
    return html.replace('</head>', `<style>${css}</style></head>`);
  }

  function renderSassFile(file) {
    return sass
      .renderSync({ file, includePaths: ['./views', 'node_modules', './'] })
      .css.toString();
  }
}

function resolvePugFile(filename, source, options) {
  filename = filename.trim();

  if (filename[0] !== '/' && !source) {
    throw new Error(
      'the "filename" option is required to use includes and extends with "relative" paths',
    );
  }

  if (filename[0] === '/' && !options.basedir) {
    throw new Error(
      'the "basedir" option is required to use includes and extends with "absolute" paths',
    );
  }

  if (filename[0] === '.') {
    filename = path.join(
      filename[0] === '/' ? options.basedir : path.dirname(source.trim()),
      filename,
    );

    return filename;
  }

  return resolve.sync(filename, {
    basedir: path.dirname(source.trim()),
    moduleDirectory: ['node_modules', ''],
    extensions: ['pug'],
  });
}
