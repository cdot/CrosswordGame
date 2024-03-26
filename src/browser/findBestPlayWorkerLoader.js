/*Copyright (C) 2024 The Xanado Project https://github.com/cdot/Xanado
  License MIT. See README.md at the root of this distribution for full copyright
  and license information. Author Crawford Currie http://c-dot.co.uk*/

/**
 * Startup module for findBestPlay in browser web workers. Browser web
 * workers don't don't support importmap, so we have to do some
 * contortions.
 */

/* global importScripts, importShim */
/* global addEventListener, removeEventListener, postMessage */

// See https://www.npmjs.com/package/es-module-shims
importScripts("https://ga.jspm.io/npm:es-module-shims@1.8.3/dist/es-module-shims.wasm.js");

// We start the load by installing this handler which loads the import
// map into the shim before importing the "real" findBestPlayWorker. When
// that import is complete it overwrites onmessage and picks up future
// controller posts.
function messageHandler(e) {
  let importmap = e.data;
  //console.debug(`findBestPlayWorkerLoader.onmessage ${importmap}`);
  importmap = JSON.parse(importmap);
  for (const imp of Object.keys(importmap.imports)) {
    // The worker is in a subdirectory so have to rewrite the importmap
    importmap.imports[imp] = importmap.imports[imp]
    .replace(/^\.\.\//, "../../");
  }
  //console.debug("findBestPlayWorkerLoader importmap=", importmap);
  importShim.addImportMap(importmap);
  importShim("../backend/findBestPlayWorker.js")
  .then(() => {
    // findBestPlayWorker will have installed it's own handler
    removeEventListener("message", messageHandler);
    postMessage("R");
  })
  .catch(e => setTimeout(() => { throw e; }));
}

addEventListener("message", messageHandler);

