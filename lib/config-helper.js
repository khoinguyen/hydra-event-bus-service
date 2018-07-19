const configHelper = require('hydra-env-secret');
const initConfig = require('../config/config.json');
module.exports = configHelper(initConfig);
