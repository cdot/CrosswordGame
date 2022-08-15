/*Copyright (C) 2019-2022 The Xanado Project https://github.com/cdot/Xanado
  License MIT. See README.md at the root of this distribution for full copyright
  and license information. Author Crawford Currie http://c-dot.co.uk*/
/* eslint-env amd */
/* global process */


define([
  "platform", "common/Utils",
  "common/Types", "game/Board", "game/LetterBag",
  "game/Player", "game/Square", "game/Tile", "game/Rack",
  "game/Edition", "game/Move", "game/Turn", "game/Undo",
  requirejs.isBrowser ? "browser/Game" : "server/Game"
], (
  Platform, Utils,
  Types, Board, LetterBag,
  Player, Square, Tile, Rack,
  Edition, Move, Turn, Undo,
  PlatformMixin
) => {

  const State     = Types.State;
  const Penalty   = Types.Penalty;
  const Timer     = Types.Timer;

  /**
   * Base class of Game objects. Common functionality shared by browser
   * and server sides.
   * @extends Undo
   * @mixes BrowserGame
   * @mixes ServerGame
   */
  class Game extends Undo(PlatformMixin) {

    // Classes used in Freeze/Thaw
    static classes = {
      Board: Board,
      Game: Game,
      LetterBag: LetterBag,
      Move: Move,
      Player: Player,
      Rack: Rack,
      Square: Square,
      Tile: Tile,
      Turn: Turn
    };

    /**
     * A new game is constructed from scratch by
     * ```
     * new Game(...).create().then(game => game.onLoad(db)...
     * ```
     * A game identified by key is loaded from a db by
     * ```
     * db.get(key, Game.classes).then(game => game.onLoad(db)...
     * ```
     * (may be null).
     * @param {object} params Parameter object. This can be another
     * Game to copy game parameters, or a generic object with fields
     * the same name as Game fields.
     * Note that `players` and `turns` are not copied.
     */
    constructor(params) {
      super();

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

      /**
       * Key that uniquely identifies this game.
       * @member {Key}
       */
      this.key = params.key || Utils.genKey();

      /**
       * An i18n message identifier indicating the game state.
       * @member {State}
       */
      this.state = State.WAITING;

      /**
       * Epoch ms when this game was created.
       * @member {number}
       */
      this.creationTimestamp = params.creationTimestamp || Date.now();

      /**
       * List of players in the game.
       * Lateinit as the result of a load.
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
       * The game board.
       * @member {Board}
       */
      this.board = undefined;

      /**
       * Size of rack. Always the same as Edition.rackCount,
       * because we don't hold a pointer to the Edition. Note this
       * is saved with the game.
       * Copied from the {@linkcode Edition} in {@linkcode Game#create|create}.
       * @member {number}
       */
      this.rackSize = undefined;

      /**
       * Size of swap rack.
       * Lateinit in {@linkcode Game#create|create} or as the result of a
       * load.
       * @member {number}
       */
      this.swapSize = undefined;

      /**
       * Map of number of tiles played, to bonus for the play.
       * Lateinit in {@linkcode Game#create|create} or as the result of a
       * load.
       * @member {object<number,number>}
       * @private
       */
      this.bonuses = undefined;

      /**
       * Bag of remaining letters, initialised from the edition.
       * Lateinit in {@linkcode Game#create|create} or as the result of a
       * load.
       * @member {LetterBag}
       */
      this.letterBag = undefined;

      /**
       * Key of next player to play in this game.
       * @member {string?}
       */
      this.whosTurnKey = undefined;

      /**
       * Undo engine for this game. Lazy init when required.
       * @member {Undo?}
       * @private
       */
      this._undoer = undefined;

      /**
       * Name of the edition (see {@linkcode Edition}).
       * Edition objects are stored in the Edition class and
       * demand-loaded as required. This allows us to
       * throw Game objects around without worrying too much about
       * the data volume.
       * @member {string}
       */
      this.edition = params.edition;

      /*
       * When you name a field in a class declaration without an
       * initial value, it gets initialised to undefined. This means the
       * object gets cluttered with undefined fields that are not used
       * in the configuration. So we test whether these optional fields
       * are required or not.
       */

      if (params.dictionary)
        /**
         * Name of the dictionary used for checking words and
         * generating robot plays. A game doesn't need to have a
         * dictionary if words are not checked and there is no robot
         * player.
         * This is just the name of the dictionary. Dictionary objects
         * are stored in the {@linkcode Dictionary} class and
         * demand-loaded as and when required. This allows us to
         * throw Game objects around without worrying too much about
         * the data volume.
         * @member {string?}
         */
        this.dictionary = params.dictionary;

      if (params.timerType && params.timerType !== "none")
        /**
         * Type of timer for this game.
         * @member {Timer}
         */
        this.timerType = params.timerType;

      if (this.timerType) {
        if (typeof params.timeAllowed !== "undefined")
          /**
           * Time limit for this game, in minutes. If `timerType` is
           * `TIMER_GAME` defaults to 25 minutes, and 1 minute for
           * `TIMER_TURN`.
           * @member {number?}
           */
          this.timeAllowed = params.timeAllowed;
        else
          this.timeAllowed = 0;
        if (this.timeAllowed <= 0) {
          if (this.timerType === Timer.GAME)
            this.timeAllowed = 25; // 25 minutes
          else
            this.timeAllowed = 1; // 1 minute
        }

        if (this.timerType === Timer.GAME)
          /**
           * Time penalty for this game, points lost per minute over
           * timeAllowed. Only used if `timerType` is `TIMER_GAME`.
           * @member {number?}
           */
          this.timePenalty = params.timePenalty || 5;
      }

      /**
       * The type of penalty to apply for a failed challenge.
       * @member {Penalty}
       */
      if (params.challengePenalty && params.challengePenalty !== "none")
        this.challengePenalty = params.challengePenalty;

      if (this.challengePenalty === Penalty.PER_TURN
          || this.challengePenalty === Penalty.PER_WORD)
        /**
         * The score penalty to apply for a failed challenge. Only used
         * if `challengePenalty` is `Penalty.PER_TURN` or `Penalty.PER_WORD`.
         * @member {number}
         */
        this.penaltyPoints = params.penaltyPoints || 5;

      if (params.wordCheck && params.wordCheck !== "none")
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
     * Creation steps that can't be done in the constructor because
     * they require promises.
     * Load the edition and create the board and letter bag.
     * Not done in the constructor because we need to return
     * a Promise. Must be followed by onLoad to connect a
     * DB and complete initialisation of private fields.
     * @return {Promise} that resolves to this
     */
    create() {
      return this.getEdition()
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
     * Make changes as required by the structure passed. Any field
     * in the game can be changed. The game will be saved.
     */
    makeChanges(vals) {
    }

    /**
     * Get the edition for this game, lazy-loading as necessary
     * @return {Promise} resolving to an {@linkcode Edition}
     */
    getEdition() {
      return Edition.load(this.edition);
    }

    /**
     * Add a player to the game.
     * @param {Player} player
     * @param {boolean?} fillRack true to fill the player's rack
     * from the game's letter bag.
     * @return {Game} this
     */
    addPlayer(player, fillRack) {
      Platform.assert(this.letterBag, "Cannot addPlayer() before create()");
      Platform.assert(
        !this.maxPlayers || this.players.length < this.maxPlayers,
        "Cannot addPlayer() to a full game");
      player._debug = this._debug;
      this.players.push(player);
      if (this.timerType)
        player.clock = this.timeAllowed * 60;
      if (fillRack)
        player.fillRack(this.letterBag, this.rackSize);
      this._debug(this.key, "added player", player.stringify());
      return this;
    }

    /**
     * Remove a player from the game, taking their tiles back into
     * the bag
     * @param {Player} player
     */
    removePlayer(player) {
      player.returnTiles(this.letterBag);
      const index = this.players.findIndex(p => p.key === player.key);
      Platform.assert(index >= 0,
                      `No such player ${player.key} in ${this.key}`);
      this.players.splice(index, 1);
      this._debug(player.key, "left", this.key);
      if (this.players.length < (this.minPlayers || 2)
          && this.state !== State.GAME_OVER)
        this.state = State.WAITING;
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
     * Get the current player.
     * @return {Player} player, or undefined if not found
     */
    getPlayer() {
      return this.getPlayerWithKey(this.whosTurnKey);
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
        player = this.getPlayer();
      else if (typeof player === "string")
        player = this.getPlayerWithKey(player);
      const index = this.players.findIndex(p => p.key === player.key);
      Platform.assert(index >= 0,
                      `${player.key} not found in ${this.key}`);
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
        player = this.getPlayer();
      else if (typeof player === "string")
        player = this.getPlayerWithKey(player);
      let index = this.players.findIndex(p => p.key === player.key);
      Platform.assert(index >= 0,
                      `${player.key} not found in ${this.key}`);
      for (let i = 0; i < this.players.length; i++) {
        let nextPlayer = this.players[(index + 1) % this.players.length];
        if (nextPlayer.missNextTurn) {
          nextPlayer.missNextTurn = false;
          index++;
        } else
          return nextPlayer;
      }
      /* istanbul ignore next */
      return Platform.fail(
        `Unable to determine next player after ${player.key}`);
    }

    /**
     * Calculate any bonus afforded to plays of this length
     * @param {number} tilesPaced number of tiles placed
     * @return points bonus
     */
    calculateBonus(tilesPlaced) {
      // Duplicates Edition.calculateBonus, so it can be used even if
      // the Edition is not loaded (e.g. on the client side)
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
     * Get the current winning player
     * @return {Player} player in the lead
     */
    getWinner() {
      return this.players.reduce(
        (best, player) => (player.score > best.score ? player : best),
        this.players[0]);
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
      switch (this.state) {
      case State.WAITING:
      case State.FAILED_CHALLENGE:
      case State.PLAYING:
        return false;
      case State.GAME_OVER:
      case State.TWO_PASSES:
      case State.TIMED_OUT:
        return true;
      default:
        Platform.assert(false, `Bad game state ${this.state}`);
        return true;
      }
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
     * Add a turn to the game
     * @param {Turn} the turn to add
     */
    pushTurn(turn) {
      return this.turns.push(turn);
    }

    /**
     * Remove and return the last turn in the game
     * @param {Turn} the turn to add
     */
    popTurn(turn) {
      Platform.assert(this.turns.length > 0);
      return this.turns.pop();
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
     * Debug
     */
    stringify() {
      const options = [ `edition:${this.edition}` ];
      if (this.dictionary)
        options.push(`dictionary:${this.dictionary}`);
      if (this.timerType) {
        options.push(`${this.timerType}:${this.timeAllowed}`);
        if (this.timerType === Timer.GAME)
        options.push(`timePenalty:${this.timePenalty}`);
      }
      if (this.challengePenalty) {
        options.push(this.challengePenalty);
        if (this.challengePenalty === Penalty.PER_TURN
            || this.challengePenalty === Penalty.PER_WORD)
          options.push(`lose:${this.penaltyPoints}`);
      }
      if (this.whosTurnKey)
        options.push(`next:${this.whosTurnKey}`);

      if (this.wordCheck) options.push(this.wordCheck);
      if (this.challengePenalty) options.push(this.challengePenalty);
      if (this.predictScore) options.push("Predict");
      if (this.allowTakeBack) options.push("Allow takeback");
      if (this.minPlayers)
        options.push(`>=${this.minPlayers}`);
      const ps = this.players.map(p => p.stringify()).join(",");
      options.push(`players:[${ps}]`);
      if (this.maxPlayers)
        options.push(`<=${this.maxPlayers}`);
      if (this.nextGameKey)
        options.push(`Next game ${this.nextGameKey}`);
      if (this.pausedBy)
        options.push(`Paused by ${this.pausedBy}`);
      return `Game ${this.key} {${options.join(", ")}}`;
    }

    /**
     * Determine if any players are robots.
     * @return the first robot found.
     */
    hasRobot() {
      return this.players.find(p => p.isRobot);
    }

    /**
     * Create a simple structure describing a subset of the game
     * state, for sending to the 'games' interface using JSON.  The
     * structure does not suffice to fully reconstruct the game; there
     * will be no `board`, `rackSize`, `swapSize`, `bonuses`, `turns`
     * will be a list of {@linkcode Turn#serialisable|Turn.serialisable},
     * and `players` will be a list of
     * {@linkcode Player#serialisable|Player.serialisable}.
     * @param {UserManager} um user manager object for getting emails; only
     * works on server side
     * @return {Promise} resolving to a simple object with
     * key game data
     */
    serialisable(um) {
      return Promise.all(
        this.players.map(player => player.serialisable(this, um)))
      .then(ps => {
        const simple = {
          key: this.key,
          creationTimestamp: this.creationTimestamp,
          edition: this.edition,
          dictionary: this.dictionary,
          state: this.state,
          // players is a list of Player.serialisable
          players: ps,
          whosTurnKey: this.whosTurnKey,
          timerType: this.timerType,
          challengePenalty: this.challengePenalty,
          lastActivity: this.lastActivity(), // epoch ms
          // this.board is not sent
          // this.rackSize not sent
          // this.swapSize not sent
          // this.bonuses not sent
          // turns is a list of Turn.serialisable
          turns: this.turns.map(t => t.serialisable())
        };
        if (this.minPlayers) simple.minPlayers = this.minPlayers;
        if (this.maxPlayers) simple.maxPlayers = this.maxPlayers;
        if (this.wordCheck) simple.wordCheck = this.wordCheck;
        if (this.timerType != Game.TIMER_NONE) {
          simple.timeAllowed = this.timeAllowed;
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
     * Load a game from a structure generated by serialisable. This
     * method is designed to use to support rapid loading of games
     * into the `games` browser interface. The game will be incomplete,
     * only the fields supported by serialisable will be populated.
     * @param {object} simple object generated by serialisable()
     */
    static fromSerialisable(simple) {
      const game = new Game(simple);
      game.players = simple.players.map(p => Player.fromSerialisable(p));
      game.turns = simple.turns.map(t => Turn.fromSerialisable(t));
      return game;
    }

    // Shortcuts for moving tiles around within the game

    /**
     * Shorthand to remove tiles from the board and put
     * them on a rack
     * @param {Tile[]} tiles list of tile placements
     * @param {Player} player player whose rack we are adjusting
     */
    boardToRack(tiles, player) {
      for (const placement of tiles) {
        const square = this.at(placement.col, placement.row);
        const tile = square.unplaceTile();
        Platform.assert(tile, `No tile at ${Utils.stringify(placement)}`);
        player.rack.addTile(tile);
      }
    }

    /**
     * Shorthand to move tiles from the rack to the board
     * at the locations dictated in a set of placements
     * @param {Tile[]} tiles list of tile placements
     * @param {Player} player player whose rack we are adjusting
     * @param {function?} cb optional callback on each tile that was placed
     */
    rackToBoard(tiles, player, cb) {
      for (const place of tiles) {
        const tile = player.rack.removeTile(place);
        Platform.assert(
          tile, `Tile ${Utils.stringify(place)} not found on rack`);
        const square = this.at(place.col, place.row);
        Platform.assert(square && !square.tile);
        square.placeTile(tile, true);
        if (cb)
          cb(tile);
      }
    }

    /**
     * Shorthand method to take tiles out of the letter bag and put
     * them on a rack
     * @param {Tile[]} tiles list of tiles
     * @param {Player} player player whose rack we are adjusting
     */
    bagToRack(tiles, player) {
      for (const tile of tiles) {
        const removed = this.letterBag.removeTile(tile);
        Platform.assert(removed, `${Utils.stringify(tile)} missing from bag`);
        player.rack.addTile(removed);
      }
    }

    /**
     * Shorthand method to move a set of tiles from a rack to the bag
     * @param {Tile[]} tiles list of tiles
     * @param {Player} player player whose rack we are adjusting
     */
    rackToBag(tiles, player) {
      for (const tile of tiles) {
        const removed = player.rack.removeTile(tile);
        Platform.assert(removed, `${Utils.stringify(tile)} missing from rack`);
        this.letterBag.returnTile(removed);
      }
    }

  }

  return Game;
});
