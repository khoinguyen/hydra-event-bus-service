const hydraExpress = require('hydra-express');

module.exports = () => {
  const hydra = hydraExpress.getHydra();
  const ServerResponse = hydra.getServerResponseHelper();
  const serverResponse = new ServerResponse();
  const express = hydraExpress.getExpress();
  
  express.response.sendError = function(err) {
    serverResponse.sendServerError(this, {
      result: {
        error: err
      }
    });
  };

  express.response.sendOk = function(result) {
    serverResponse.sendOk(this, {
      result
    });
  };
}
