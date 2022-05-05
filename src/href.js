import { format as formatUrl } from 'url';

export function baseHrefResponseLocalsMiddleware(req, res, next) {
  res.locals.baseHref = getBaseHrefFromRequest(req);

  next();
}

export function canonicalHrefResponseLocalsMiddleware(req, res, next) {
  res.locals.canonicalHref = getCanonicalHrefFromRequest(req);

  next();
}

export function fullHrefResponseLocalsMiddleware(req, res, next) {
  res.locals.fullHref = getFullHrefFromRequest(req);

  next();
}

export function hrefResponseLocalsMiddleware(req, res, next) {
  res.locals.href = (pathname, searchParams = null) => {
    if (typeof pathname === 'string') {
      const isRelativeToBase = pathname.startsWith('~/');

      if (isRelativeToBase) {
        pathname = pathname.substr(2);
        pathname = new URL(pathname, getBaseHrefFromRequest(req)).pathname;
      }
    }

    const source = getFullHrefFromRequest(req);
    const target = {
      pathname,
      searchParams,
    };

    const newURL = resolveHref(source, target);

    return newURL.pathname + newURL.search;
  };

  next();
}

export function isActiveHrefResponseLocalsMiddleware(req, res, next) {
  res.locals.isActiveHref = target => isActiveHref(getFullHrefFromRequest(req), target);

  next();

  function isActiveHref(source, target) {
    const s = getUrlPath(source);
    const t = getUrlPath(target);

    for (let i = 0; i < t.length; i++) {
      if (s[i] !== t[i]) {
        return false;
      }
    }

    return true;
  }

  function getUrlPath(source) {
    return new URL(source, 'http://localhost').pathname.split('/');
  }
}

export function getCanonicalHrefFromRequest(request) {
  const base = formatUrl({
    protocol: getProtocolFromRequest(request),
    hostname: getHostNameFromRequest(request),
    port: getPortFromRequest(request),
  });

  const url = getPathNameFromRequest(request);

  return new URL(url, base);
}

export function getFullHrefFromRequest(request) {
  const base = formatUrl({
    protocol: getProtocolFromRequest(request),
    hostname: getHostNameFromRequest(request),
    port: getPortFromRequest(request),
  });

  const url = getPathFromRequest(request);

  return new URL(url, base);
}

export function getBaseHrefFromRequest(request) {
  const url = formatUrl({
    protocol: getProtocolFromRequest(request),
    hostname: getHostNameFromRequest(request),
    port: getPortFromRequest(request),
    pathname: getBasePathNameFromRequest(request),
  });

  return new URL(url);
}

export function getBasePathNameFromRequest(request) {
  return appendTrailingSlash(request.baseUrl);
}

export function appendTrailingSlash(pathname) {
  return pathname + '/';
}

export function getHostNameFromRequest(request) {
  const hostHeader = request.header('Host');
  const hostComponents = parseHostHeader(hostHeader);
  const hostname = hostComponents.hostname;

  return hostname;
}

export function getProtocolFromRequest(request) {
  const xForwardedProto = request.header('X-Forwarded-Proto');
  const protocol = xForwardedProto || request.protocol;

  return protocol;
}

export function getPortFromRequest(request) {
  const xForwardedPort = request.header('X-Forwarded-Port');
  const hostHeader = request.header('Host');
  const hostComponents = parseHostHeader(hostHeader);
  const port = parseInt(xForwardedPort) || hostComponents.port;

  return port;
}

export function getPathFromRequest(request) {
  return request.originalUrl;
}

export function getPathNameFromRequest(request) {
  const path = getPathFromRequest(request);

  return new URL(path, 'http://localhost').pathname;
}

export function parseHostHeader(hostHeader) {
  const hostComponents = hostHeader.split(':');

  return {
    hostname: hostComponents[0],
    port: hostComponents[1] && parseInt(hostComponents[1]),
  };
}

export function resolveHref(source, target) {
  if (target === null || target === undefined) {
    return source;
  }

  const targetURL = target.pathname ? new URL(target.pathname, source) : new URL(source);

  if (target.searchParams) {
    source.searchParams.forEach((value, name) => {
      targetURL.searchParams.set(name, value);
    });

    Object.entries(target.searchParams).forEach(([name, value]) => {
      if (value === null) {
        targetURL.searchParams.delete(name);
      } else {
        targetURL.searchParams.set(name, value);
      }
    });
  }

  const newURL = new URL(formatUrl(targetURL));

  return newURL;
}

export function setCallbackUrlMiddleware(req, res, next) {
  const baseUrl = new URL(res.locals?.baseHref);

  const callbackUrl = [req.body?.callbackUrl, req.query?.callbackUrl]
    .filter(Boolean)
    .map(url => new URL(url, baseUrl))
    .find(url => isSameHostZone(url.host, baseUrl.host));

  req.callbackUrl = callbackUrl;
  res.locals.callbackUrl = callbackUrl;

  next();
}

function isSameHostZone(host1, host2) {
  return getHostZone(host1) === getHostZone(host2);
}

function getHostZone(host) {
  const hostname = getHostname(host);

  return hostname.split('.').reverse().slice(0, 2).reverse().join('.');
}

function getHostname(host) {
  const [hostname] = host.split(':');

  return hostname;
}
