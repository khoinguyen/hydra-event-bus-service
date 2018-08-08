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
const registerMiddlewareCallback = () => {
  const app = hydraExpress.getExpressApp();

  app.use((req, res, next) => {
    if (req.path == '/healthz') {
      return res.status(200).send('OK');
    }
    next();
  });
}
/**
 * Load configuration file
 */
const configHelper = require('./lib/config-helper');
hydraExpress.init(configHelper, configHelper.serviceVersion, () => {
    hydraExpress.registerRoutes({
      '/v1/hydra-event-bus': require('./routes/hydra-event-v1-routes')
    });
  }, registerMiddlewareCallback)
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
