/**
 * Created by tranthiennhan on 7/4/17.
 */

const _ = require('lodash');
const mm = require('micromatch');

const hydraExpress = require('hydra-express');
const hydra = hydraExpress.getHydra();


const Promise = require('bluebird');
Promise.promisifyAll(require('redis').RedisClient.prototype);


/* Constants */
const ebPreKey = 'hydra:event-bus';
const registryPreKey = ebPreKey + ':registry';
const config = require('../lib/config-helper');
const registry = {};

const registerPatternsForService = ({
  type,
  patterns,
  serviceTag
}) => {
  if (!type || type != 'register') return;

  const stringifiedPatterns = stringifyPatterns(patterns);

  if (!stringifiedPatterns) return;

  updateLocalRegistry(serviceTag, stringifiedPatterns);

  const addPatternToRedis = (pattern) => hydra.redisdb.saddAsync(`${registryPreKey}:${serviceTag}`, pattern);
  
  Promise.each(stringifiedPatterns, addPatternToRedis)
  .then(function () {
    hydraExpress.appLogger.info(`Registered ${stringifiedPatterns.length} patterns for ${serviceTag}`);
    notifyUpdate(serviceTag);
  })
  .catch(hydraExpress.appLogger.error);
};

const _buildAddPatternToServiceRedisRegistry = (serviceTag) => (pattern) => hydra.redisdb.saddAsync(`${registryPreKey}:${serviceTag}`, pattern);

const unregisterPatternsForService = ({
  type,
  patterns,
  serviceTag
}) => {
  if (!type || type != 'unregister') return;

  const stringifiedPatterns = stringifyPatterns(patterns);

  if (!stringifiedPatterns || !registry[serviceTag]) return;

  const keepPatterns = filterPatternsToKeepInRegistry(stringifiedPatterns, serviceTag);

  updateLocalRegistry(serviceTag, keepPatterns, true);

  hydra.redisdb.delAsync(`${registryPreKey}:${serviceTag}`).then(() => {
      return Promise.each(keepPatterns, _buildAddPatternToServiceRedisRegistry(serviceTag));
  })
    .then( () => {
      hydra.sendToHealthLog('info', `Unregistered ${stringifiedPatterns.length} patterns, ${keepPatterns.length} patterns left for ${serviceTag}`);
      notifyUpdate(serviceTag);
    }).catch((err) => {
      hydra.sendToHealthLog('error', err);
    });
};

const updatePatterns = ({
  type,
  serviceTag
}) => {
  if (!type || type != 'changed') return;

  return hydra.redisdb.smembersAsync(`${registryPreKey}:${serviceTag}`).then(function (patterns) {
    updateLocalRegistry(serviceTag, patterns, true);
  });
};

const updateAllPatterns = () => {
  const patternStartPos = registryPreKey.length + 1;
  return hydra.redisdb.keysAsync(`${registryPreKey}:*`).map((pattern) => {
    return pattern.substring(patternStartPos);
  }).map((serviceTag) => {
    updatePatterns({
      type: 'changed',
      serviceTag: serviceTag
    });
  });

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

const dispatchEventUMF = ({
  type,
  eventName,
  payload
}) => {
  if (!type || type != 'event') return;

  return dispatchEvent(eventName, payload);
}

const dispatchEvent = (evt, payload) => {
  Object.keys(registry).forEach((serviceTag) => {

    const dispatchForPattern = (pattern) => dispatchEventToService(serviceTag, evt, pattern, payload);
    const isPatternMatched = (pattern) => mm.isMatch(evt, pattern);

    const patterns = Array.from(registry[serviceTag]);
    patterns
      .filter(isPatternMatched)
      .forEach(dispatchForPattern);
  });
}

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

const updatePatternsOnMessageReceived = (umf) => {
  if (umf.typ !== 'event-bus')
    return;

  const body = umf.bdy;

  registerPatternsForService(body);
  unregisterPatternsForService(body);
  dispatchEventUMF(body);

  const frmParts = umf.frm.split('@');
  if (frmParts.length != 2 || frmParts[0] != hydra.instanceID) {
    updatePatterns(body);
  }
};


module.exports = {
  dispatchEventUMF,
  dispatchEvent,
  updateAllPatterns,
  registerPatternsForService,
  unregisterPatternsForService,
  updatePatternsOnMessageReceived
}
function filterPatternsToKeepInRegistry(stringifiedPatterns, serviceTag) {
  const removablePatterns = new Set(stringifiedPatterns);
  return Array.from(registry[serviceTag]).filter((pattern) => !removablePatterns.has(pattern));
}

function stringifyPatterns(patterns) {
  return _.castArray(patterns)
    .map(stringifyPattern)
    .filter((pattern) => pattern !== false);
}
