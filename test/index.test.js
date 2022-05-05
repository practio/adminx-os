import { expect } from 'chai';
import express from 'express';

import adminx from '../src/index.js';

describe('createApp', () => {
  let app;

  before('create app', () => {
    const router = express.Router();

    app = adminx(router);

    app.listen(4000);
  });

  it('should create an Application', () => {
    expect(app).to.have.property('path');
  });
});
