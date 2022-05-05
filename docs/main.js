import express from 'express';

import { defineError } from '@practio/errors';

import adminx from '../src/index.js';

const StatusCodeError = defineError({
  args: ['message', 'statusCode'],
  code: 'test',
});

const appRouter = express.Router();

appRouter.get('/mixins', (req, res) => {
  res.render('mixins');
});

appRouter.get('/errors', (req, res) => {
  res.render('errors');
});

appRouter.get('/errors/:code', (req, res) => {
  throw new StatusCodeError(req.query.message, req.params.code || '404');
});

appRouter.get('*', (req, res) => {
  res.render('home');
});

const app = adminx(appRouter, {
  auth: {
    cookieName: 'pvac-dev',
    baseUrl: 'http://localhost:9040',
  },
  views: 'docs/views',
  enableViewEngineCache: false,
  returnErrorDetails: true,
});

const rootApp = express();

rootApp.use('/', app);

rootApp.use((err, req, res, next) => {
  console.error(err);
});

const port = 4000;

rootApp.listen(port, () => console.info(`Listening on http://localhost:${port}`));
