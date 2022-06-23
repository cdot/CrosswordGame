/*Copyright (C) 2019-2022 The Xanado Project https://github.com/cdot/Xanado
  License MIT. See README.md at the root of this distribution for full copyright
  and license information. Author Crawford Currie http://c-dot.co.uk*/
/* eslint-env amd */

define("game/Game", [
	"platform", "common/Utils",
	"dawg/Dictionary",
	"game/Types", "game/Board", "game/LetterBag", "game/Edition",
	"game/Player", "game/Square", "game/Tile", "game/Rack", "game/Move",
	"game/Turn"
], (
	Platform, Utils,
	Dictionary,
	Types, Board, LetterBag, Edition,
	Player, Square, Tile, Rack, Move,
	Turn
) => {

  const Notify    = Types.Notify;
  const State     = Types.State;
  const Penalty   = Types.Penalty;
  const Timer     = Types.Timer;
  const WordCheck = Types.WordCheck;
  const Turns     = Types.Turns;

  function _showData(data) {
    const s = data.toString();
    return (s === "[object Object]") ? data : s;
  }

	/**
	 * The Game object may be used server or browser side.
	 */
	class Game {

		// Classes used in Freeze/Thaw
		static classes = [ LetterBag, Square, Board, Tile, Rack,
						           Game, Player, Move, Turn ];

		/**
		 * A new game is constructed from scratch by
		 * ```
		 * new Game(...).create().then(game => game.onLoad(db)...
		 * ```
		 * A game identified by key is loaded from a db by
		 * ```
		 * db.get(key, Game.classes).then(game => game.onLoad(db)...
		 * ```
		 * (may be null)
		 * @param {object} params Parameter object. This can be another
		 * Game to copy game parameters, the result from Game.simple(),
		 * or a generic object with fields the same name as Game fields.
     * Note that `players` and `turns` are not copied.
		 */
		constructor(params) {
		  /**
		   * An i18n message identifier indicating the game state.
		   * @member {State}
		   */
      this.state = State.WAITING;
    
		  /**
		   * Key that uniquely identifies this game.
		   * @member {Key}
		   */
		  this.key = undefined;

		  /**
		   * Epoch ms when this game was created.
       * Initialised in {@linkcode Game#create}
		   * @member {number}
		   */
		  this.creationTimestamp = undefined;

		  /**
		   * List of players in the game.
		   * @member {Player[]}
       * @private
		   */
		  this.players = [];

		  /**
		   * Complete list of the turn history of this game.
		   * @member {Turn[]}
       * @private
		   */
		  this.turns = [];

		  /**
		   * Key of next player to play in this game.
		   * @member {string?}
		   */
		  this.whosTurnKey = undefined; // Note: playIfReady sets it.

      /**
		   * The name of the edition.
		   * We don't keep a pointer to the {@linkcode Edition} so we can
		   * cheaply freeze and send to the games interface. 
		   * @member {string}
		   */
		  this.edition = params.edition;

		  /**
		   * The game board.
       * Initialised in {@linkcode Game#create}.
		   * @member {Board}
		   */
		  this.board = undefined;

		  /**
		   * Size of rack. Always the same as Edition.rackCount,
		   * because we don't hold a pointer to the Edition. Note this
		   * is saved with the game.
       * Copied from the {@linkcode Edition} in {@linkcode Game#create}.
		   * @member {number}
		   */
		  this.rackSize = params.rackSize;

		  /**
		   * Size of swap rack.
		   * Copied from the {@linkcode Edition} in {@linkcode Game#create}.
		   * @member {number}
		   */
		  this.swapSize = undefined;

      /**
       * Map of number of tiles played, to bonus for the play.
       * Copied from the {@linkcode Edition} in {@linkcode Game#create}.
       * @member {object<number,number>}
       * @private
       */
      this.bonuses = undefined;

		  /**
		   * Bag of remaining letters, initialised from the edition.
       * Initialised in {@linkcode Game#create}.
		   * @member {LetterBag}
		   */
		  this.letterBag = undefined;

			/* istanbul ignore if */
			if (typeof params._debug === "function")
        /**
		     * Debug function.
		     * @member {function}
         * @private
		     */
				this._debug = params._debug;
      else
        this._debug = () => {};

      /*
       * When you name a field in the class declaration without an
       * initial value, it gets intitialised to undefined. This means the
       * object gets cluttered with undefined fields that are not used
       * in the configuration. The rationale is to make the class declaration
       * more self-documenting, but since we document all possible fields
       * using jsDoc it is overkill. This loop initialises 
       */
      for (const k in params) {
        if (this.hasOwnProperty(k)
            && k.indexOf("_") !== 0
            && k !== "players"
            && k !== "turns") {
          this[k] = params[k];
        }
      }

      if (params.dictpath)
        /**
		     * Optional override of the path used by {@linkcode Dictionary}
		     * to load dictionaries
		     * @member {string?}
		     */
        this.dictpath = params.dictpath;

			if (params.dictionary)
		    /**
		     * We don't keep a pointer to dictionary objects so we can
		     * cheaply serialise the game and send to the UI. We just
		     * keep the name of the dictionary.
		     * @member {string?}
		     */
			  this.dictionary = params.dictionary;

      if (params.timerType)
		    /**
         * Type of timer for this game.
		     * @member {Timer}
		     */
        this.timerType = params.timerType;

			if (this.timerType) {
        if (typeof params.timeLimit !== "undefined")
		      /**
		       * Time limit for this game.. If `timerType` is `TIMER_GAME`
           * defaults to 25 minutes, and 1 minute for `TIMER_TURN`.
		       * @member {number?}
		       */
          this.timeLimit = params.timeLimit;
        else if (typeof params.timeLimitMinutes !== "undefined")
				  this.timeLimit = params.timeLimitMinutes * 60;
        else
          this.timeLimit = 0;
        if (this.timeLimit <= 0) {
          if (this.timerType === Timer.GAME)
            this.timeLimit = 25 * 60; // 25 minutes
          else
            this.timeLimit = 1 * 60; // 1 minute
        }

        if (this.timerType === Timer.GAME)
		      /**
		       * Time penalty for this game, points lost per minute over
		       * timeLimit. Only used if `timerType` is `TIMER_GAME`.
		       * @member {number?}
		       */
          this.timePenalty = params.timePenalty || 5;
			}

		  /**
		   * The type of penalty to apply for a failed challenge.
       * @member {Penalty}
		   */
		  this.challengePenalty = params.challengePenalty || Penalty.MISS;

      if (this.challengePenalty === Penalty.PER_TURN
          || this.challengePenalty === Penalty.PER_WORD)
		    /**
		     * The score penalty to apply for a failed challenge. Only used
         * if `challengePenalty` is `Penalty.PER_TURN` or `Penalty.PER_WORD`.
		     * @member {number}
		     */
        this.penaltyPoints = params.penaltyPoints || 5;

      if (params.wordCheck && params.wordCheck !== WordCheck.NONE)
        		/**
		         * Whether or not to check plays against the dictionary.
             * @member {WordCheck}
		         */
		    this.wordCheck = params.wordCheck;

			if (params.minPlayers > 2)
		    /**
		     * Least number of players must have joined before this game
		     * can start. Must be at least 2.
		     * @member {number?}
		     */
        this.minPlayers = params.minPlayers;

			if (params.maxPlayers > 2)
		    /**
		     * Most number of players who can join this game. 0
		     * means no limit.
		     * @member {number}
		     */
        this.maxPlayers = params.maxPlayers;

      if (typeof this.maxPlayers !== "undefined"
          && this.maxPlayers < (this.minPlayers || 2))
        delete this.maxPlayers; // infinity

      if (params.predictScore)
		    /**
		     * Whether or not to show the predicted score from tiles
		     * placed during the game. This should be false in tournament
		     * play, true otherwise.
		     * @member {boolean}
		     */
		    this.predictScore = true;

      if (params.allowTakeBack)
		    /**
		     * Whether or not to allow players to take back their most recent
		     * move without penalty, so long as the next player hasn't
		     * challenged or played.
		     * @member {boolean}
		     */
		    this.allowTakeBack = true;

      if (params.noPlayerShuffle || params._noPlayerShuffle)
        /**
		     * Internal, for debug only.
		     * @member {boolean}
         * @private
		     */
        this._noPlayerShuffle = true;

      if (params.players) {
        for (let i = 0; i < params.players.length; i++)
          this.players[i] = new Player(params.players[i]);
      }

      if (params.nextGameKey)
        /**
		     * When a game is ended, nextGameKey is the key for the
		     * continuation game.
		     * @member {string?}
		     */
        this.nextGameKey = params.nextGameKey;

      if (params.pausedBy)
		    /**
		     * Name of the player who paused the game (if it's paused).
		     * @member {string?}
		     */
        this.pausedBy = params.pausedBy;
		}

		/**
		 * Promise to finish construction of a new Game.
		 * Load the edition and create the board and letter bag.
		 * Not done in the constructor because we need to return
		 * a Promise. Must be followed by onLoad to connect a
		 * DB and complete initialisation of private fields.
		 * @return {Promise} that resolves to this
		 */
		create() {
			// Can't be done in the constructor because we have to
			// return a Promise.
		  this.creationTimestamp = Date.now();
		  this.key = Utils.genKey();
      this.state = State.WAITING;
      this.players = [];
			this._debug("create()ed new game", this.toString());
			return this.getEdition(this.edition)
			.then(edo => {
				this.board = new Board(edo);
				this.letterBag = new LetterBag(edo);
        this.bonuses = edo.bonuses;
				this.rackSize = edo.rackCount;
				this.swapSize = edo.swapCount;
				return this;
			});
		}

		/**
		 * Promise to finish the construction or load from serialisation
		 * of a game.
		 * A game has to know what DB so it knows where to save. The
		 * database and connections are not serialised, and must be
		 * reset. Only available server-side.
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
      if (!this._debug) {
        this._debug = () => {};
        this.players.forEach(p => p._debug = this._debug);
      }
			return Promise.resolve(this);
		}

		/**
		 * Add a player to the game, and give them an initial rack
		 * @param {Player} player
		 */
		addPlayer(player) {
			/* istanbul ignore if */
			if (!this.letterBag)
				throw Error("Cannot addPlayer() before create()");
			/* istanbul ignore next */
			if (this.maxPlayers && this.players.length === this.maxPlayers)
				throw Error("Cannot addPlayer() to a full game");			
			player.debug = this._debug;
			this.players.push(player);
			player.fillRack(this.letterBag, this.rackSize);
			this._debug(this.key, "added player", player.toString());
			if (this.timerType !== Timer.NONE)
				player.clock = this.timeLimit;
		}

		/**
		 * Remove a player from the game, taking their tiles back into
		 * the bag
		 * @param {Player} player
		 */
		removePlayer(player) {
			player.returnTiles(this.letterBag);
			const index = this.players.findIndex(p => p.key === player.key);
			/* istanbul ignore if */
			if (index < 0)
				throw Error(`No such player ${player.key} in ${this.key}`);
			this.players.splice(index, 1);
			this._debug(player.key, "left", this.key);
			if (this.players.length < (this.minPlayers || 2)
          && this.state !== State.GAME_OVER)
				this.state = State.WAITING;
		}

		/**
		 * Get the player by key.
		 * @param {string} key key of player to get. If undefined, will
		 * return the current player
		 * @return {Player} player, or undefined if not found
		 */
		getPlayer(key) {
			if (typeof key === "undefined")
				key = this.whosTurnKey;
			return this.players.find(p => p.key === key);
		}

		/**
		 * Get a list of all players in the game
		 * @return {Player[]} list of players
		 */
    getPlayers() {
      return this.players;
    }

		/**
		 * Get the last player before the given player, identified by key
		 * @param {string|Player} player the current player if undefined, or
		 * the player to get the previous player of
		 * @return {Player} previous player
		 */
		previousPlayer(player) {
			if (typeof player === "undefined")
				player = this.getPlayer(this.whosTurnKey);
			else if (typeof player === "string")
				player = this.getPlayer(player);
			const index = this.players.findIndex(p => p.key === player.key);
			/* istanbul ignore if */
			if (index < 0)
				throw new Error(`${player.key} not found in ${this.key}`);
			return this.players[
				(index + this.players.length - 1) % this.players.length];
		}

		/**
		 * Get the next player to play. A player might be skipped if they
		 * are marked as missing a turn.
		 * @param {string|Player} player the current player if undefined,
		 * or the key of a player, or the player
		 * of the player to get the next player to
		 * @return {Player} the next player
		 */
		nextPlayer(player) {
			if (typeof player === "undefined")
				player = this.getPlayer(this.whosTurnKey);
			else if (typeof player === "string")
				player = this.getPlayer(player);
			let index = this.players.findIndex(p => p.key === player.key);
			/* istanbul ignore if */
			if (index < 0)
				throw new Error(`${player.key} not found in ${this.key}`);
			for (let i = 0; i < this.players.length; i++) {
				let nextPlayer = this.players[(index + 1) % this.players.length];
				if (nextPlayer.missNextTurn) {
					nextPlayer.missNextTurn = false;
					index++;
				} else
					return nextPlayer;
			}
			/* istanbul ignore next */
			throw new Error(
				`Unable to determine next player after ${player.key}`);
		}

		/**
		 * Get the player with key
		 * @param {string} player key
		 * @return {Player} player, or undefined if not found
		 */
		getPlayerWithKey(key) {
			return this.players.find(p => p.key === key);
		}

		/**
		 * Used for testing only.
		 * @param sboard string representation of a game {@linkcode Board}
		 * @return {Promise} resolving to `this`
		 */
		loadBoard(sboard) {
			return this.getEdition(this.edition)
			.then(ed => this.board.parse(sboard, ed))
			.then(() => this);
		}

		/**
		 * Get the edition for this game, lazy-loading as necessary
		 * @return {Promise} resolving to an {@linkcode Edition}
		 */
		getEdition() {
			return Edition.load(this.edition);
		}

		/**
		 * Get the dictionary for this game, lazy-loading as necessary
		 * @return {Promise} resolving to a {@linkcode Dictionary}
		 */
		getDictionary() {
			if (this.dictionary)
				return Dictionary.load(this.dictionary, this.dictpath);

			// Terminal, no point in translating
			/* istanbul ignore next */
			return Promise.reject("Game has no dictionary");
		}

    /**
     * Calculate any bonus afforded to plays of this length
     * @param {number} tilesPaced number of tiles placed
     * @return points bonus
     */
    calculateBonus(tilesPlaced) {
      return this.bonuses ? (this.bonuses[tilesPlaced] || 0) : 0;
    }

		/**
		 * Get the current winning score
		 * @return {number} points
		 */
		winningScore() {
			return this.players.reduce(
				(max, player) => Math.max(max, player.score), 0);
		}

		/**
		 * If there is a player with no tiles, return them.
		 * @return {Player} the player with no tiles, or undefined
		 */
		getPlayerWithNoTiles() {
			return this.players.find(
				player => (player.rack.tiles().length === 0));
		}

		/**
		 * Return true if the game state indicates the game has ended
		 */
		hasEnded() {
			return !(this.state === State.WAITING
					     || this.state === State.PLAYING);
		}

		/**
		 * Determine when the last activity on the game happened. This
		 * is either the last time a turn was processed, or the creation time.
		 * @return {number} a time in epoch ms
		 */
		lastActivity() {
			const last = this.lastTurn();
			if (last)
				return last.timestamp;

			return this.creationTimestamp;
		}

		/**
		 * Get the last turn made in this game.
		 * @return {Turn} the last turn recorded for the game, or undefined
		 * if no turns have been made yet.
		 */
		lastTurn() {
			if (this.turns.length === 0)
				return undefined;

			return this.turns[this.turns.length - 1];
		}

		/**
		 * Get the last move made in this game. A move is the last
		 * successful placement of tiles that is not followed by a
		 * `Turns.TOOK_BACK` or `Turns.CHALLENGE_WON`.
		 * @return {Turn} the last move recorded for the game, or undefined
     * if there have been no turns or the game is over.
		 */
		lastPlay() {
			let i = this.turns.length - 1;
			let skipPrevious = false;
			while (i >= 0) {
				switch (this.turns[i].type) {
				case Turns.PLAY:
					if (!skipPrevious)
						return this.turns[i];
					skipPrevious = false;
					break;

				case Turns.CHALLENGE_LOST:
				case Turns.SWAP:
					break;

				case Turns.CHALLENGE_WON:
				case Turns.TOOK_BACK:
					skipPrevious = true;
					break;

				case Turns.GAME_OVER:
					return undefined;
				}
				i--;
			}
			return undefined;
		}

    /**
     * Iterate over turns calling cb on each.
     * @param {function} cb (turn, isLastTurn)
     */
    forEachTurn(cb) {
			this.turns.forEach(
        (turn, i) => cb(turn, i === this.turns.length - 1));
    }

		/* istanbul ignore next */
		/**
		 * Get the board square at [col][row]
		 * @return {Square} at col,row
		 */
		at(col, row) {
			// Only used client-side
			return this.board.at(col, row);
		}

    /* istanbul ignore next */
		/**
		 * @override
		 */
		toString() {
			const options = [];
			if (this.predictScore) options.push("P");
			if (this.wordCheck === WordCheck.AFTER) options.push("A");
			if (this.wordCheck === WordCheck.REJECT) options.push("R");
			if (this.allowTakeBack) options.push("T");
			const ps = this.players.map(p => p.toString()).join(", ");
			return `Game ${options.join("")} ${this.key} edition "${this.edition}" dictionary "${this.dictionary}" players [ ${ps} ] player ${this.whosTurnKey}`;
		}

		/**
		 * Promise to save the game
		 * @return {Promise} that resolves to the game when it has been saved
		 */
		save() {
      /* istanbul ignore if */
			if (!this._db)
			  throw new Error("No _db for save()");
			this._debug("Saving game", this.key);
			return this._db.set(this.key, this)
			.then(() => this);
		}

		/**
		 * Determine if any players are robots.
		 * @return the first robot found.
		 */
		hasRobot() {
			return this.players.find(p => p.isRobot);
		}

		/**
		 * Start, or continue, playing the game if preconditions are met.
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
					this.updateConnections();
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
		 * Send a message to just one player. Note that the player
		 * may be connected multiple times through different sockets.
		 * Only available server-side.
		 * @param {Player} player player to send to
		 * @param {string} message to send
		 * @param {Object} data to send with message
		 */
		notifyPlayer(player, message, data) {
			this._debug("<-S-", player.key, message, _showData(data));
			// Player may be connected several times
			this._connections.forEach(
				socket => {
					if (socket.player === player)
						socket.emit(message, data);
					return false;
				});
		}

		/**
		 * Broadcast a message to all game observers. Note
     * that an observer may be connected multiple times,
     * through different sockets.
		 * Only available server-side.
		 * @param {string} message to send
		 * @param {Object} data to send with message
		 */
		notifyAll(message, data) {
			this._debug("<-S- *", message, _showData(data));
			this._connections.forEach(socket => socket.emit(message, data));
		}

		/**
		 * Broadcase a message to all observers players except the
     * given player.
		 * Only available server-side.
		 * @param {Player} player player to exclude
		 * @param {string} message to send
		 * @param {Object} data to send with message
		 */
		notifyOthers(player, message, data) {
			this._debug("<-S- !", player.key, message, _showData(data));
			// Player may be connected several times
			this._connections.forEach(
				socket => {
					if (socket.player.key !== player.key)
						socket.emit(message, data);
					return false;
				});
		}

		/**
		 * Wrap up after a command handler that is returning a Turn.
		 * Log the command, determine whether the game has ended,
		 * save state and notify connected players with the Turn object.
		 * @param {Turn} turn the Turn to finish
		 * @return {Promise} that resolves to the game
		 */
		finishTurn(turn) {
			turn.timestamp = Date.now();

			// store turn log
			this.turns.push(turn);

			// TODO: the results of a turn should not simply be broadcast,
			// because a client could intercept and reconstruct other
			// player's racks from the results. Really there should be
			// one turn broadcast, and a different turn sent to the
			// playing player.
			return this.save()
			.then(() => this.notifyAll(Notify.TURN, turn))
			.then(() => this);
		}

		/**
		 * Check if the game has timed out due to inactivity.
		 * Stops game timers and sets the state of the game if it has.
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
		 * Does player have an active connection to this game?
		 * @param {Player} player the player
		 * @return {WebSocket} a decorated socket, or null if not connected.
		 */
		getConnection(player) {
			for (let socket of this._connections) {
				if (socket.player === player)
					return socket;
			}
			return null;
		}

		/**
		 * Notify observers with a list of the currently connected
     * observers and non-connected players. Only available
     * server-side.
		 */
		updateConnections() {
			Promise.all(
				this.players
				.map(player => player.simple(this)
					   .then(cat => {
						   cat.gameKey = this.key;
						   if (cat.key === this.whosTurnKey)
							   cat.isNextToGo = true;
               cat.toString = () => `${cat.name}/${cat.key}`;
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
		 * @param {Player?} player the the player to get the turn.
		 * @param {number?} timeout Only relevant when `timerType` is
		 * `Timer.TURN`. Turn timeout for this turn. Set if
		 * this is a restart of an unfinished turn, defaults to
		 * this.timeLimit if undefined.
		 * @return {Promise} a promise that resolves to undefined
     * @private
		 */
		startTurn(player, timeout) {
			/* istanbul ignore if */
			if (!player)
				throw Error("No player");

			if (!this.players.find(p => p.passes < 2))
				return this.confirmGameOver(State.TWO_PASSES);

			this._debug(`startTurn ${player.name}'s turn`);

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
                    "has", (timeout || this.timeLimit), "left to play",this.timerType);
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
					timeout || this.timeLimit,
					() => this.pass(player, Turns.TIMED_OUT));

			return Promise.resolve(this);
		}

		/**
		 * Create a simple structure describing a subset of the
		 * game state, for sending to the 'games' interface.
		 * @param {UserManager} um user manager object for getting emails; only
		 * works on server side
		 * @return {Promise} resolving to a {@linkcode Simple} object with
     * key game data
		 */
		simple(um) {
			return Promise.all(
				this.players.map(player => player.simple(this, um)))
			.then(ps => {
				const simple = {
					key: this.key,
					creationTimestamp: this.creationTimestamp,
					edition: this.edition,
					dictionary: this.dictionary,
					state: this.state,
					players: ps,					
					turns: this.turns.length, // just the length
					whosTurnKey: this.whosTurnKey,
					timerType: this.timerType,
					challengePenalty: this.challengePenalty,
					lastActivity: this.lastActivity() // epoch ms
					// this.board is not sent
					// this.rackSize not sent
					// this.swapSize not sent
          // this.bonuses not sent
				};
				if (this.minPlayers) simple.minPlayers = this.minPlayers;
				if (this.maxPlayers) simple.maxPlayers = this.maxPlayers;
        if (this.wordCheck) simple.wordCheck = this.wordCheck;
				if (this.timerType != Game.TIMER_NONE) {
          simple.timeLimit = this.timeLimit;
					simple.timePenalty = this.timePenalty;
        }
        if (this.challengePenalty === Penalty.PER_TURN
            || this.challengePenalty === Penalty.PER_WORD)
				  simple.penaltyPoints = this.penaltyPoints;
				if (this.nextGameKey) simple.nextGameKey = this.nextGameKey;
				if (this.pausedBy) simple.pausedBy = this.pausedBy;
				if (this.predictScore) simple.predictScore = true;
				if (this.allowTakeBack) simple.allowTakeBack = true;

        return simple;
			});
		}

		/**
		 * Player is on the given socket, as determined from an incoming
		 * 'join'. Play the game if preconditions have been met.
		 * Only available server side.
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

			const knownSocket = this.getConnection(player);
			/* istanbul ignore if */
			if (playerKey && knownSocket !== null) {
				console.error("WARNING:", playerKey, "already connected to",
							        this.key);
			} else if (player) {
				// This player is just connecting
				this._debug(`\t${player.name} connected to ${this.key}`);
			} else
        this._debug("\tconnected non-player");

			// Player is connected. Decorate the socket. It may seem
			// rather cavalier, writing over the socket this way, but
			// it does simplify the code quite a bit.
			socket.game = this;
			socket.player = player;

			this._connections.push(socket);

			// Tell players that the player is connected
			this.updateConnections();

			// Add disconnect listener
			/* istanbul ignore next */
			socket.on("disconnect", () => {
				if (socket.player)
          this._debug(socket.player.name, "disconnected");
				else
          this._debug("non-player disconnected");
				this._connections.splice(this._connections.indexOf(socket), 1);
				this.updateConnections();
			});

			return this.playIfReady();
		}

		/**
		 * Given a list of Player.simple, update the players list
		 * to reflect the members and ordering of that list.
		 * Only used client-side.
		 * @param {object[]} observers list of observers
		 */
		updatePlayerList(observers) {
			for (let player of this.players)
				player.online(false);
			const newOrder = [];
			for (let watcher of observers) {
				let player = this.getPlayerWithKey(watcher.key);
				if (!player) {
					// New player in game
					player = new Player(watcher);
					this.addPlayer(player);
					player.debug = this._debug;
				}
				player.online(watcher.isConnected || watcher.isRobot);
				newOrder.push(player);
				if (watcher.isNextToGo)
					this.whosTurnKey = player.key;
			}
			this.players = newOrder;
		}

		/**
		 * Server side, tell all clients a tick has happened (or
		 * remind them of the current number of seconds to play)
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
		 * @private
		 */
		startTheClock() {
			if (typeof this._intervalTimer !== "undefined"
          || !this.timerType || this.timerType === Timer.NONE)
        return false;
      
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

		/**
		 * Stop the interval timer, if there is one
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
		 * Handler for 'hint' request. This is NOT a turn handler.
		 * Asynchronously calculate a play for the given player, and
		 * notify all players that they requested a hint.
		 * @param {Player} player to get a hint for
		 */
		hint(player) {
      /* istanbul ignore if */
      if (!this.dictionary) {
				this.notifyPlayer(
          player, Notify.MESSAGE,
          {
 					  sender: /*i18n*/"Advisor",
					  text: /*i18n*/"No dictionary"
          });
        return;
      }

			this._debug(`Player ${player.name} asked for a hint`);

			let bestPlay = null;
			Platform.findBestPlay(
				this, player.rack.tiles(), data => {
					if (typeof data === "string")
						this._debug(data);
					else
						bestPlay = data;
				}, this.dictpath, this.dictionary)
			.then(() => {
				const hint = {
					sender: /*i18n*/"Advisor"
				};
				if (!bestPlay)
					hint.text = /*i18n*/"Can't find a play";
				else {
					const start = bestPlay.placements[0];
					hint.text = /*i18n*/"Hint";
					const words = bestPlay.words.map(w => w.word).join(",");
					hint.args = [
						words, start.row + 1, start.col + 1, bestPlay.score
					];
				}

				// Tell the requesting player the hint
				this.notifyPlayer(player, Notify.MESSAGE, hint);
				
				// Tell *everyone else* that they asked for a hint
				this.notifyOthers(player, Notify.MESSAGE, {
					sender: /*i18n*/"Advisor",
					text: /*i18n*/"$1 asked for a hint",
					classes: "warning",
					args: [ player.name ],
					timestamp: Date.now()
				});
			})
			.catch(e => {
        this._debug("Error:", e);
				/* istanbul ignore next */
				this.notifyAll(Notify.MESSAGE, {
					sender: /*i18n*/"Advisor",
					text: e.toString(),
					timestamp: Date.now()
				});
			});
		}

		/**
		 * Toggle wantsAdvice on/off (browser side only)
		 * @param {Player} player who is being toggled
		 */
		toggleAdvice(player) {
			player.toggleAdvice();
			this.notifyPlayer(
				player, Notify.MESSAGE,
				{
					sender: /*i18n*/"Advisor",
					text: (player.wantsAdvice
						     ? /*i18n*/"Enabled"
						     : /*i18n*/"Disabled")
				});
			if (player.wantsAdvice)
				this.notifyAll(Notify.MESSAGE, {
					sender: /*i18n*/"Advisor",
					text: /*i18n*/"$1 has asked for advice from the robot",
					classes: "warning",
					args: [ player.name ],
					timestamp: Date.now()
				});
		}

		/**
		 * Asynchronously advise player as to what better play they
		 * might have been able to make.
		 * @param {Player} player a Player
		 * @param {number} theirScore score they got from their play
		 */
		advise(player, theirScore) {
      /* istanbul ignore if */
      if (!this.dictionary) {
				this.notifyPlayer(
          player, Notify.MESSAGE,
          {
 					  sender: /*i18n*/"Advisor",
					  text: /*i18n*/"No dictionary"
          });
        return;
      }

			this._debug(`Computing advice for ${player.name} > ${theirScore}`,
						      player.rack.tiles().map(t => t.letter),
						      this.board.toString());

			let bestPlay = null;
			Platform.findBestPlay(
				this, player.rack.tiles(), data => {
					if (typeof data === "string")
						this._debug(data);
					else
						bestPlay = data;
				}, this.dictpath, this.dictionary)
			.then(() => {
				//this._debug("Incoming",bestPlay);
        /* istanbul ignore else */
				if (bestPlay && bestPlay.score > theirScore) {
					this._debug(`Better play found for ${player.name}`);
					const start = bestPlay.placements[0];
					const words = bestPlay.words.map(w => w.word).join(",");
					const advice = {
						sender: /*i18n*/"Advisor",
						text: /*i18n*/"$1 at row $2 column $3 would have scored $4",
						args: [	words, start.row + 1, start.col + 1,
								    bestPlay.score ]
					};
					this.notifyPlayer(player, Notify.MESSAGE, advice);
					this.notifyOthers(player, Notify.MESSAGE, {
						sender: /*i18n*/"Advisor",
						text: /*i18n*/"$1 has received advice from the robot",
						classes: "warning",
						args: [ player.name ],
						timestamp: Date.now()
					});
				} else
					this._debug(`No better plays found for ${player.name}`);
			})
			.catch(e => {
				/* istanbul ignore next */
				console.error("Error", e);
			});
		}

		/**
		 * Handler for `Command.PLAY`
		 * @param {Player} player player requesting the move
		 * @param {Move} move a Move (or the spec of a Move)
		 * @return {Promise} resolving to a the game
		 */
		async play(player, move) {
      if (!(move instanceof Move))
        move = new Move(move);
			/* istanbul ignore if */
			if (player.key !== this.whosTurnKey)
				return Promise.reject("Not your turn");

			this._debug("Playing", move.toString());
			//this._debug(`Player's rack is ${player.rack}`);

			if (this.dictionary
				  && !this.isRobot
				  && this.wordCheck === WordCheck.REJECT) {

				this._debug("Validating play");

				// Check the play in the dictionary, and generate a
				// 'reject' if it's bad. This has to be done
				// synchronously before we start modifying the board
				// state.
				let badWords = [];
				await this.getDictionary()
				.then(dict => {
					for (let w of move.words) {
						if (!dict.hasWord(w.word))
							badWords.push(w.word);
					}
				});
				if (badWords.length > 0) {
					this._debug("\trejecting", badWords);
					// Reject the play. Nothing has been done to the
					// game state yet, so we can just ping the
					// player back and let the UI sort it out.
					this.notifyPlayer(
						player, Notify.REJECT,
						{
							playerKey: player.key,
							words: badWords
						});
					return Promise.resolve();
				}
			}

			if (player.wantsAdvice) {
				// 'Post-move' alternatives analysis.
				// Do this before we place the tiles
				// on the board, so that the game and tiles get frozen
				// and passed to the findBestPlayWorker.
				this.advise(player, move.score);
			}

			const game = this;

			// Move tiles from the rack to the board
			move.placements.forEach(placement => {
				const square = game.board.at(placement.col, placement.row);
				const tile = player.rack.removeTile(placement);
				square.placeTile(tile, true);
			});

			player.score += move.score;

			this._debug("New rack", player.rack.toString());

			//console.debug("words ", move.words);

			if (this.dictionary
				  && this.wordCheck === WordCheck.AFTER
				  && !player.isRobot) {
				// Asynchronously check word and notify player if it
				// isn't found.
				this.getDictionary()
				.then(dict => {
					for (let w of move.words) {
						this._debug("Checking ",w);
						if (!dict.hasWord(w.word)) {
							// Only want to notify the player
							this.notifyPlayer(
								player, Notify.MESSAGE,
								{
									sender: /*i18n*/"Advisor",
									text: /*i18n*/"$1 not found in $2",
									args: [ w.word, dict.name ]
								});
						}
					}
				});
			}

			player.passes = 0;

			// Get new tiles to replace those placed
      const replacements = [];
			for (let i = 0; i < move.placements.length; i++) {
				const tile = this.letterBag.getRandomTile();
				if (tile) {
					player.rack.addTile(tile);
					replacements.push(tile);
				}
			}

			// Report the result of the turn
			const nextPlayer = this.nextPlayer();
			this.whosTurnKey = nextPlayer.key;
			return this.finishTurn(new Turn(this, {
				type: Turns.PLAY,
				playerKey: player.key,
				nextToGoKey: nextPlayer.key,
				score: move.score,
				placements: move.placements,
				replacements: replacements,
				words: move.words
			}))
			.then(() => this.startTurn(nextPlayer));
		}
		
		/**
		 * Robot play for the current player. This may result in a challenge.
		 * @return {Promise} resolving to this
		 */
		autoplay() {
			const player = this.getPlayer();
			this._debug("Autoplaying", player.name,
                  "using", player.dictionary || this.dictionary);

			// Before making a robot move, consider challenging the last
			// player.
			// challenge is a Promise that will resolve to true if a
			// challenge is made, or false otherwise.
			let challenge = Promise.resolve(false);
			if (this.lastPlay()
				  && this.dictionary
				  && player.canChallenge) {
				const lastPlayer = this.getPlayer(this.lastPlay().playerKey);
				// There's no point if they are also a robot, though
				// that should never arise in a "real" game where there can
				// only be one robot.
				if (!lastPlayer.isRobot) {
					// use game dictionary, not robot dictionary
					challenge = this.getDictionary()
					.then(dict => {
						const bad = this.lastPlay().words
							    .filter(word => !dict.hasWord(word.word));
						if (bad.length > 0) {
							// Challenge succeeded
							this._debug(`Challenging ${lastPlayer.name}`);
							this._debug(`Bad Words: `, bad);
							return this.takeBack(player, Turns.CHALLENGE_WON)
							.then(() => true);
						}
						return false; // no challenge made
					});
				}
			}

			return challenge
			.then(challenged => {
				// if (challenged) then the challenge succeeded, so at
				// least one other player can play again.
				// Challenge cannot fail - robot never challenges unless
				// it is sure it will win.
				if (!challenged && this.lastPlay()) {
					// Last play was good, check the last player has tiles
					// otherwise the game is over
					const lastPlayer = this.getPlayer(
						this.lastPlay().playerKey);
					if (lastPlayer.rack.isEmpty())
						return this.confirmGameOver(State.GAME_OVER);
				}

				let bestPlay = null;
				return Platform.findBestPlay(
					this, player.rack.tiles(),
					data => {
						if (typeof data === "string")
							this._debug(data);
						else {
							bestPlay = data;
							this._debug("Best", bestPlay.toString());
						}
					}, this.dictpath, player.dictionary || this.dictionary)
				.then(() => {
					if (bestPlay)
						return this.play(player, bestPlay);

					this._debug(`${player.name} can't play, passing`);
					return this.pass(player);
				});
			});
		}

		/**
		 * Pause the game
		 * @param {Player} player to play
		 * @return {Promise} resolving to the game
		 */
		pause(player) {
			if (this.pausedBy)
				return Promise.resolve(this); // already paused
			this.stopTheClock();
			this.pausedBy = player.name;
			this._debug(`${this.pausedBy} has paused game`);
			this.notifyAll(Notify.PAUSE, {
				key: this.key,
				name: player.name,
				timestamp: Date.now()
			});
			return this.save();
		}

		/**
		 * Unpause the game
		 * @param {Player} player to play
		 * @return {Promise} resolving to the game
		 */
		unpause(player) {
			/* istanbul ignore if */
			if (!this.pausedBy)
				return Promise.resolve(this); // not paused
			this._debug(`${player.name} has unpaused game`);
			this.notifyAll(Notify.UNPAUSE, {
				key: this.key,
				name: player.name,
				timestamp: Date.now()
			});
			this.pausedBy = undefined;
			this.startTheClock();
			return this.save();
		}

		/**
		 * Called when the game has been confirmed as over - the player
		 * following the player who just emptied their rack has confirmed
		 * they don't want to challenge, or they have challenged and the
		 * challenge failed.
		 * @param {string} endState gives reason why game ended
		 * (i18n message id) one of `State.GAME_OVER`, `State.TWO_PASSES`, or
		 * `State.CHALLENGE_LOST`
		 * @return {Promise} resolving to undefined
		 */
		confirmGameOver(endState) {
			this.state = endState || State.GAME_OVER;

			this._debug(`Confirming game over because ${endState}`);
			this.stopTheClock();

			// When the game ends, each player's score is reduced by
			// the sum of their unplayed letters. If a player has used
			// all of his or her letters, the sum of the other players'
			// unplayed letters is added to that player's score.
			let playerWithNoTiles;
			let pointsRemainingOnRacks = 0;
			const deltas = {};
			this.players.forEach(player => {
				deltas[player.key] = { tiles: 0 };
				if (player.rack.isEmpty()) {
					/* istanbul ignore if */
					if (playerWithNoTiles)
						throw Error("Found more than one player with no tiles when finishing game");
					playerWithNoTiles = player;
				}
				else {
					const rackScore = player.rack.score();
					player.score -= rackScore;
					deltas[player.key].tiles -= rackScore;
					pointsRemainingOnRacks += rackScore;
					this._debug(`${player.name} has ${rackScore} left`);
				} 
				if (this.timerType === Timer.GAME && player.clock < 0) {
					const points = Math.round(
						player.clock * this.timePenalty / 60);
					this._debug(player.name, "over by", -player.clock,
                      "s, score", points, "points");
					if (points < 0)
						deltas[player.key].time = points;
				}
			});

			if (playerWithNoTiles) {
				playerWithNoTiles.score += pointsRemainingOnRacks;
				deltas[playerWithNoTiles.key].tiles = pointsRemainingOnRacks;
				this._debug(`${playerWithNoTiles.name} gains ${pointsRemainingOnRacks}`);
			}
			const turn = new Turn(this, {
				type: Turns.GAME_OVER,
				endState: endState,
				playerKey: this.whosTurnKey,
				score: deltas
			});
			return this.finishTurn(turn);
		}

		/**
		 * Undo the last move. This might be as a result of a player request,
		 * or the result of a challenge.
		 * @param {Player} player if type==Turns.CHALLENGE_WON this must be
		 * the challenging player. Otherwise it is the player taking their
		 * play back.
		 * @param {string} type the type of the takeBack; Turns.TOOK_BACK
		 * or Turns.CHALLENGE_WON.
		 * @return {Promise} Promise resolving to the game
		 */
		takeBack(player, type) {
			// The UI ensures that 'takeBack' can only be issued by the
			// previous player.
			const previousMove = this.lastPlay();
			const prevPlayer = this.getPlayer(previousMove.playerKey);
			
			// Move tiles that were added to the rack as a consequence
			// of the previous move, back to the letter bag
			if (previousMove.replacements) {
				for (let newTile of previousMove.replacements) {
					const tile = prevPlayer.rack.removeTile(newTile);
					this.letterBag.returnTile(tile);
				}
			}

			// Move placed tiles from the board back to the prevPlayer's rack
			if (previousMove.placements) {
				for (let placement of previousMove.placements) {
					const boardSquare =
						    this.board.at(placement.col, placement.row);
					prevPlayer.rack.addTile(boardSquare.tile);
					boardSquare.unplaceTile();
				}
			}

			prevPlayer.score -= previousMove.score;

			const turn = new Turn(this, {
				type: type,
				nextToGoKey:
				type === Turns.CHALLENGE_WON ? this.whosTurnKey
				: previousMove.playerKey,
				score: -previousMove.score,
				placements: previousMove.placements,
				replacements: previousMove.replacements,
			});

			if (type === Turns.TOOK_BACK) {
				// A takeBack, not a challenge.
				turn.playerKey = previousMove.playerKey;

			} else {
				// else a successful challenge, does not move the player on.
				turn.challengerKey = player.key;
				turn.playerKey = previousMove.playerKey;
			}

			return this.finishTurn(turn)
			.then(() => {
				if (type === Turns.TOOK_BACK) {
					// Let the taking-back player go again,
					// but with just the remaining time from their move.
					return this.startTurn(player, previousMove.remainingTime);
				}
				// Otherwise this is a CHALLENGE_WON, and the
				// current player continues where they left off, but
				// with their timer reset
				return Promise.resolve(this);
			});
		}

		/**
		 * Handler for 'pass' command.
		 * Player wants to (or has to) miss their move. Either they
		 * can't play, or challenged and failed.
		 * @param {Player} player player passing (must be current player)
		 * @param {string} type pass type, `Turns.PASSED` or
		 * `Turns.TIMED_OUT`. If undefined, defaults to `Turns.PASSED`
		 * @return {Promise} resolving to the game
		 */
		pass(player, type) {
			/* istanbul ignore if */
			if (player.key !== this.whosTurnKey)
				return Promise.reject("Not your turn");

			player.passes++;

			const nextPlayer = this.nextPlayer();

			return this.finishTurn(new Turn(
				this, {
					type: type || Turns.PASSED,
			    playerKey: player.key,
			    nextToGoKey: nextPlayer.key
				}))
			.then(() => this.startTurn(nextPlayer));
		}

		/**
		 * Handler for 'challenge' command.
		 * Check the words created by the previous move are in the dictionary
		 * @param {Player} challenger player making the challenge
		 * @return {Promise} resolving to the game
		 */
		challenge(challenger) {
			const previousMove = this.lastPlay();
			if (!previousMove)
				return Promise.reject("No previous move to challenge");

			if (challenger.key === previousMove.playerKey)
				return Promise.reject("Cannot challenge your own play");

			return this.getDictionary()
			.catch(
				/* istanbul ignore next */
        () => {
				  this._debug("No dictionary, so challenge always succeeds");
				  return this.takeBack(challenger, Turns.CHALLENGE_WON);
			  })
			.then(dict => {
				const bad = previousMove.words
					    .filter(word => !dict.hasWord(word.word));

				if (bad.length > 0) {
					// Challenge succeeded
					this._debug("Bad Words: ", bad);

					// Take back the challenged play. Irrespective of
					// whether the challenger is the current player or
					// not, takeBack should leave the next player
					// after the challenged player with the turn.
					return this.takeBack(challenger, Turns.CHALLENGE_WON);
				}

				// Challenge failed

				const prevPlayerKey = previousMove.playerKey;
				const currPlayerKey = this.getPlayer().key;
				const nextPlayer = this.nextPlayer();

				if (challenger.key === currPlayerKey &&
					  this.challengePenalty === Penalty.MISS) {

					// Current player issued the challenge, they lose the
					// rest of this turn

					// Special case; if the challenged play would be the
					// last play (challenged player has no more tiles) and
					// challenging player is the next player, then it is game
					// over. It is the last play if there were no
					// replacements.
					if ((!previousMove.replacements
						   || previousMove.replacements.length === 0))
						return this.confirmGameOver(State.FAILED_CHALLENGE);
					// Otherwise issue turn type=Turns.CHALLENGE_LOST

					const turn = new Turn(
						this, {
							type: Turns.CHALLENGE_LOST,
							penalty: Penalty.MISS,
							playerKey: prevPlayerKey,
							challengerKey: challenger.key,
							nextToGoKey: nextPlayer.key
						});

					// Penalty for a failed challenge is miss a turn,
					// and the challenger is the current player, so their
					// turn is at an end.
					return this.finishTurn(turn)
					.then(() => this.startTurn(nextPlayer));
				}

				// Otherwise it's either a points penalty, or the challenger
				// was not the next player
				let lostPoints = 0;
				switch (this.challengePenalty) {
				case Penalty.MISS:
					// tag them as missing their next turn
					challenger.missNextTurn = true;
					break;
				case Penalty.PER_TURN:
					lostPoints = -this.penaltyPoints;
					break;
				case Penalty.PER_WORD:
					lostPoints = -this.penaltyPoints
					* previousMove.words.length;
					break;
				default: // Penalty.NONE
				}

				challenger.score += lostPoints;
				return this.finishTurn(new Turn(
					this, {
						type: Turns.CHALLENGE_LOST,
						score: lostPoints,
						playerKey: prevPlayerKey,
						challengerKey: challenger.key,
						nextToGoKey: currPlayerKey
					}));
				// no startTurn, because the challenge is asynchronous and
				// shouldn't move the player on
			});
		}

		/**
		 * Handler for swap command.
		 * Scrabble Rule 7: You may use a turn to exchange all,
		 * some, or none of the letters. To do this, place your
		 * discarded letter(s) facedown. Draw the same number of
		 * letters from the pool, then mix your discarded
		 * letter(s) into the pool.
		 * @param {Player} player player making the swap (must be current
		 * player)
		 * @param {Tile[]} tiles list of Tile to swap
		 * @return {Promise} resolving to the game
		 */
		swap(player, tiles) {
			/* istanbul ignore if */
			if (player.key !== this.whosTurnKey)
				return Promise.reject("Not your turn");

			/* istanbul ignore if */
			if (this.letterBag.remainingTileCount() < tiles.length)
				// Terminal, no point in translating
				throw Error(`Cannot swap, bag only has ${this.letterBag.remainingTileCount()} tiles`);

			// A swap counts as a pass. If the other player is also swapping
			// or passing, that means two swaps at most.
			player.passes++;

      // Get the right number of new tiles from the rack
      const replacements = [];
			for (let i = 0; i < tiles.length; i++) {
        const rep = this.letterBag.getRandomTile();
				replacements.push(rep);
      }

			// Return discarded tiles to the letter bag to make space
      // on the player's rack
			for (const tile of tiles) {
				const removed = player.rack.removeTile(tile);
				/* istanbul ignore if */
				if (!removed)
					// Terminal, no point in translating
					throw Error(`Cannot swap, player rack does not contain letter ${tile.letter}`);
				this.letterBag.returnTile(removed);
			}

			// Place new tiles on the rack, now that there's space
      for (const rep of replacements)
			  player.rack.addTile(rep);
      
			const nextPlayer = this.nextPlayer();
      const turn = new Turn(
				this,
				{
					type: Turns.SWAP,
					playerKey: player.key,
					nextToGoKey: nextPlayer.key,
          placements: tiles,
					replacements: replacements
				});

			return this.finishTurn(turn)
			.then(() => this.startTurn(nextPlayer));
		}

		/**
		 * Create another game the same, but with players re-ordered.
		 * @return {Promise} resolving to the new game
		 */
		anotherGame() {
			if (this.nextGameKey)
				return Promise.reject("Next game already exists");

			this._debug(`Create game to follow ${this.key}`);
			const newGame = new Game(this);

			return newGame.create()
			.then(() => newGame.onLoad(this._db))
			.then(() => this.nextGameKey = newGame.key)
			.then(() => this.save())
			.then(() => {
        newGame.creationTimestamp = Date.now();

        // No turns inherited
        newGame.turns = [];

				// constructor will have copied the players from the existing
        // game, but we need to addPlayer to populate the racks.
        newGame.players = [];
				this.players.forEach(p => newGame.addPlayer(new Player(p)));

				// Players will be shuffled in playIfReady
				newGame.whosTurnKey = undefined;
				// for unit tests
				newGame._noPlayerShuffle = this._noPlayerShuffle;
        newGame.state = State.WAITING;

				this._debug(`Created follow-on game ${newGame.key}`);
      })
      .then(() => newGame.save())
			.then(() => newGame.playIfReady())
			.then(() => this.notifyAll(Notify.NEXT_GAME, {
				gameKey: newGame.key,
				timestamp: Date.now()
			}))
			.then(() => newGame);
		}

		/**
		 * Create the UI for the player table
		 * @param {Player} thisPlayer the player for whom the DOM is
		 * being generated
		 * @return {jQuery} jQuery object representing the player table
		 */
		$ui(thisPlayer) {
			const $tab = $("<table></table>").addClass("player-table");
			this.players.forEach(
				p => $tab.append(p.$ui(thisPlayer)));
			return $tab;
		}
	}

	return Game;
});
