/**
* @name Hydra-event-bus
* @summary Hydra-event-bus Hydra service entry point
* @description Provides the Event Bus for Hydra microservices
*/
'use strict';

const version = require('./package.json').version;
const hydra = require('hydra');
let config = require('fwsp-config');

const HydraLogger = require('fwsp-logger').HydraLogger;

let hydraLogger = new HydraLogger();
hydra.use(hydraLogger);
/**
* Load configuration file
*/
config.init('./config/config.json')
  .then(() => {
    config.version = version;
    config.hydra.serviceVersion = version;
    /**
    * Initialize hydra
    */
    return hydra.init(config);
  })
  .then(() => { 
    // hydra.use(new HydraLogger());
    hydra.registerService()
  })
  .then(serviceInfo => {
    
    let logEntry = `Starting ${config.hydra.serviceName} (v.${config.version})`;
    hydra.sendToHealthLog('info', logEntry);
    hydraLogger.getLogger().info(logEntry);
    hydraLogger.getLogger().error("Test error");

  })
  .catch((err) => {
    console.log(err);
    hydraLogger.getLogger().error(err);
  });
