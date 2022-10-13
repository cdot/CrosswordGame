/*Copyright (C) 2021-2022 The Xanado Project https://github.com/cdot/Xanado
  License MIT. See README.md at the root of this distribution for full copyright
  and license information. Author Crawford Currie http://c-dot.co.uk*/
/* eslint-env amd */

define([
  "platform", "common/Utils",
  "dawg/Dictionary", "game/Board", "game/Tile", "game/LetterBag", "game/Turn",
  "common/Types", "game/Commands"
], (
  Platform, Utils,
  Dictionary, Board, Tile, LetterBag, Turn,
  Types, Commands
) => {
  const Notify    = Types.Notify;
  const State     = Types.State;
  const Penalty   = Types.Penalty;
  const Timer     = Types.Timer;
  const WordCheck = Types.WordCheck;
  const Turns     = Types.Turns;

  let messageSequenceNumber = 0;

  /**
   * Server-side base class for {@linkcode Game}
   */
  class ServerGame extends Commands {

    /**
     * Used for testing only.
     * @function
     * @instance
     * @memberof ServerGame
     * @param sboard string representation of a game {@linkcode Board}
     * @return {Promise} resolving to `this`
     */
    loadBoard(sboard) {
      return this.getEdition()
      .then(ed => this.board.parse(sboard, ed))
      .then(() => this);
    }

    /**
     * Get the dictionary for this game, lazy-loading as necessary
     * @function
     * @instance
     * @memberof ServerGame
     * @return {Promise} resolving to a {@linkcode Dictionary}
     */
    getDictionary() {
      if (this.dictionary)
        return Dictionary.load(this.dictionary);

      /* istanbul ignore next */
      return Promise.reject("Game has no dictionary");
    }

    /**
     * Promise to save the game
     * @function
     * @instance
     * @memberof ServerGame
     * @return {Promise} that resolves to the game when it has been saved
     */
    save() {
      Platform.assert(this._db, "No _db for save()");
      this._debug("Saving game", this.key);
      return this._db.set(this.key, this)
      .then(() => this);
    }

    /**
     * Check if the game has timed out due to inactivity.
     * Stops game timers and sets the state of the game if it has.
     * @function
     * @instance
     * @memberof ServerGame
     * @return {Promise} resolves to the game when timeout has
     * been checked
     */
    checkAge() {
      const ageInDays =
            (Date.now() - this.lastActivity())
            / 60000 / 60 / 24;

      if (ageInDays <= 14)
        return Promise.resolve(this); // still active

      this._debug("Game", this.key, "timed out");

      this.state = State.TIMED_OUT;
      return this.save();
    }

    /**
     * Promise to finish the construction or load from serialisation
     * of a game.
     * A game has to know what DB so it knows where to save. The
     * database and connections are not serialised, and must be
     * reset. Only available server-side.
     * @function
     * @instance
     * @memberof ServerGame
     * @param {Database} db the db to use to store games
     * @return {Promise} Promise that resolves to the game
     */
    onLoad(db) {
      // if this onLoad follows a load from serialisation, which
      // does not invoke the constructor.
      // We always set the _db

      /**
       * Database containing this game. Only available server-side,
       * and not serialised.
       * @member {Database}
       * @private
       */
      this._db = db;

      /**
       * List of decorated sockets. Only available server-side, and
       * not serialised.
       * @member {WebSocket[]}
       * @private
       */
      this._connections = [];

      // Compatibility; timeLimit in s to timeAllowed in minutes
      if (this.timeLimit && !this.timeAllowed)
        this.timeAllowed = this.timeLimit / 60;

      if (!this._debug) {
        this._debug = () => {};
        this.players.forEach(p => p._debug = this._debug);
      }

      return Promise.resolve(this);
    }

    /**
     * Send a message to just one player. Note that the player
     * may be connected multiple times through different sockets.
     * @function
     * @instance
     * @memberof ServerGame
     * @param {Player} player player to send to
     * @param {string} message to send
     * @param {Object} data to send with message. Will have
     * `messageID` added to it.
     */
    notifyPlayer(player, message, data) {
      const body = {
        messageID: ++messageSequenceNumber,
        data: data
      };
      this._debug("<-S-", player.key, message,
                  messageSequenceNumber, Utils.stringify(data));
      // Player may be connected several times
      this._connections.forEach(
        socket => {
          if (socket.player === player)
            socket.emit(message, body);
          return false;
        });
    }

    /**
     * Broadcast a message to all game observers. Note
     * that an observer may be connected multiple times,
     * through different sockets.
     * @function
     * @instance
     * @memberof ServerGame
     * @param {string} message to send
     * @param {Object} data to send with message
     */
    notifyAll(message, data) {
      const body = {
        messageID: ++messageSequenceNumber,
        data: data
      };
      if (message !== Notify.TICK)
        this._debug("<-S- *", message, messageSequenceNumber, Utils.stringify(data));
      this._connections.forEach(socket => socket.emit(message, body));
    }

    /**
     * Broadcast a message to all observers players except the
     * given player.
     * @function
     * @instance
     * @memberof ServerGame
     * @param {Player} player player to exclude
     * @param {string} message to send
     * @param {Object} data to send with message
     */
    notifyOthers(player, message, data) {
      const body = {
        messageID: ++messageSequenceNumber,
        data: data
      };
      this._debug("<-S- !", player.key, message, messageSequenceNumber,
                  Utils.stringify(data));
      this._connections.forEach(
        socket => {
          // Player may be connected several times, so check key and not object
          if (socket.player.key !== player.key)
            socket.emit(message, body);
          return false;
        });
    }

    /**
     * Start, or continue, playing the game if preconditions are met.
     * @function
     * @instance
     * @memberof ServerGame
     * @return {Promise} promise that resolves to the game
     */
    playIfReady() {
      this._debug("playIfReady ", this.key,
                  this.whosTurnKey ? `player ${this.whosTurnKey}` : "",
                  "state", this.state);

      if (this.hasEnded()) {
        this._debug("\tgame is over");
        return Promise.resolve(this);
      }

      // Check preconditions for starting the game
      if (this.players.length < (this.minPlayers || 2)) {
        this._debug("\tnot enough players");
        // Result is not used
        return Promise.resolve(this);
      }

      // If no turn has been allocated yet,
      // shuffle the players, and pick a random tile from the bag.
      // The shuffle can be suppressed for unit testing.
      if (this.state === State.WAITING) {
        this._debug("\tpreconditions met");

        if (this.players.length > 1 && !this._noPlayerShuffle) {
          this._debug("\tshuffling player order");
          for (let i = this.players.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            // i = 1, j = 0,1
            //    j = 0, swap 0 and 1
            //    j = 1, leave 1 in place
            const temp = this.players[i];
            this.players[i] = this.players[j];
            this.players[j] = temp;
          }
          // Notify all connections of the order change
          // (asynchronously)
          this.sendCONNECTIONS();
        }

        const player = this.players[0];
        this.whosTurnKey = player.key; // assign before save()
        this._debug(`\t${player.key} to play`);
        this.state = State.PLAYING;

        return this.save()
        // startTurn will autoplay if the first player is
        // a robot. It will also start the clock.
        .then(() => this.startTurn(player));
      }

      const nextPlayer = this.getPlayer();
      if (nextPlayer) {
        if (nextPlayer.isRobot)
          return this.startTurn(nextPlayer);

        this._debug("\twaiting for", nextPlayer.name, "to play");
        this.startTheClock();
      }
      return Promise.resolve(this);
    }

    /**
     * Wrap up after a command handler that is returning a Turn.
     * Log the command, determine whether the game has ended,
     * save state and notify connected players with the Turn object.
     * @function
     * @instance
     * @memberof ServerGame
     * @param {Player} player player who's turn it was
     * @param {object} turn fields to populate the Turn to finish
     * @return {Promise} that resolves to the game
     */
    finishTurn(player, turn) {
      turn = new Turn(turn);
      turn.gameKey = this.key;
      turn.playerKey = player.key;
      turn.timestamp = Date.now();

      // store turn (server side)
      this.pushTurn(turn);

      let redacted = turn;

      // Censor replacements for all but the player who's play it was
      if (!this.allowUndo && turn.replacements) {
        redacted = new Turn(turn);
        redacted.replacements = [];
        for (const tile of turn.replacements) {
          const rt = new Tile(tile);
          rt.letter = '#';
          redacted.replacements.push(rt);
        }
      }

      // TODO: the results of a turn should not simply be broadcast,
      // because a client could intercept and reconstruct other
      // player's racks from the results. Really there should be
      // one turn broadcast, and a different turn sent to the
      // playing player.
      return this.save()
      .then(() => Promise.all([
        this.notifyPlayer(player, Notify.TURN, turn),
        this.notifyOthers(player, Notify.TURN, redacted)
      ]))
      .then(() => this);
    }

    /**
     * Does player have an active connection to this game?
     * @function
     * @instance
     * @memberof ServerGame
     * @param {Player} player the player
     * @return {WebSocket} a decorated socket, or null if not connected.
     */
    getConnection(player) {
      if (player) {
        for (const socket of this._connections) {
          if (socket.player && socket.player === player) {
            player._isConnected = true;
            return socket;
          }
        }
        player._isConnected = false;
      }
      return null;
    }

    /**
     * Notify players with a list of the currently connected
     * players, non-playing observers and non-connected players.
     * @function
     * @instance
     * @memberof ServerGame
     */
    sendCONNECTIONS() {
      Promise.all(
        this.players
        .map(player => player.serialisable(this)
             .then(cat => {
               cat.gameKey = this.key;
               if (cat.key === this.whosTurnKey)
                 cat.isNextToGo = true;
               return cat;
             })))
      .then(res => {
        // Add observers who are not active players. These track
        // game state without participating, though at some point
        // we may add referreing functions.
        res = res.concat(
          this._connections
          .filter(socket => !socket.player)
          .map(socket => {
            return {
              isObserver: true
            };
          }));
        this.notifyAll(Notify.CONNECTIONS, res);
      });
    }

    /**
     * Start (or restart) the turn of the given player.
     * @function
     * @instance
     * @memberof ServerGame
     * @param {Player?} player the the player to get the turn.
     * @param {number?} timeout Only relevant when `timerType` is
     * `Timer.TURN`. Turn timeout for this turn. Set if
     * this is a restart of an unfinished turn, defaults to
     * this.timeAllowed if undefined.
     * @return {Promise} a promise that resolves to undefined
     * @private
     */
    startTurn(player, timeout) {
      Platform.assert(player, "No player");

      if (!this.players.find(p => p.passes < 2))
        return this.confirmGameOver(player, State.TWO_PASSES);

      this._debug("startTurn", player.name, player.key);

      this.whosTurnKey = player.key;

      if (player.isRobot) {
        // May recurse if the player after is also a robot, but
        // the recursion will always stop when a human player
        // is reached, so never deep.
        return this.autoplay();
      }

      // For a timed game, make sure the clock is running and
      // start the player's timer.

      if (this.timerType) {
        this._debug("\ttimed game,", player.name,
                    "has", (timeout || this.timeAllowed), "left to play",this.timerType);
        this.startTheClock(); // does nothing if already started
      }
      else {
        this._debug(
          `\tuntimed game, wait for ${player.name} to play`);
        return Promise.resolve(this);
      }

      if (this.timerType === Timer.TURN)
        // Make the player pass when their clock reaches 0
        player.setTimeout(
          timeout || this.timeAllowed * 60,
          () => this.pass(player, Turns.TIMED_OUT));

      return Promise.resolve(this);
    }

    /**
     * Player is on the given socket, as determined from an incoming
     * 'join'. Play the game if preconditions have been met.  Only
     * available server side.
     * @function
     * @instance
     * @memberof ServerGame
     * @param {WebSocket} socket the connecting socket
     * @param {string} playerKey the key identifying the player
     * @return {Promise} promise that resolves to undefined
     */
    connect(socket, playerKey) {

      // Make sure this is a valid (known) player
      const player = this.players.find(p => p.key === playerKey);
      /* istanbul ignore if */
      if (playerKey && !player)
        console.error("WARNING: player key", playerKey,
                      "not found in game", this.key);

      /* istanbul ignore if */
      if (this.getConnection(player)) {
        console.error("WARNING:", playerKey, "already connected to",
                      this.key);
        player._isConnected = true;
      } else if (player) {
        // This player is just connecting
        this._debug(`\t${player.name} connected to ${this.key}`);
        player._isConnected = true;
      } else
        this._debug("\tconnected non-player");

      // Player is connected. Decorate the socket. It may seem
      // rather cavalier, writing over the socket this way, but
      // it does simplify the code quite a bit.
      socket.game = this;
      socket.player = player;

      this._connections.push(socket);

      // Tell players that the player is connected
      this.sendCONNECTIONS();

      // Add disconnect listener
      /* istanbul ignore next */
      socket.on("disconnect", () => {
        if (socket.player) {
          socket.player._isConnected = false;
          this._debug(socket.player.name, "disconnected");
        } else
          this._debug("non-player disconnected");
        this._connections.splice(this._connections.indexOf(socket), 1);
        this.sendCONNECTIONS();
      });

      return this.playIfReady();
    }

    /**
     * Tell all clients a tick has happened (or
     * remind them of the current number of seconds to play)
     * @function
     * @instance
     * @memberof ServerGame
     * @private
     */
    tick() {
      const player = this.getPlayer();
      if (!player)
        return;

      player.tick();

      // Really should save(), otherwise the ticks won't
      // survive a server restart. However it's expensive, and server
      // restarts are rare, so let's not.
      this.notifyAll(
        Notify.TICK,
        {
          gameKey: this.key,
          playerKey: player.key,
          clock: player.clock,
          timestamp: Date.now()
        });
    }

    /**
     * If the game has a time limit, start an interval timer.
     * @return {boolean} true if the clock is started, false otherwise
     * (e.g. if it is already running)
     * @function
     * @instance
     * @memberof ServerGame
     * @private
     */
    startTheClock() {
      if (typeof this._intervalTimer === "undefined"
          && this.timerType
          && this.state === State.PLAYING) {

        // Broadcast a ping every second
        /**
         * Timer object for ticking.
         * @member {object?}
         * @private
         */
        this._intervalTimer = setInterval(() => this.tick(), 1000);
        this._debug(this.key, "started the clock");
        return true;
      }
      return false;
    }

    /**
     * Stop the interval timer, if there is one
     * @function
     * @instance
     * @memberof ServerGame
     * @return {boolean} true if the clock is stopped, false otherwise
     * @private
     */
    stopTheClock() {
      if (typeof this._intervalTimer == "undefined")
        return false;
      this._debug(this.key, "stopped the clock");
      clearInterval(this._intervalTimer);
      delete(this._intervalTimer);
      return true;
    }

    /**
     * Robot play for the current player. This may result in a challenge.
     * @function
     * @instance
     * @memberof ServerGame
     * @return {Promise} resolving to this
     */
    autoplay() {
      const player = this.getPlayer();
      this._debug("Autoplaying", player.name,
                  "using", player.dictionary || this.dictionary);

      let pre = ((player.delayBeforePlay || 0) > 0)
          ? new Promise(
            resolve => setTimeout(resolve, player.delayBeforePlay * 500))
          : Promise.resolve();
      let mid = ((player.delayBeforePlay || 0) > 0)
          ? new Promise(
            resolve => setTimeout(resolve, player.delayBeforePlay * 500))
          : Promise.resolve();
      // Before making a robot move, consider challenging the last
      // player.
      // challenge is a Promise that will resolve to true if a
      // challenge is made, or false otherwise.
      let lastPlay = this.lastTurn();
      if (lastPlay && lastPlay.type === Turns.PLAYED
          && this.dictionary
          && player.canChallenge) {
        const lastPlayer = this.getPlayerWithKey(lastPlay.playerKey);
        // There's no point if they are also a robot, though
        // that should never arise in a "real" game where there can
        // only be one robot.
        if (!lastPlayer.isRobot) {
          // use game dictionary, not robot dictionary
          pre = pre.then(() => this.getDictionary())
          .then(dict => {
            const bad = lastPlay.words
                  .filter(word => !dict.hasWord(word.word));
            if (bad.length > 0) {
              // Challenge succeeded
              this._debug(`Challenging ${lastPlayer.name}`);
              this._debug(`Bad words: `, bad);
              return this.takeBack(player, Turns.CHALLENGE_WON)
              .then(() => true);
            }
            return false; // no challenge made
          });
        }
      }

      return pre
      .then(challenged => {
        if (!challenged && lastPlay) {
          // Last play was good, check the last player has tiles
          // otherwise the game is over
          const lastPlayer = this.getPlayerWithKey(lastPlay.playerKey);
          if (lastPlayer.rack.isEmpty())
            return this.confirmGameOver(player, State.GAME_OVER);
        }

        // We can play.
        let bestPlay = null;
        return Platform.findBestPlay(
          this, player.rack.tiles(),
          data => {
            if (typeof data === "string")
              this._debug(data);
            else {
              bestPlay = data;
              this._debug("Best", bestPlay.stringify());
            }
          }, player.dictionary || this.dictionary)
        .then(() => {
          if (bestPlay)
            return mid.then(() => this.play(player, bestPlay));

          this._debug(`${player.name} can't play, passing`);
          return this.pass(player, Turns.PASSED);
        });
      });
    }
  }

  return ServerGame;
});
