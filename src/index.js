import bodyParser from 'body-parser';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { randomBytes } from 'crypto';
import csurf from 'csurf';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone.js';
import utc from 'dayjs/plugin/utc.js';
import createDebug from 'debug';
import express from 'express';
import helmet from 'helmet';
import path from 'path';
import resolve from 'resolve';
import statuses from 'statuses';
import { fileURLToPath } from 'url';
import yaml from 'yaml';

import { NotFoundError } from '@practio/errors';

import adminxAuth from './auth.js';
import { createEngine } from './engine.js';
import {
  baseHrefResponseLocalsMiddleware,
  canonicalHrefResponseLocalsMiddleware,
  fullHrefResponseLocalsMiddleware,
  hrefResponseLocalsMiddleware,
  isActiveHrefResponseLocalsMiddleware,
  setCallbackUrlMiddleware,
} from './href.js';

const debug = createDebug('@practio/adminx');

export default function adminx(
  handler,
  { auth, locals = {}, views, enableViewEngineCache = true, returnErrorDetails = true } = {},
) {
  debug('adminx opts: %O', { auth, views, enableViewEngineCache });

  const adminxPath = fileURLToPath(new URL('../', import.meta.url));

  const app = express();

  app.locals.YAML = yaml;

  app.use(setCspNonceMiddleware);

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          'script-src': ["'self'", helmetCspNonceDirective],
          'form-action': null, // We have to remove form action csp for now as it blocks redirecting between services on form submit.
        },
      },
      referrerPolicy: {
        policy: ['same-origin'],
      },
    }),
  );

  if (returnErrorDetails) {
    app.enable('returnErrorDetails');
  } else {
    app.disable('returnErrorDetails');
  }

  app.on('mount', function (parent) {
    app.parents = app.parents || [];
    app.parents.push(parent);
  });

  if (locals) {
    app.locals = {
      ...app.locals,
      ...locals,
    };
  }

  dayjs.extend(utc);
  dayjs.extend(timezone);

  app.locals.dayjs = dayjs;

  // Configure View Engine
  app.engine('pug', createEngine({ enableViewEngineCache }));
  app.set('view engine', 'pug');

  app.set('views', [app.get('views'), path.join(adminxPath, 'views')].flat());

  if (views) {
    app.set('views', [app.get('views'), views].flat());
  }

  app.use(compression());
  app.use(bodyParser.urlencoded({ extended: false, limit: 1024 * 1024 * 16 }));
  app.use(cookieParser());

  // CSRF
  app.use(csurf({ cookie: true }));
  app.use(csrfTokenOnResponseLocals);

  app.use(baseHrefResponseLocalsMiddleware);
  app.use(canonicalHrefResponseLocalsMiddleware);
  app.use(fullHrefResponseLocalsMiddleware);
  app.use(hrefResponseLocalsMiddleware);
  app.use(isActiveHrefResponseLocalsMiddleware);
  app.use(setCallbackUrlMiddleware);

  const staticOptions = { maxAge: 24 * 60 * 60 * 1000, immutable: true };

  app.use(
    '/',
    express.static(path.relative(process.cwd(), path.join(adminxPath, 'css'), staticOptions)),
  );

  try {
    const windyDir = resolveModuleDir('@practio/windy');

    app.use('/windy.css', express.static(path.join(windyDir, 'dist', 'windy.css'), staticOptions));
    app.use('/windy.js', express.static(path.join(windyDir, 'js', 'windy.js'), staticOptions));
  } catch (err) {
    debug('Windy Not Found');
  }

  app.use(
    '/fonts',
    express.static(path.join(resolveModuleDir('inter-ui'), 'Inter (web latin)'), staticOptions),
  );

  app.use(
    '/libs/highlight.js',
    express.static(resolveModuleDir('@highlightjs/cdn-assets'), staticOptions),
  );

  app.use(
    '/',
    express.static(path.relative(process.cwd(), path.join(adminxPath, 'public')), staticOptions),
  );

  app.use(getAlertCookieMiddleware);

  if (auth) {
    app.use(adminxAuth(handler, auth));
  } else {
    app.use(handler);
  }

  app.get('/*', defaultHandler);

  app.use(setAlertCookieErrorHandler);
  app.use(postErrorHandler);
  app.use(allErrorHandler);

  return app;
}

function csrfTokenOnResponseLocals(req, res, next) {
  res.locals.csrfToken = req.csrfToken();

  next();
}

function defaultHandler(req, res, next) {
  next(new NotFoundError());
}

function resolveModuleDir(id) {
  const packageDir = path.dirname(
    path.relative(
      process.cwd(),
      resolve.sync(id, {
        packageFilter: (pkg, dir) => ({ ...pkg, main: 'package.json' }),
      }),
    ),
  );

  return packageDir;
}

function getAlertCookieMiddleware(req, res, next) {
  const alertCookie = req.cookies.alert;

  if (alertCookie) {
    res.locals.alert = JSON.parse(Buffer.from(alertCookie, 'base64'));
    res.clearCookie('alert');
  }

  next();
}

function setAlertCookieErrorHandler(err, req, res, next) {
  const { message, code } = err;

  const alert = Buffer.from(JSON.stringify({ message, code })).toString('base64');

  res.cookie('alert', alert, { maxAge: 1000 * 30, httpOnly: true });

  next(err);
}

function postErrorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  if (req.method !== 'POST') {
    return next(err);
  }

  if (!req.get('Referrer')) {
    return next(err);
  }

  const newUrl = new URL(req.get('Referrer'));

  for (const param in req.body) {
    const value = req.body[param];

    newUrl.searchParams.set(param, value);
  }

  newUrl.searchParams.delete('_csrf');

  res.redirect(newUrl);

  next(err);
}

function allErrorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  const statusCode = err.statusCode || err.status || err.http || 500;
  const statusMessage = statuses(statusCode);

  const { id, code, message, stack } = err;

  res.status(statusCode);

  res.render('error', {
    statusCode,
    statusMessage,
    error: { id, message, stack, code },
    returnErrorDetails: req.app.enabled('returnErrorDetails'),
  });
}

function setCspNonceMiddleware(req, res, next) {
  res.locals.nonce = randomBytes(16).toString('hex');

  next();
}

function helmetCspNonceDirective(req, res) {
  return `'nonce-${res.locals.nonce}'`;
}
