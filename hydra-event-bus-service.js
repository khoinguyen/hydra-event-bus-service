/**
* @name Hydra-event-bus
* @summary Hydra-event-bus Hydra service entry point
* @description Provides the Event Bus for Hydra microservices
*/
'use strict';

const _ = require('lodash');
const version = require('./package.json').version;
const hydra = require('hydra');
let config = require('fwsp-config');
const mm = require('micromatch');

const redis = require('redis');
const Promise = require('bluebird');
Promise.promisifyAll(redis.RedisClient.prototype);

const HydraLogger = require('fwsp-logger').HydraLogger;

let hydraLogger = new HydraLogger();
hydra.use(hydraLogger);

/* Constants */
const ebPreKey = 'hydra:event-bus';
const registryPreKey = ebPreKey + ':registry';

const registry = {};
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
    return hydra.init(config);
  })
  .then(() => {
    hydra.appLogger = hydraLogger.getLogger();
    hydra.registerService()
  })
  .then(serviceInfo => {
    let logEntry = `Starting ${config.hydra.serviceName} (v.${config.version})`;
    hydra.sendToHealthLog('info', logEntry);
    updateAllPatterns().then(() => {
      hydra.sendToHealthLog('info', `Load to local registry patterns for ${Object.keys(registry).length} services with tags`);
    });
    hydra.on('message', (umf) => {
      if (umf.typ !== 'event-bus') 
        return;

      const body = umf.bdy;

      if (body.type == 'register') 
        registerPatternsForService(body.patterns, body.serviceTag);
      
      if (body.type == 'unregister') 
        unregisterPatternsForService(body.patterns, body.serviceTag);

      if (body.type == 'changed') {
        const frmParts = umf.frm.split('@');
        if (frmParts.length != 2 || frmParts[0] != hydra.instanceID) {
          updatePatterns(body.serviceTag);
        }
      }

      if (body.type == 'event') 
        dispatchEvent(umf);
      }
    );
  })
  .catch((err) => {
    hydra.sendToHealthLog('error', err);
  });

const registerPatternsForService = (patterns, serviceTag) => {
  const stringifiedPatterns = _.castArray(patterns)
                                  .map(stringifyPattern)
                                  .filter((pattern) => pattern !== false);

  if (!stringifiedPatterns) return;

  updateLocalRegistry(serviceTag, stringifiedPatterns);

  Promise.map(stringifiedPatterns, (pattern) => {
    return hydra.redisdb.saddAsync(`${registryPreKey}:${serviceTag}`, pattern);
  }).then(function() {
    hydra.sendToHealthLog('info', `Registered ${stringifiedPatterns.length} patterns for ${serviceTag}`);
    notifyUpdate(serviceTag);
  }).catch((err) => {
    hydra.sendToHealthLog('error', err);
  });
};

const unregisterPatternsForService = (patterns, serviceTag) => {
  const stringifiedPatterns = _.castArray(patterns)
                                  .map(stringifyPattern)
                                  .filter((pattern) => pattern !== false);

  if (!stringifiedPatterns || !registry[serviceTag]) return;

  const removablePatterns = new Set(stringifiedPatterns);

  const retArr = Array.from(registry[serviceTag]).filter((pattern) => {
    return !removablePatterns.has(pattern);
  });


  updateLocalRegistry(serviceTag, retArr, true);

  hydra.redisdb.delAsync(`${registryPreKey}:${serviceTag}`).then(() => {
    return Promise.map(retArr, (pattern) => {
      return hydra.redisdb.saddAsync(`${registryPreKey}:${serviceTag}`, pattern);
    })
  })
  .then(function() {
    hydra.sendToHealthLog('info', `Unregistered ${stringifiedPatterns.length} patterns, ${retArr.length} patterns left for ${serviceTag}`);
    notifyUpdate(serviceTag);
  }).catch((err) => {
    hydra.sendToHealthLog('error', err);
  });
};

const updatePatterns = (serviceTag) => {
  return hydra.redisdb.smembersAsync(`${registryPreKey}:${serviceTag}`).then(function(patterns) {
    updateLocalRegistry(serviceTag, patterns, true);
  });
};

const updateAllPatterns = () => {
  const patternStartPos = registryPreKey.length + 1;
  return hydra.redisdb.keysAsync(`${registryPreKey}:*`).map((pattern) => {
    return pattern.substring(patternStartPos);
  }).map(updatePatterns);
}
const updateLocalRegistry = (serviceTag, stringifiedPatterns, emptyBeforeUpdate = false) => {
  if (!serviceTag || serviceTag.indexOf(':') == -1 || serviceTag.split(':').length != 2) return;

  hydra.sendToHealthLog('info', `Update local registry for ${serviceTag}`);
  
  if (!registry[serviceTag] || emptyBeforeUpdate) {
    registry[serviceTag] = new Set();
  }
  
  const patterns = _.castArray(stringifiedPatterns);
  
  for (let pattern of patterns) {
    registry[serviceTag].add(pattern);
  }  
};

const notifyUpdate = (serviceTag) => {
  const msg = hydra.createUMFMessage({
    frm: `${hydra.instanceID}@${config.hydra.serviceName}:/`,
    to: `${config.hydra.serviceName}:/`,
    typ: 'event-bus',
    bdy: {
      type: 'changed',
      serviceTag: serviceTag
    }
  });

  hydra.sendBroadcastMessage(msg);
};

const dispatchEvent = (umf) => {
  const evt = umf.bdy.eventName;

  Promise.map(Object.keys(registry), (serviceTag) => {
    const patterns = Array.from(registry[serviceTag]);
    Promise.map(patterns, (pattern) => {
      if (mm.isMatch(evt, pattern)) {
        return dispatchEventToService(serviceTag, evt, pattern, umf.bdy.payload);
      }
    });
  });
};

const dispatchEventToService = (serviceTag, eventName, pattern, payload) => {
  console.log(`Matched - dispatch to ${serviceTag}`);

  const [to, label] = serviceTag.split(':');

  const msg = hydra.createUMFMessage({
    frm: `${config.hydra.serviceName}:/`,
    to: `${to}:/`,
    typ: 'event-bus',
    bdy: {
      type: 'event',
      serviceTag: serviceTag,
      eventName: eventName,
      pattern: pattern,
      payload: payload
    }
  });

  hydra.sendMessage(msg);
}

const stringifyPattern = (pattern) => {
  try {
    if (typeof pattern == 'string') {
      return pattern;
    } else if (typeof pattern == 'object' && pattern instanceof RegExp) {
      return pattern.source;
    }
  } catch (e) {
    return false;
  }
}
