/**
 * @name Hydra-event-bus
 * @summary Hydra-event-bus Hydra service entry point
 * @description Provides the Event Bus for Hydra microservices
 */
'use strict';
const hydraExpress = require('hydra-express');

const HydraExpressLogger = require('fwsp-logger').HydraExpressLogger;
hydraExpress.use(new HydraExpressLogger());

const util = require('./lib/util');
const ServerResponse = require('./lib/express-server-response');
/**
 * Load configuration file
 */
const configHelper = require('./lib/config-helper');
hydraExpress.init(configHelper, () => {
    hydraExpress.registerRoutes({
      '/v1/hydra-event-bus': require('./routes/hydra-event-v1-routes')
    });
  })
  .then(serviceInfo => {
    const logEntry = `Starting ${serviceInfo.serviceName} (v.${serviceInfo.serviceVersion})`;

    hydraExpress.log('info', logEntry);
  }).then(ServerResponse)
  .then(() => {
    const hydra = hydraExpress.getHydra();

    util.updateAllPatterns();

    hydra.on('message', util.updatePatternsOnMessageReceived);
  })
  .catch((err) => {
    hydraExpress.log('error', err);
  });
