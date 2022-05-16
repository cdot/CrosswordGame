/*Copyright (C) 2019-2022 The Xanado Project https://github.com/cdot/Xanado
License MIT. See README.md at the root of this distribution for full copyright
and license information*/
/* eslint-env amd */

define("game/Game", [
	"common/Utils",
	"platform",
	"dawg/Dictionary",
	"game/Board", "game/LetterBag", "game/Edition",
	"game/Player", "game/Square", "game/Tile", "game/Rack", "game/Move",
	"game/Turn", "game/Notify"
], (
	Utils,
	Platform,
	Dictionary,
	Board, LetterBag, Edition,
	Player, Square, Tile, Rack, Move,
	Turn, Notify
) => {

	/**
	 * The Game object may be used server or browser side.
	 */
	class Game {

		/**
		 * A new game is constructed from scratch by
		 * ```
		 * new Game(...).create().then(game => { game.onLoad(db)...
		 * ```
		 * A game identified by key is loaded from a db by
		 * ```
		 * db.get(key, Game.classes).then(game => { game.onLoad(db)...
		 * ```
		 * (may be null)
		 * @param {object} params Parameter object. This can be another
		 * Game to copy game parameters, the result from Game.simple(),
		 * or a generic object with fields the same name as Game fields.
		 */
		constructor(params) {
			/**
			 * Strictly internal, for debug
			 * @member {function}
			 * @private
			 */
			/* istanbul ignore if */
			if (typeof params.debug === "function")
				this._debug = params.debug;
			else
				this._debug = () => {};

			/**
			 * Strictly internal, for debug
			 * @member {boolean}
			 * @private
			 */
			this._noPlayerShuffle = params.noPlayerShuffle || false;

			this._debug("Constructing new game", params);

			/**
			 * Key that uniquely identifies this game - generated
			 * @member {string}
			 */
			this.key = Utils.genKey();

			/**
			 * Epoch ms when this game was created
			 * @member {number}
			 * @private
			 */
			this.creationTimestamp = Date.now();

			/**
			 * The name of the edition.
			 * We don't keep a pointer to the Edition object so we can
			 * cheaply serialise and send to the games interface. 
			 * @member {string}
			 */
			this.edition = params.edition;
			/* istanbul ignore if */
			if (!this.edition)
				throw new Error("Game must have an edition");

			/**
			 * We don't keep a pointer to the dictionary objects so we can
			 * cheaply serialise and send to the games interface. We just
			 * keep the name of the relevant object.
			 * @member {string?}
			 */
			this.dictionary =
			(params.dictionary && params.dictionary != "none") ?
			params.dictionary : null;

			/**
			 * An i18n message identifier indicating the game state, one of
			 * * `Game.STATE_WAITING` - until `playIfReady` starts the game
			 * * `Game.STATE_PLAYING` - until the game is over, then
			 * * `Game.STATE_GAME_OVER` - game was played to end, or
			 * * `Game.STATE_2_PASSES` - all players passed twice, or
			 * * `Game.STATE_CHALLENGE_FAILED` - a challenge on the final
			 * play failed
			 * @member {string}
			 */
			this.state = Game.STATE_WAITING;

			/**
			 * List of Player
			 * @member {Player[]}
			 * @private
			 */
			this.players = [];

			/**
			 * Complete list of the turn history of this game
			 * List of Turn objects.
			 * @member {Turn[]}
			 */
			this.turns = [];

			/**
			 * Key of next player to play in this game. This is undefined
			 * until playIfReady sets it.
			 * @member {string}
			 */
			this.whosTurnKey = undefined;

			/**
			 * Timer type, one of:
			 * * `Player.TIMER_NONE` - untimed game
			 * * `Player.TIMER_GAME` - game timer
			 * * `Player.TIMER_TURN` - turn timer
			 */
			this.timerType = params.timerType || Player.TIMER_NONE;

			/**
			 * Time limit for this game.
			 * @member {number}
			 */
			if (this.timerType !== Player.TIMER_NONE) {
				this.timeLimit = params.timeLimit ||
				(params.timeLimitMinutes || 0) * 60;
			}

			/**
			 * Time penalty for this game. Points lost per minute over
			 * timeLimit.
			 * @member {number}
			 */
			if (this.timerType === Player.TIMER_GAME)
				this.timePenalty = params.timePenalty || 0;

			/**
			 * Pointer to Board object
			 * @member {Board}
			 */
			this.board = null;

			/**
			 * Size of rack. Always the same as Edition.rackCount,
			 * because we don't hold a pointer to the Edition. Note this
			 * is saved with the game.
			 * @member {number}
			 * @private
			 */
			this.rackSize = 0;

			/**
			 * LetterBag object
			 * @member {LetterBag}
			 */
			this.letterBag = undefined;

			/**
			 * Who paused the game (if it's paused)
			 * @member {string?}
			 */
			if (params.pausedBy)
				this.pausedBy = params.pausedBy;

			/**
			 * Least number of players must have joined before this game
			 * can start. Must be at least 2.
			 * @member {number}
			 */
			this.minPlayers = Math.max(params.minPlayers || 0, 2);

			/**
			 * Most number of players who can join this game. 0 means no limit.
			 * @member {number}
			 */
			this.maxPlayers = Math.max(params.maxPlayers || 0, 0);
			if (this.maxPlayers < this.minPlayers)
				this.maxPlayers = 0;

			/**
			 * When a game is ended, nextGameKey is the key for the
			 * continuation game
			 * @member {string}
			 */
			this.nextGameKey = undefined;

			/**
			 * Whether or not to show the predicted score from tiles
			 * placed during the game. This should be false in tournament
			 * play, true otherwise.
			 * @member {boolean}
			 */
			this.predictScore = params.predictScore;

			/**
			 * Whether or not to allow players to take back their most recent
			 * move without penalty, so long as the next player hasn't
			 * challenged or played.
			 * @member {boolean}
			 */
			this.allowTakeBack = params.allowTakeBack ||  false;

			/**
			 * Whether or not to check plays against the dictionary. One
			 * of:
			 * * `Game.WORD_CHECK_NONE` for no checks
			 * * `Game.WORD_CHECK_AFTER` for checks after play
			 * * `Game.WORD_CHECK_REJECT` to reject bad plays
			 * A bad play in this case does not result in a penalty, it
			 * just forces the player to take the move back.
			 */
			this.wordCheck = params.wordCheck || Game.WORD_CHECK_NONE;

			/**
			 * The type of penalty to apply for a failed challenge,
			 * one of:
			 * * `Game.PENALTY_NONE` - no penalty
			 * * `Game.PENALTY_MISS` - miss next turn
			 * * `Game.PENALTY_PER_TURN` - simple points penalty
			 * * `Game.PENALTY_PER_WORD` - points penalty per correct word
			 * @member {string}
			 */
			this.penaltyType = params.penaltyType || Game.PENALTY_TYPE;

			/**
			 * The type of penalty to apply for a failed challenge
			 * @member {number}
			 */
			this.penaltyPoints = params.penaltyPoints || Game.PENALTY_POINTS;

			/**
			 * List of decorated sockets. Only available server-side.
			 * @member {WebSocket[]}
			 * @private
			 */
			this._connections = [];

			/**
			 * Database containing this game. Only available server-side.
			 * @member {Platform.Database}
			 * @private
			 */
			this._db = undefined;
		}

		/**
		 * Promise to finish construction of a new Game.
		 * Load the edition and create the board and letter bag.
		 * Not done in the constructor because we need to return
		 * a Promise.
		 * @return {Promise} that resolves to this
		 */
		create() {
			// Can't be done in the constructor because we want to
			// return a Promise. Extending Promise so that the constructor
			// return a Promise would be semantically confusing.
			return this.getEdition(this.edition)
			.then(edo => {
				this.board = new Board(edo);
				this.letterBag = new LetterBag(edo);
				this.rackSize = edo.rackCount;
				return this;
			});
		}

		/**
		 * A game loaded by deserialisation has to know what DB it was
		 * loaded from so it knows where to save the game. The
		 * database and connections are not serialised, and must be
		 * reset. Only available server-side.
		 * @param {Platform.Database} db the db to use
		 * @return {Promise} Promise that resolves to the game
		 */
		onLoad(db) {
			this._debug = () => {};
			this._connections = [];
			this._db = db;
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
			/* istanbul ignore if */
			if (this.maxPlayers > 1 && this.players.length === this.maxPlayers)
				throw Error("Cannot addPlayer() to a full game");			
			this.players.push(player);
			player.fillRack(this.letterBag, this.rackSize);
			this._debug("Added", player);
			player.debug = this._debug;
			if (this.timerType !== Player.TIMER_NONE)
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
			this._debug(`${player.key} left ${this.key}`);
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
			if (!player)
				return undefined;
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
		 * @param sboard string representation of a game {@link Board}
		 * @return {Promise} resolving to `this`
		 */
		loadBoard(sboard) {
			return this.getEdition(this.edition)
			.then(ed => this.board.parse(sboard, ed))
			.then(() => this);
		}

		/**
		 * Get the edition for this game, lazy-loading as necessary
		 * @return {Promise} resolving to an {@link Edition}
		 */
		getEdition() {
			return Edition.load(this.edition);
		}

		/**
		 * Get the dictionary for this game, lazy-loading as necessary
		 * @return {Promise} resolving to a {@link Dictionary}
		 */
		getDictionary() {
			if (this.dictionary)
				return Dictionary.load(this.dictionary);

			// Terminal, no point in translating
			/* istanbul ignore next */
			return Promise.reject("Game has no dictionary");
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
			return !(this.state === Game.STATE_WAITING
					 || this.state === Game.STATE_PLAYING);
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
		 * `Turn.TOOK_BACK` or `Turn.CHALLENGE_WON`.
		 * @return {Turn} the last move recorded for the game.
		 */
		lastPlay() {
			let i = this.turns.length - 1;
			let skipPrevious = false;
			while (i >= 0) {
				switch (this.turns[i].type) {
				case Turn.PLAY:
					if (!skipPrevious)
						return this.turns[i];
					skipPrevious = false;
					break;

				case Turn.CHALLENGE_LOST:
				case Turn.SWAP:
					break;

				case Turn.CHALLENGE_WON:
				case Turn.TOOK_BACK:
					skipPrevious = true;
					break;

				case Turn.GAME_OVER:
					return undefined;
				}
				i--;
			}
			return undefined;
		}

		/**
		 * Get the board square at [col][row]
		 * @return {Square} at col,row
		 */
		at(col, row) {
			throw new Error("Never called");
			return this.board.at(col, row);
		}

		/**
		 * Simple summary of the game, for console output
		 * @return {string} debug description
		 */
		/* istanbul ignore next */
		toString() {
			const options = [];
			if (this.predictScore) options.push("P");
			if (this.wordCheck === Game.WORD_CHECK_AFTER) options.push("A");
			if (this.wordCheck === Game.WORD_CHECK_REJECT) options.push("R");
			if (this.allowTakeBack) options.push("T");
			const ps = this.players.map(p => p.toString()).join(", ");
			return `Game ${options.join("")} ${this.key} edition "${this.edition}" dictionary "${this.dictionary}" players [ ${ps} ] player ${this.whosTurnKey}`;
		}

		/**
		 * Promise to save the game
		 * @return {Promise} that resolves to the game when it has been saved
		 */
		save() {
			if (!this._db) return Promise.resolve(this);
			this._debug(`Saving game ${this.key}`);
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
			this._debug(`playIfReady game=${this.key} state=${this.state}`);

			// Check preconditions for starting the game
			if (this.players.length < this.minPlayers) {
				this._debug("\tnot enough players");
				// Result is not used
				return Promise.resolve(this);
			}

			// If no turn has been allocated yet, 
			// shuffle the players, and pick a random tile from the bag.
			// The shuffle can be suppressed for unit testing.
			if (this.state === Game.STATE_WAITING) {
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

				this.state = Game.STATE_PLAYING;

				return this.save()
				// startTurn will autoplay if the first player is
				// a robot. It will also start the clock.
				.then(() => this.startTurn(player));
			}

			const nextPlayer = this.getPlayer();
			if (nextPlayer.isRobot)
				return this.startTurn(nextPlayer);

			this._debug(`\twaiting for ${this.getPlayer().name} to play`);

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
			this._debug(`<-S- ${player.key} ${message}`, data);
			// Player may be connected several times
			this._connections.forEach(
				socket => {
					if (socket.player === player)
						socket.emit(message, data);
					return false;
				});
		}

		/**
		 * Broadcast a message to all players. Note that a player
		 * may be connected multiple times, through different sockets.
		 * Only available server-side.
		 * @param {string} message to send
		 * @param {Object} data to send with message
		 */
		notifyPlayers(message, data) {
			this._debug(`<-S- * ${message}`, data);
			this._connections.forEach(socket => socket.emit(message, data));
		}

		/**
		 * Broadcase a message to all players except the given player.
		 * Only available server-side.
		 * @param {Player} player player to exclude
		 * @param {string} message to send
		 * @param {Object} data to send with message
		 */
		notifyOtherPlayers(player, message, data) {
			this._debug(`<-S- !${player.key} ${message}`, data);
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
			.then(() => this.notifyPlayers(Notify.TURN, turn))
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

			this._debug("Game timed out:",
						this.players.map(({ name }) => name));

			this.state = Game.STATE_TIMED_OUT;
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
		 * Notify players with a list of the currently connected players,
		 * as identified by their key. Only available server-side.
		 */
		updateConnections() {
			Promise.all(
				this.players
				.map(player => player.simple(this)
					 .then(cat => {
						 cat.gameKey = this.key;
						 if (cat.key === this.whosTurnKey)
							 cat.nextToGo = true;
						 return cat;
					 })))
			.then(res => this.notifyPlayers(Notify.CONNECTIONS, res));
		}

		/**
		 * Start (or restart) the turn of the given player.
		 * @param {Player?} player the the player to get the turn.
		 * @param {number?} timeout Only relevant when `timerType` is
		 * `Player.TIMER_TURN`. Turn timeout for this turn. Set if
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
				return this.confirmGameOver(Game.STATE_2_PASSES);

			this._debug(`startTurn ${player.name}'s turn`);

			this.whosTurnKey = player.key;

			if (player.isRobot) {
				// May recurse if the player after is also a robot, but
				// the recursion will always stop when a human player
				// is reached, so never deep.
				return this.autoplay();
			}

			if (this.timeLimit <= 0) {
				this._debug(
						`\tuntimed game, wait for ${player.name} to play`);
				return Promise.resolve(this);
			}

			// For a timed game, make sure the clock is running and
			// start the player's timer.
			this._debug(`\ttimed game, ${player.name} has ${timeout || this.timeLimit}s left to play`);
			this.startTheClock(); // does nothing if already started

			if (this.timerType === Player.TIMER_TURN)
				// Make the player pass when their clock reaches 0
				player.setTimeout(
					timeout || this.timeLimit,
					() => this.pass(player, Turn.TIMED_OUT));

			return Promise.resolve(this);
		}

		/**
		 * Create a simple structure describing a subset of the
		 * game state, for sending to the 'games' interface
		 * @param {UserManager} um user manager object for getting emails; only
		 * works on server side
		 * @return {Promise} resolving to a simple object with key game data
		 */
		simple(um) {
			return Promise.all(
				this.players.map(player => player.simple(this, um)))
			.then(ps => {
				return {
					key: this.key,
					creationTimestamp: this.creationTimestamp,
					edition: this.edition,
					dictionary: this.dictionary,
					predictScore: this.predictScore,
					wordCheck: this.wordCheck,
					allowTakeBack: this.allowTakeBack,
					state: this.state,
					players: ps,					
					turns: this.turns.length, // just the length
					whosTurnKey: this.whosTurnKey,
					timerType: this.timerType,
					timeLimit: this.timeLimit,
					timePenalty: this.timePenalty,
					// this.board is not sent
					// this.rackSize not sent
					pausedBy: this.pausedBy,
					minPlayers: this.minPlayers,
					maxPlayers: this.maxPlayers,
					penaltyType: this.penaltyType,
					penaltyPoints: this.penaltyPoints,
					nextGameKey: this.nextGameKey,
					lastActivity: this.lastActivity() // epoch ms
				};
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
			if (!player) {
				console.error(`WARNING: player key ${playerKey} not found in game ${this.key}`);
			}

			const knownSocket = this.getConnection(player);
			/* istanbul ignore if */
			if (knownSocket !== null) {
				console.error("WARNING:", player.key, "already connected to",
							this.key);
			} else if (player) {
				// This player is just connecting, perhaps for the first time.
				this._debug(`${player.name} connected to ${this.key}`);
			}

			// Player is connected. Decorate the socket. It may seem
			// rather cavalier, writing over the socket this way, but
			// it does simplify the code quite a bit.
			socket.game = this;
			socket.player = player;

			this._connections.push(socket);
			this._debug(player ? `${player} connected` : "'Anonymous' connected");

			// Tell players that the player is connected
			this.updateConnections();

			// Add disconnect listener
			/* istanbul ignore next */
			socket.on("disconnect", () => {
				this._debug(socket.player
							? `${socket.player.toString()} disconnected`
							: "'Anonymous' disconnected");
				this._connections = this._connections.filter(
					sock => sock !== socket);
				this.updateConnections();
			});

			return this.playIfReady();
		}

		/**
		 * Given a list of Player.simple, update the players list
		 * to reflect the members and ordering of that list.
		 * Only used client-side.
		 * @param {object[]} simpleList list of Player.simple
		 */
		/* istanbul ignore next */
		updatePlayerList(simpleList) {
			for (let player of this.players)
				player.online(false);
			const newOrder = [];
			for (let simple of simpleList) {
				if (!simple) continue;
				let player = this.getPlayerWithKey(simple.key);
				if (!player) {
					// New player in game
					player = new Player(simple);
					this.addPlayer(player);
					player.debug = this._debug;
				}
				player.online(simple.isConnected);
				newOrder.push(player);
				if (simple.nextToGo)
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
			this.notifyPlayers(
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
		 * @private
		 */
		startTheClock() {
			if (!this._intervalTimer && this.timerType !== Player.TIMER_NONE) {
				this._debug(`Started the clock`);
				// Broadcast a ping every second
				this._intervalTimer = setInterval(() => this.tick(), 1000);
			}
		}

		/**
		 * Stop the interval timer, if there is one
		 * @private
		 */
		stopTheClock() {
			if (this._intervalTimer) {
				this._debug("Stopped the clock");
				clearInterval(this._intervalTimer);
				this._intervalTimer = null;
			}
		}

		/**
		 * Handler for 'hint' request. This is NOT a turn handler.
		 * Asynchronously calculate a play for the given player, and
		 * notify all players that they requested a hint.
		 * @param {Player} player to get a hint for
		 */
		hint(player) {
			this._debug(`Player ${player.name} asked for a hint`);

			let bestPlay = null;
			Platform.findBestPlay(
				this, player.rack.tiles(), data => {
					if (typeof data === "string")
						this._debug(data);
					else
						bestPlay = data;
				})
			.then(() => {
				const hint = {
					sender: /*i18n*/"Advisor"
				};
				if (!bestPlay)
					hint.text = /*i18n*/"Can't find a play";
				else {
					this._debug(bestPlay);
					const start = bestPlay.placements[0];
					hint.text = /*i18n*/"Hint";
					const words = bestPlay.words.map(w => w.word).join(",");
					hint.args = [
						words, start.row + 1, start.col + 1, bestPlay.score
					];
				}

				// Tell the requesting player the hint
				this.notifyPlayer(player, Notify.MESSAGE, hint);
				
				// Tell *everyone* that they asked for a hint
				this.notifyPlayers(Notify.MESSAGE, {
					sender: /*i18n*/"Advisor",
					text: /*i18n*/"$1 asked for a hint",
					classes: "warning",
					args: [ player.name ],
					timestamp: Date.now()
				});
			})
			.catch(e => {
				console.error("Error", e);
				this.notifyPlayers(Notify.MESSAGE, {
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
				this.notifyPlayers(Notify.MESSAGE, {
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
			this._debug(`Computing advice for ${player.name} > ${theirScore}`);

			let bestPlay = null;
			Platform.findBestPlay(
				this, player.rack.tiles(), data => {
					if (typeof data === "string")
						this._debug(data);
					else
						bestPlay = data;
				})
			.then(() => {
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
					this.notifyPlayers(Notify.MESSAGE, {
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
			/* istanbul ignore if */
			if (player.key !== this.whosTurnKey)
				return Promise.reject("Not your turn");

			if (!(move instanceof Move))
				move = new Move(move);

			this._debug(move);
			//console.log(`Player's rack is ${player.rack}`);

			if (this.dictionary
				&& !this.isRobot
				&& this.wordCheck === Game.WORD_CHECK_REJECT) {

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
				// We can't do this asynchronously because the advice
				// depends on the board state, which the move might
				// update while the advice was still being computed.
				await this.advise(player, move.score);
			}

			const game = this;

			// Move tiles from the rack to the board
			move.placements.forEach(placement => {
				const square = game.board.at(placement.col, placement.row);
				const tile = player.rack.removeTile(placement);
				square.placeTile(tile, true);
			});

			player.score += move.score;

			// Get new tiles to replace those placed
			for (let i = 0; i < move.placements.length; i++) {
				const tile = this.letterBag.getRandomTile();
				if (tile) {
					player.rack.addTile(tile);
					move.addReplacement(tile);
				}
			}

			this._debug("New rack", player.rack.toString());

			//console.debug("words ", move.words);

			if (this.dictionary
				&& this.wordCheck === Game.WORD_CHECK_AFTER
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

			// Report the result of the turn
			const nextPlayer = this.nextPlayer();
			this.whosTurnKey = nextPlayer.key;
			return this.finishTurn(new Turn(this, {
				type: Turn.PLAY,
				playerKey: player.key,
				nextToGoKey: nextPlayer.key,
				score: move.score,
				placements: move.placements,
				replacements: move.replacements,
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
			this._debug(`Autoplaying ${player.name}`);

			// Before making a robot move, consider challenging the last
			// player.
			// challenge is a Promise that will resolve to a Turn if a
			// challenge is made, or undefined otherwise.
			let challenge = Promise.resolve(undefined);
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
							return this.takeBack(player, Turn.CHALLENGE_WON)
							.then(() => true);
						}
						return false;
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
						return this.confirmGameOver(Game.STATE_GAME_OVER);
				}

				let bestPlay = null;
				return Platform.findBestPlay(
					this, player.rack.tiles(),
					data => {
						if (typeof data === "string")
							this._debug(data);
						else {
							bestPlay = data;
							this._debug("Best", bestPlay);
						}
					}, player.dictionary)
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
			this.notifyPlayers(Notify.PAUSE, {
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
			this.notifyPlayers(Notify.UNPAUSE, {
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
		 * (i18n message id) one of STATE_GAME_OVER, STATE_2_PASSES, or
		 * STATE_CHALLENGE_FAILED
		 * @return {Promise} resolving to undefined
		 */
		confirmGameOver(endState) {
			this.state = endState || Game.STATE_GAME_OVER;

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
				if (this.timerType === Player.TIMER_GAME && player.clock < 0) {
					const points = Math.round(
						player.clock * this.timePenalty / 60);
					this._debug(player.name, "over by", player.clock,
							   "time penalty", player.clock * this.timePenalty / 60, "=", points);
					if (Math.abs(points) > 0)
						deltas[player.key].time = points;
				}
			});

			if (playerWithNoTiles) {
				playerWithNoTiles.score += pointsRemainingOnRacks;
				deltas[playerWithNoTiles.key].tiles = pointsRemainingOnRacks;
				this._debug(`${playerWithNoTiles.name} gains ${pointsRemainingOnRacks}`);
			}
			const turn = new Turn(this, {
				type: Turn.GAME_OVER,
				endState: endState,
				playerKey: this.whosTurnKey,
				score: deltas
			});
			return this.finishTurn(turn);
		}

		/**
		 * Undo the last move. This might be as a result of a player request,
		 * or the result of a challenge.
		 * @param {Player} player if type==Turn.CHALLENGE_WON this must be
		 * the challenging player. Otherwise it is the player taking their
		 * play back.
		 * @param {string} type the type of the takeBack; Turn.TOOK_BACK
		 * or Turn.CHALLENGE_WON.
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
					boardSquare.placeTile(null);
				}
			}

			prevPlayer.score -= previousMove.score;

			const turn = new Turn(this, {
				type: type,
				nextToGoKey:
				type === Turn.CHALLENGE_WON ? this.whosTurnKey
				: previousMove.playerKey,
				score: -previousMove.score,
				placements: previousMove.placements,
				replacements: previousMove.replacements,
			});

			if (type === Turn.TOOK_BACK) {
				// A takeBack, not a challenge.
				turn.playerKey = previousMove.playerKey;

			} else {
				// else a successful challenge, does not move the player on.
				turn.challengerKey = player.key;
				turn.playerKey = previousMove.playerKey;
			}

			return this.finishTurn(turn)
			.then(() => {
				if (type === Turn.TOOK_BACK) {
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
		 * @param {string} type pass type, `Turn.PASSED` or
		 * `Turn.TIMEOUT`. If undefined, defaults to passed
		 * @return {Promise} resolving to the game
		 */
		pass(player, type) {
			/* istanbul ignore if */
			if (player.key !== this.whosTurnKey)
				return Promise.reject("Not your turn");

			const turn = new Turn(
				this, {
					type: type || Turn.PASSED
				});
			turn.playerKey = player.key;
			player.passes++;

			const nextPlayer = this.nextPlayer();
			turn.nextToGoKey = nextPlayer.key;

			return this.finishTurn(turn)
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
			.catch(() => {
				/* istanbul ignore next */
				this._debug("No dictionary, so challenge always succeeds");
				/* istanbul ignore next */
				return this.takeBack(challenger, Turn.CHALLENGE_WON);
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
					return this.takeBack(challenger, Turn.CHALLENGE_WON);
				}

				// Challenge failed

				const prevPlayerKey = previousMove.playerKey;
				const currPlayerKey = this.getPlayer().key;
				const nextPlayer = this.nextPlayer();

				if (challenger.key === currPlayerKey &&
					this.penaltyType === Game.PENALTY_MISS) {

					// Current player issued the challenge, they lose the
					// rest of this turn

					// Special case; if the challenged play would be the
					// last play (challenged player has no more tiles) and
					// challenging player is the next player, then it is game
					// over. It is the last play if there were no
					// replacements.
					if ((!previousMove.replacements
						 || previousMove.replacements.length === 0))
						return this.confirmGameOver(
							Game.STATE_CHALLENGE_FAILED);
					// Otherwise issue turn type=Turn.CHALLENGE_LOST

					const turn = new Turn(
						this, {
							type: Turn.CHALLENGE_LOST,
							penalty: Game.PENALTY_MISS,
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
				switch (this.penaltyType) {
				case Game.PENALTY_MISS:
					// tag them as missing their next turn
					challenger.missNextTurn = true;
					break;
				case Game.PENALTY_PER_TURN:
					lostPoints = -this.penaltyPoints;
					break;
				case Game.PENALTY_PER_WORD:
					lostPoints = -this.penaltyPoints
					* previousMove.words.length;
					break;
				default: // Game.PENALTY_NONE
				}

				challenger.score += lostPoints;
				return this.finishTurn(new Turn(
					this, {
						type: Turn.CHALLENGE_LOST,
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
		 * Player wants to swap their current rack for a different
		 * letters.
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

			// Construct a move to record the results of the swap
			const move = new Move();

			// First get some new tiles
			// Scrabble Rule #7: You may use a turn to exchange all,
			// some, or none of the letters. To do this, place your
			// discarded letter(s) facedown. Draw the same number of
			// letters from the pool, then mix your discarded
			// letter(s) into the pool.
			let tile;
			for (tile of tiles)
				move.addReplacement(this.letterBag.getRandomTile());

			// Return discarded tiles to the letter bag
			for (tile of tiles) {
				const removed = player.rack.removeTile(tile);
				/* istanbul ignore if */
				if (!removed)
					// Terminal, no point in translating
					throw Error(`Cannot swap, player rack does not contain letter ${tile.letter}`);
				this.letterBag.returnTile(removed);
			}

			// Place new tiles on the rack
			for (tile of move.replacements)
				player.rack.addTile(tile);

			const nextPlayer = this.nextPlayer();
			return this.finishTurn(new Turn(
				this,
				{
					type: Turn.SWAP,
					playerKey: player.key,
					nextToGoKey: nextPlayer.key,
					replacements: move.replacements
				}))
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
				// Copy players
				this.players.forEach(p => newGame.addPlayer(new Player(p)));

				if (this._noPlayerShuffle) // for unit tests
					newGame._noPlayerShuffle = true;

				// Players will be shuffled in playIfReady
				newGame.whosTurnKey = undefined;

				this._debug(`Created follow-on game ${newGame.key}`);
				return newGame.save()
				.then(() => newGame.playIfReady()) // trigger robot
				.then(() => this.notifyPlayers(Notify.NEXT_GAME, {
					gameKey: newGame.key,
					timestamp: Date.now()
				}))
				.then(() => newGame);
			});
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

	// Valid values for 'state'. Values are used in UI
	Game.STATE_WAITING          = /*i18n*/"Waiting for players";
	Game.STATE_PLAYING          = /*i18n*/"Playing";
	Game.STATE_GAME_OVER        = /*i18n*/"Game over";
	Game.STATE_2_PASSES         = /*i18n*/"All players passed twice";
	Game.STATE_CHALLENGE_FAILED = /*i18n*/"Challenge failed";
	Game.STATE_TIMED_OUT        = /*i18n*/"Timed out";

	// Valid values for 'penaltyType'. Values are used in UI
	Game.PENALTY_NONE     = /*i18n*/"No penalty";
	Game.PENALTY_MISS     = /*i18n*/"Miss next turn";
	Game.PENALTY_PER_TURN = /*i18n*/"Lose points";
	Game.PENALTY_PER_WORD = /*i18n*/"Lose points per word";

	// Failed challenge penalty options for UI
	Game.PENALTIES = [
		Game.PENALTY_PER_WORD, Game.PENALTY_PER_TURN,
		Game.PENALTY_MISS, Game.PENALTY_NONE
	];

	// defaults
	Game.PENALTY_TYPE   = Game.PENALTY_PER_WORD;
	Game.PENALTY_POINTS = 5; // points per correct word challenged

	// Timer types
	Game.TIMERS = [ Player.TIMER_NONE, Player.TIMER_TURN, Player.TIMER_GAME ];

	// Word check types
	Game.WORD_CHECK_NONE   = /*i18n*/"Don't check words";
	Game.WORD_CHECK_AFTER  = /*i18n*/"Check words after play";
	Game.WORD_CHECK_REJECT = /*i18n*/"Reject unknown words";
	Game.WORD_CHECKS = [
		Game.WORD_CHECK_NONE, Game.WORD_CHECK_AFTER, Game.WORD_CHECK_REJECT
	];
	
	// Classes used in Freeze/Thaw
	Game.classes = [ LetterBag, Square, Board, Tile, Rack,
					 Game, Player, Move, Turn ];

	return Game;
});

