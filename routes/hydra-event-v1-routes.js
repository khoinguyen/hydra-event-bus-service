/**
 * @name hydra-event-v1-api
 * @description This module packages the Hydra-event API.
 */
'use strict';

const hydraExpress = require('hydra-express');
const hydra = hydraExpress.getHydra();
const express = hydraExpress.getExpress();
const ServerResponse = require('fwsp-server-response');
const eventService = require('../hydra-event-bus-service');
const util = require('../src/util');

let serverResponse = new ServerResponse();
express.response.sendError = function (err) {
  serverResponse.sendServerError(this, {result: {error: err}});
};
express.response.sendOk = function (result) {
  serverResponse.sendOk(this, {result});
};

let api = express.Router();

api.get('/',
  (req, res) => {
    res.sendOk({greeting: 'Welcome to Hydra Express!'});
  });

api.post('/', (req, res) => {
  let event = req.body.event;
  let payload = req.body.payload;
  let error = [];
  if (!event) {
    error.push('event');
  }
  if (!payload) {
    error.push('payload');
  }

  if (error.length > 0) {
    return res.sendError('Missing parameters: ' + error.join(','));
  }
  util.dispatchEvent(event, payload);
  return res.sendOk('Emit event successfully')
});

module.exports = api;