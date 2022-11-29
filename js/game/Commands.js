/*Copyright (C) 2021-2022 The Xanado Project https://github.com/cdot/Xanado
  License MIT. See README.md at the root of this distribution for full copyright
  and license information. Author Crawford Currie http://c-dot.co.uk*/
/* eslint-env amd */

define([
  "platform", "common/Utils",
  "common/Types", "game/Player", "game/Turn"
], (
  Platform, Utils,
  Types, Player, Turn
) => {
  const Notify    = Types.Notify;
  const State     = Types.State;
  const Penalty   = Types.Penalty;
  const Timer     = Types.Timer;
  const WordCheck = Types.WordCheck;
  const Turns     = Types.Turns;

  /**
   * Server-side mixin to {@linkcode Game} that provides handlers for game
   * commands.
   * @mixin Commands
   */
  class Commands {

    /**
     * Place tiles on the board.
     * @function
     * @instance
     * @memberof Commands
     * @param {Player} player player requesting the move
     * @param {Move} move a Move (or the spec of a Move)
     * @return {Promise} resolving to a the game
     */
    async play(player, move) {
      Platform.assert(move);
      Platform.assert(player && player.key === this.whosTurnKey,
                      `Not ${player.name}'s turn`);

      this._debug("Playing", Utils.stringify(move));
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
        await this.advise(player, move.score);
      }

      const game = this;

      // Move tiles from the rack to the board
      this.rackToBoard(move.placements, player);

      player.score += move.score;

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
                  text: /*i18n*/"word-not-found",
                  args: [ w.word, dict.name ]
                });
            }
          }
        });
      }

      const prepasses = player.passes;
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
      return this.finishTurn(player, {
        type: Turns.PLAYED,
        nextToGoKey: nextPlayer.key,
        score: move.score,
        placements: move.placements,
        replacements: replacements,
        words: move.words,
        passes: prepasses
      })
      .then(() => this.startTurn(nextPlayer));
    }

    /**
     * Pause the game
     * @function
     * @instance
     * @memberof Commands
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
     * @function
     * @instance
     * @memberof Commands
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
     * @function
     * @instance
     * @memberof Commands
     * @param {Player} player player confirming end of game
     * @param {string} endState gives reason why game ended
     * (i18n message id) one of `State.GAME_OVER`, `State.TWO_PASSES`, or
     * `State.CHALLENGE_LOST`
     * @return {Promise} resolving to undefined
     */
    confirmGameOver(player, endState) {
      // If players pass twice then a game-over will be automatically
      // handled in startTurn. We don't want to repeat the processing
      // again.
      if (this.state !== State.PLAYING)
        return Promise.resolve();

      this.state = endState || State.GAME_OVER;

      this._debug(`Confirming game over because ${this.state}`);
      this.stopTheClock();

      // When the game ends, each player's score is reduced by
      // the sum of their unplayed letters. If a player has used
      // all of his or her letters, the sum of the other players'
      // unplayed letters is added to that player's score.
      let playerWithNoTiles;
      let pointsRemainingOnRacks = 0;
      const deltas = {};
      this.players.forEach(player => {
        const delta = { tiles: 0 };
        // Unless undo is enabled, the client receives redacted versions of
        // the rack tiles. We have to send the actual tiles remaining on racks
        // for the "game ended" message.
        if (player.rack.isEmpty()) {
          Platform.assert(
            !playerWithNoTiles,
            "Found more than one player with no tiles when finishing game");
          playerWithNoTiles = player;
        }
        else {
          const rackScore = player.rack.score();
          player.score -= rackScore;
          // Points lost for tiles remaining
          delta.tiles -= rackScore;
          // Tiles remaining on this player's rack
          delta.tilesRemaining = player.rack.lettersLeft().join(",");
          pointsRemainingOnRacks += rackScore;
          this._debug(`\t${player.name}: ${rackScore} points left ${delta.tilesRemaining}`);
        }
        if (this.timerType === Timer.GAME && player.clock < 0) {
          const points = Math.round(
            player.clock * this.timePenalty / 60);
          this._debug(player.name, "over by", -player.clock,
                      "s, score", points, "points");
          if (points < 0)
            delta.time = points;
        }
        deltas[player.key] = delta;
      });

      if (playerWithNoTiles) {
        playerWithNoTiles.score += pointsRemainingOnRacks;
        deltas[playerWithNoTiles.key].tiles = pointsRemainingOnRacks;
        this._debug(`${playerWithNoTiles.name} gains ${pointsRemainingOnRacks}`);
      }
      return this.finishTurn(player, new Turn({
        type: Turns.GAME_ENDED,
        endState: endState,
        score: deltas
      }));
    }

    /**
     * Undo the last move. This might be as a result of a player request,
     * or the result of a challenge.
     * @function
     * @instance
     * @memberof Commands
     * @param {Player} player if type==Turns.CHALLENGE_WON this must be
     * the challenging player. Otherwise it is the player taking their
     * play back.
     * @param {string} type the type of the takeBack; Turns.TOOK_BACK
     * or Turns.CHALLENGE_WON.
     * @return {Promise} Promise resolving to the game
     */
    takeBack(player, type) {
      const previousMove = this.lastTurn();
      if (!previousMove)
        return Promise.reject("No previous move to take back");
      if (previousMove.type !== Turns.PLAYED)
        return Promise.reject(`Cannot challenge a ${previousMove.type}`);

      const prevPlayer = this.getPlayerWithKey(previousMove.playerKey);

      // Move tiles that were added to the rack as a consequence
      // of the previous move, back to the letter bag
      this.rackToBag(previousMove.replacements, prevPlayer);

      // Move placed tiles from the board back to the player's rack
      this.boardToRack(previousMove.placements, prevPlayer);

      prevPlayer.score -= previousMove.score;

      const turn = {
        type: type,
        nextToGoKey: type === Turns.CHALLENGE_WON
        ? this.whosTurnKey : player.key,
        score: -previousMove.score,
        placements: previousMove.placements,
        replacements: previousMove.replacements
      };

      if (type === Turns.CHALLENGE_WON)
        turn.challengerKey = player.key;

      return this.finishTurn(prevPlayer, turn)
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
     * @function
     * @instance
     * @memberof Commands
     * @param {Player} player player passing (must be current player)
     * @param {string} type pass type, `Turns.PASSED` or
     * `Turns.TIMED_OUT`. If undefined, defaults to `Turns.PASSED`
     * @return {Promise} resolving to the game
     */
    pass(player, type) {
      Platform.assert(player.key === this.whosTurnKey,
                      `Not ${player.name}'s turn`);

      player.passes++;

      const nextPlayer = this.nextPlayer();

      return this.finishTurn(player, {
        type: type || Turns.PASSED,
        nextToGoKey: nextPlayer.key
      })
      .then(() => this.startTurn(nextPlayer));
    }

    /**
     * Handler for 'challenge' command.
     * Check the words created by the previous move are in the dictionary
     * @function
     * @instance
     * @memberof Commands
     * @param {Player} challenger player making the challenge
     * @param {Player} challenged player being challenged
     * @return {Promise} resolving to the game
     */
    challenge(challenger, challenged) {

      if (challenger.key === challenged.key)
        return Promise.reject("Cannot challenge your own play");

      if (this.turns.length === 0)
        return Promise.reject("No previous move to challenge");

      let previousMove = this.lastTurn();

      if (!previousMove)
        return Promise.reject("No previous move to challenge");
      if (previousMove.type !== Turns.PLAYED)
        return Promise.reject(`Cannot challenge a ${previousMove.type}`);

      if (challenged.key !== previousMove.playerKey)
        return Promise.reject("Last player challenge mismatch");

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
          this._debug("Bad words: ", bad);

          // Take back the challenged play. Irrespective of
          // whether the challenger is the current player or
          // not, takeBack should leave the next player
          // after the challenged player with the turn.
          return this.takeBack(challenger, Turns.CHALLENGE_WON);
        }

        this._debug("Challenge failed,", this.challengePenalty);

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
               || previousMove.replacements.length === 0)
             && challenged.rack.isEmpty())
            return this.confirmGameOver(
              this.getPlayer(), State.FAILED_CHALLENGE);
          // Otherwise issue turn type=Turns.CHALLENGE_LOST

          // Penalty for a failed challenge is miss a turn,
          // and the challenger is the current player, so their
          // turn is at an end.
          return this.finishTurn(challenged, {
            type: Turns.CHALLENGE_LOST,
            penalty: Penalty.MISS,
            challengerKey: challenger.key,
            nextToGoKey: nextPlayer.key
          })
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
          lostPoints = -this.penaltyPoints * previousMove.words.length;
          break;
        }

        challenger.score += lostPoints;
        return this.finishTurn(challenged, {
          type: Turns.CHALLENGE_LOST,
          score: lostPoints,
          challengerKey: challenger.key,
          nextToGoKey: currPlayerKey
        });
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
     * @function
     * @instance
     * @memberof Commands
     * @param {Player} player player making the swap (must be current
     * player)
     * @param {Tile[]} tiles list of tiles to swap
     * @return {Promise} resolving to the game
     */
    swap(player, tiles) {
      Platform.assert(player.key === this.whosTurnKey,
                      `Not ${player.name}'s turn`);
      Platform.assert(
        this.letterBag.remainingTileCount() >= tiles.length,
        `Cannot swap, bag only has ${this.letterBag.remainingTileCount()} tiles`);

      // A swap counts as a pass. If the other player is also swapping
      // or passing, that means two swaps at most.
      player.passes++;

      // Get the right number of new tiles from the bag
      const replacements = this.letterBag.getRandomTiles(tiles.length);

      // Return discarded tiles to the letter bag to make space
      // on the player's rack
      this.rackToBag(tiles, player);

      // Place new tiles on the rack, now that there's space
      for (const rep of replacements)
        player.rack.addTile(rep);

      const nextPlayer = this.nextPlayer();

      return this.finishTurn(player, {
        type: Turns.SWAPPED,
        nextToGoKey: nextPlayer.key,
        placements: tiles, // the tiles that were swapped out
        replacements: replacements // the tiles that are replacing them
      })
      .then(() => this.startTurn(nextPlayer));
    }

    /**
     * Create another game the same, but with players re-ordered. The
     * key for the new game is broadcast in a `NEXT_GAME` notification.
     * @function
     * @instance
     * @memberof Commands
     * @return {Promise} resolving to the new game
     */
    anotherGame() {
      if (this.nextGameKey)
        return Promise.reject("Next game already exists");

      this._debug(`Create game to follow ${this.key}`);
      // Can't require `Game` (circular reference during loading)
      // so rather than mucking around with requirejs simply use
      // this.constructor to get the class.
      const newGame = new (this.constructor)(this);
      // Constructor will copy the old game key
      newGame.key = Utils.genKey();
      return newGame.create()
      .then(() => newGame.onLoad(this._db))
      .then(() => this.nextGameKey = newGame.key)
      .then(() => this.save())
      .then(() => {
        newGame.creationTimestamp = Date.now();

        // No turns inherited
        newGame.turns = [];

        // copy the players
        for (const p of this.players) {
          const np = new Player(p);
          newGame.addPlayer(np, true);
        }

        newGame.state = State.WAITING;
        // Players will be shuffled in playIfReady
        newGame.whosTurnKey = undefined;

        // for unit tests
        newGame._noPlayerShuffle = this._noPlayerShuffle;

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
     * Toggle advice on/off. All players are told using
     * a `MESSAGE` notification.
     * @function
     * @instance
     * @memberof Commands
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
          text: /*i18n*/"advised",
          classes: "warning",
          args: [ player.name ],
          timestamp: Date.now()
        });
    }

    /**
     * Promise to advise player as to what better play they
     * might have been able to make. Server side only.
     * @function
     * @instance
     * @memberof Commands
     * @param {Player} player a Player
     * @param {number} theirScore score they got from their play
     * @return {Promise} resolves to undefined when the advice is ready.
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
        return Promise.resolve();
      }

      this._debug(`Computing advice for ${player.name} > ${theirScore}`,
                  player.rack.tiles().map(t => t.letter),
                  this.board.stringify());

      let bestPlay = null;
      return Platform.findBestPlay(
        this, player.rack.tiles(), data => {
          if (typeof data === "string")
            this._debug(data);
          else
            bestPlay = data;
        }, this.dictionary)
      .then(() => {
        //this._debug("Incoming",bestPlay);
        /* istanbul ignore else */
        if (bestPlay && bestPlay.score > theirScore) {
          this._debug(`Better play found for ${player.name}`);
          const start = bestPlay.placements[0];
          const words = bestPlay.words.map(w => w.word).join(",");
          const advice = {
            sender: /*i18n*/"Advisor",
            text: /*i18n*/"possible-score",
            args: [  words, start.row + 1, start.col + 1,
                    bestPlay.score ]
          };
          this.notifyPlayer(player, Notify.MESSAGE, advice);
          this.notifyOthers(player, Notify.MESSAGE, {
            sender: /*i18n*/"Advisor",
            text: /*i18n*/"was-advised",
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
     * Handler for 'hint' request. This is NOT a turn handler.
     * Asynchronously calculate a play for the given player, and
     * notify all players that they requested a hint.
     * @function
     * @instance
     * @memberof Commands
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
        }, this.dictionary)
      .then(() => {
        const hint = {
          sender: /*i18n*/"Advisor"
        };
        if (!bestPlay)
          hint.text = /*i18n*/"log-no-play";
        else {
          const start = bestPlay.placements[0];
          hint.text = "_hint_";
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
          text: /*i18n*/"hinted",
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
     * Add a word to the dictionary whitelist, asynchronously
     * @function
     * @instance
     * @memberof Commands
     * @param {Player} player player adding the word
     * @param {string} word word to add
     */
    allow(player, word) {
      word = word.toUpperCase();
      this.getDictionary()
      .then(dict => {
        if (dict.addWord(word)) {
          this.notifyAll(
            Notify.MESSAGE, {
              sender: /*i18n*/"Advisor",
              text:
              /*i18n*/"log-word-added",
              args: [
                player.name, word, dict.name
              ]
            });
        } else {
          this.notifyPlayer(
            player,
            Notify.MESSAGE, {
              sender: /*i18n*/"Advisor",
              text: /*i18n*/"word-there",
              args: [ word, dict.name ]
            });
        }
      });
    }
  }

  return Commands;
});

