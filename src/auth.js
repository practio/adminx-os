import createDebug from 'debug';
import express from 'express';

import hasRestrictedUserRoles from '@practio/has-restricted-user-roles';

import { createFetch } from './fetch.js';
import { getFullHrefFromRequest } from './href.js';

const debug = createDebug('@practio/adminx/auth');

export default function auth(handler, { cookieName, baseUrl }) {
  debug('cookieName: %s', cookieName);
  debug('baseUrl: %s', baseUrl);

  const router = express.Router();

  router.use(authenticate);
  router.use(actor);
  router.get('/logout', logout);
  router.use(handler);
  router.use(handleAuthError);

  function handleAuthError(err, req, res, next) {
    if (err.code === 'ERR_AUTHORIZATION' || err.code === 'ERR_AUTHENTICATION') {
      const redirectUrl = new URL(baseUrl);

      redirectUrl.searchParams.append('redirect_uri', getFullHrefFromRequest(req));

      res.clearCookie(cookieName);

      res.redirect(redirectUrl);
    } else {
      next(err);
    }
  }

  return router;

  async function authenticate(req, res, next) {
    try {
      const cookie = req.cookies[cookieName];

      if (cookie) {
        const fetch = createFetch(baseUrl, {
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Cookie: req.get('Cookie'),
          },
          credentials: 'include',
        });

        let user;

        try {
          user = await fetch('/api/auth/me');
        } catch (err) {
          throw new AuthenticationError(err.message);
        }

        req.user = user;
        res.locals.user = user;
      }

      next();
    } catch (err) {
      next(err);
    }
  }

  function logout(req, res) {
    res.clearCookie(cookieName);
    res.redirect('/');
  }

  function actor(req, res, next) {
    const { user } = req;

    if (user) {
      const actor = {
        id: user.id,
        type: 'user',
      };

      req.actor = actor;
      res.locals.actor = actor;
    }

    next();
  }
}

export function authorize(...restrictions) {
  return function (req, res, next) {
    try {
      const { user } = req;

      if (!user) {
        debug('authorize failed. user not found');
        throw new AuthorizationError('User Not Found');
      }

      const isAuthorized = hasRestrictedUserRoles(user.roles, restrictions);

      if (!isAuthorized) {
        debug('authorize failed. user not authorized. %O, %O', user.roles, restrictions);
        throw new AuthorizationError('User Not Authorized');
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}

export class AuthenticationError extends Error {
  constructor(message) {
    super(message);
    this.code = 'ERR_AUTHENTICATION';
  }
}

export class AuthorizationError extends Error {
  constructor(message) {
    super(message);
    this.code = 'ERR_AUTHORIZATION';
  }
}
