'use strict';
importScripts('./engine.js');
let dataCache = null;
let solutionCache = null;
self.onmessage = function (evt) {
  const { id, payload } = evt.data;
  try {
    const response = self.FarkleEngine.examine(payload, dataCache, solutionCache);
    dataCache = response.dataCache;
    solutionCache = response.solutionCache;
    self.postMessage({ id, result: response.result });
  } catch (error) {
    self.postMessage({ id, error: error && error.message || 'Calculation error.' });
  }
};
