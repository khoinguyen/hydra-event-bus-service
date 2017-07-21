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
const bodyParser = require('body-parser');
let hydraLogger = new HydraExpressLogger();
hydraExpress.use(hydraLogger);
const MAX_POST_SIZE = '5mb';

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
    const app = hydraExpress.getExpressApp();
    app.use(bodyParser({limit: MAX_POST_SIZE}));

    return hydraExpress.init(config.getObject(), version, () => {
      hydraExpress.registerRoutes({
        '/api/v1/hydra-event-bus': require('./routes/hydra-event-v1-routes')
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

      util.registerPatternsForService(body);
      util.unregisterPatternsForService(body);
      util.dispatchEventUMF(body);
      
      const frmParts = umf.frm.split('@');
      if (frmParts.length != 2 || frmParts[0] != hydra.instanceID) {
        util.updatePatterns(body);
      }
    });
  })
  .catch((err) => {
    hydra.sendToHealthLog('error', err);
  });
