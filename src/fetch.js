import nodeFetch from 'node-fetch';

export function createFetch(baseUrl, baseInit = {}) {
  return fetch;

  async function fetch(url, init = {}) {
    const finalUrl = new URL(url, baseUrl);
    const finalInit = {
      ...baseInit,
      ...init,
      headers: {
        ...baseInit.headers,
        ...init.headers,
      },
    };

    if (finalInit.body) {
      finalInit.body = JSON.stringify(finalInit.body);
    }

    return nodeFetch(finalUrl, finalInit)
      .then(parseReponseBody)
      .then(checkResponseStatusCode)
      .then(returnParsedReponseBody);

    async function checkResponseStatusCode(response) {
      if (response.status > 299) {
        throw new FetchError({ request: { url: finalUrl, init: finalInit }, response });
      }

      return response;
    }

    async function parseReponseBody(response) {
      return response.text().then(body => {
        try {
          response.parsedBody = JSON.parse(body);
        } catch (err) {
          response.parsedBody = body;
        }

        return response;
      });
    }

    function returnParsedReponseBody(response) {
      return response.parsedBody;
    }
  }
}

class FetchError extends Error {
  constructor({ request, response }) {
    super(response.parsedBody);
    this.code = 'FETCH_ERROR';
    this.request = request;
    this.response = response;
  }
}
