/**
 * @name Hydra-event-bus
 * @summary Hydra-event-bus Hydra service entry point
 * @description Provides the Event Bus for Hydra microservices
 */
'use strict';

const version = require('./package.json').version;
const hydraExpress = require('hydra-express');
let config = require('fwsp-config');
const util = require('./src/util');
const HydraExpressLogger = require('fwsp-logger').HydraExpressLogger;

let hydraLogger = new HydraExpressLogger();
hydraExpress.use(hydraLogger);

/**
 * Load configuration file
 */
config
  .init('./config/config.json')
  .then(() => {
    config.version = version;
    config.hydra.serviceVersion = version;
    /**
     * Initialize hydra
     */
    return hydraExpress.init(config.getObject(), version, () => {
      hydraExpress.registerRoutes({
        '/v1/hydra-event-bus': require('./routes/hydra-event-v1-routes')
      });
    })
  })
  .then(serviceInfo => {
    let logEntry = `Starting ${config.hydra.serviceName} (v.${config.version})`;
    const hydra = hydraExpress.getHydra();
    hydra.sendToHealthLog('info', logEntry);
    util.updateAllPatterns();

    hydra.on('message', (umf) => {
      if (umf.typ !== 'event-bus')
        return;

      const body = umf.bdy;

      if (body.type == 'register')
        util.registerPatternsForService(body.patterns, body.serviceTag);

      if (body.type == 'unregister')
        util.unregisterPatternsForService(body.patterns, body.serviceTag);

      if (body.type == 'changed') {
        const frmParts = umf.frm.split('@');
        if (frmParts.length != 2 || frmParts[0] != hydra.instanceID) {
          util.updatePatterns(body.serviceTag);
        }
      }

      if (body.type == 'event')
        util.dispatchEventUMF(umf);
      }
    );
  })
  .catch((err) => {
    hydra.sendToHealthLog('error', err);
  });
