/*Copyright (C) 2019-2022 The Xanado Project https://github.com/cdot/Xanado
  License MIT. See README.md at the root of this distribution for full copyright
  and license information. Author Crawford Currie http://c-dot.co.uk*/

/* global Platform */

import Worker from "web-worker";
import { BackendGame } from "./BackendGame.js";

/** @module */

/**
 * This is the controller side of a best play thread.
 * Interface is the same as for {@linkcode findBestPlay} so they
 * can be switched in and out.
 */
function findBestPlay(
  game, letters, listener, dictionary) {

  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL("./findBestPlayWorker.js", import.meta.url),
      { type: "module" });

    // Apply the game time limit
    let timer;
    if (game.timerType === BackendGame.Timer.TURN) {
      /* istanbul ignore next */
      timer = setTimeout(() => {
        console.error("findBestPlay timed out");
        worker.terminate();
      }, game.timeAllowed * 60000);
    }

    // Pass worker messages on to listener
    worker.addEventListener("message", data => {
      const mess = BackendGame.fromCBOR(data.data, BackendGame.CLASSES);
      switch (mess.type) {
      case "play":
        listener(mess.data);
        break;
      case "exit":
        if (timer)
          /* istanbul ignore next */
          clearTimeout(timer);
        resolve();
        break;
      }
    });

    worker.addEventListener("error", e => {
      console.error("Worker:", e.message, e.filename, e.lineno);
      if (timer)
        clearTimeout(timer);
      reject();
    });

    worker.postMessage(BackendGame.toCBOR({
      Platform: Platform.name,
      game: game,
      rack: letters,
      dictionary: dictionary
    }));
  });
}

export { findBestPlay }

