/**
 * @name hydra-event-v1-api
 * @description This module packages the Hydra-event API.
 */
'use strict';

const hydraExpress = require('hydra-express');
const express = hydraExpress.getExpress();

const util = require('../lib/util');

let api = express.Router();

api.get('/',
  (req, res) => {
    res.sendOk({
      greeting: 'Welcome to Hydra Express!'
    });
  });

const getMissingFieldsInRequest = (req) => {
  const required = ['event', 'payload'];

  return required.filter((field) => typeof req.body[field] === 'undefined');
}

api.post('', (req, res) => {
  const missingFields = getMissingFieldsInRequest(req);

  if (missingFields.length > 0) {
    return res.sendError('Missing parameters: ' + missingFields.join(','));
  }

  util.dispatchEvent(req.body.event, req.body.payload);

  return res.sendOk('Emit event successfully')
});

module.exports = api;