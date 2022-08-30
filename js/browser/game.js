/*Copyright (C) 2019-2022 The Xanado Project https://github.com/cdot/Xanado
  License MIT. See README.md at the root of this distribution for full copyright
  and license information. Author Crawford Currie http://c-dot.co.uk*/
/* eslint-env browser, jquery */

define([
  "platform", "common/Fridge", "common/Utils",
  "game/Tile", "game/Rack", "game/Board",
  "common/Types", "game/Game", "game/Player", "game/Turn",
  "browser/UI", "browser/Dialog",
  "jquery", "jqueryui", "cookie", "browser/icon_button"
], (
  Platform, Fridge, Utils,
  Tile, Rack, Board,
  Types, Game, Player, Turn,
  UI, Dialog
) => {

  // Enumerated types
  const Command  = Types.Command;
  const Notify   = Types.Notify;
  const Penalty  = Types.Penalty;
  const Timer    = Types.Timer;
  const State    = Types.State;
  const Turns    = Types.Turns;
  const UIEvents = Types.UIEvents;

  // Check that incoming notifications are in the sequence we expect.
  // The sequence may have gaps, because some notifications only
  // go to a subset of users.
  let lastMessageID = -1;
  function checkSequenceNumber(notification) {
    if (notification.messageID <= lastMessageID) {
      console.error("ERROR: Message sequence error", lastMessageID,
                    ">=", Utils.stringify(notification));
      //Platform.fail("Message sequence error - check console");
    }
    lastMessageID = notification.messageID;
    return notification.data;
  }

  /**
   * User interface to a game in a browser. The Ui reflects the game state as
   * communicated from the server, through the exchange of various messages.
   * @extends UI
   */
  class GameUI extends UI {

    /**
     * The game being played.
     * @member {Game}
     */
    game;

    /**
     * The current player. init in identifyPlayer.
     * @member {Player}
     */
    player;

    /**
     * Currently selected Square (if any)
     * @member {Square?}
     * @private
     */
    selectedSquare;

    /**
     * Board lock status
     * @member {boolean}
     * @private
     */
    boardLocked = false;

    constructor() {
      super();

      /**
       * Undo stack. Head of the stack is the most recent undo.
       * The undo stack is cleared when a normal play (swap, place, challenge etc)
       * is executed. The only command that retains the stack is REDO.
       *
       */
      this.undoStack = [];
    }

    // @override
    handleURLArguments() {
      return super.handleURLArguments()
      .then(args => {
        if (args.observer) {
          this.observer = args.observer;
          console.debug(`\tObserver "${this.observer}"`);
        }
        Platform.assert(args.game, `No game in ${document.URL}`);
        const gameKey = args.game;
        console.debug(`GET /game/${gameKey}`);
        return $.get(`/game/${gameKey}`)
        .then(frozen => {
          console.debug(`--> Game ${gameKey}`);
          return Fridge.thaw(frozen, Game.classes);
        })
        .then(game => {
          return this.identifyPlayer(game)
          .then (playerKey => this.loadGame(game));
        });
      });
    }

    /**
     * Append to the log pane. Messages are wrapped in a div, which
     * may have the optional css class.
     * @param {boolean} interactive false if we are replaying messages into
     * the log, true if this is an interactive response to a player action.
     * @param {(jQuery|string)} mess thing to add
     * @param {string?} optional css class name
     * @return {jQuery} the div created
     * @private
     */
    $log(interactive, mess, css) {
      const $div = $("<div class='message'></div>");
      if (css)
        $div.addClass(css);
      $div.append(mess);
      const $lm = $("#logBlock > .messages");
      $lm.append($div);
      if (interactive)
        $lm.animate({
          scrollTop: $("#logBlock > .messages").prop("scrollHeight")
        }, 300);
      return $div;
    }

    /**
     * True if the key is this current player key
     * @param {string} key the player key to check
     * @return {boolean} true if we are that player
     */
    isThisPlayer(key) {
      return this.player && this.player.key === key;
    }

    /**
     * Send a game command to the server. Game commands are listed in the {@linkcode Command} type
     * @param {string} command command name
     * @param {object} args arguments for the request body
     */
    sendCommand(command, args) {
      if (command !== Command.REDO) {
        this.undoStack = [];
        $(".redoButton").hide();
      }
      console.debug(`POST /command/${command}`);
      this.lockBoard(true);
      this.enableTurnButton(false);
      this.cancelNotification();
      $.ajax({
        url: `/command/${command}/${this.game.key}`,
        type: "POST",
        contentType: "application/json",
        data: JSON.stringify(
          args,
          (key, value) => {
            // Don't stringify fields used by the UI.
            // These all start with "$"
            if (key.charAt(0) === "$")
              return undefined;
            return value;
          })
      })
      .then(r => console.debug(`${command} OK`, r))
      .catch(console.error);
    }

    /**
     * Update list of active connections.
     */
    handle_CONNECTIONS(observers) {
      console.debug("--> connections", Utils.stringify(observers));
      this.game.updatePlayerList(
        observers.filter(o => !o.isObserver));
      this.updateObservers(observers.filter(o => o.isObserver));
      this.updatePlayerTable();
      let myGo = this.isThisPlayer(this.game.whosTurnKey);
      this.lockBoard(!myGo);
    }

    /**
     * Process an incoming socket event to add a message to the
     * chat pane. Message text that matches an i18n message
     * identifier will be automatically translated with supplied
     * message args.
     * @param {object} message message object
     * @param {string} message.sender sender name (or Advisor)
     * @param {string} message.text i18n message identifier or plain text
     * @param {string} message.classes additional css classes to apply to
     * message
     * @param {object[]} args i18n arguments
     */
    handle_MESSAGE(message) {
      console.debug("--> message");
      let args = [ message.text ];
      if (typeof message.args === "string")
        args.push(message.args);
      else if (message.args instanceof Array)
        args = args.concat(message.args);

      const sender = /^chat-/.test(message.sender)
            ? $.i18n(message.sender) : message.sender;
      const $pn = $("<span></span>").addClass("chat-sender");
      $pn.text(sender);

      const $mess = $("<div></div>").addClass("chat-message");
      if (message.classes)
        $mess.addClass(message.classes);
      $mess.append($pn).append(": ");

      const $msg =  $("<span></span>").addClass("chat-text");
      $msg.text($.i18n.apply(null, args));
      $mess.append($msg);

      this.$log(true, $mess);

      // Special handling for _hint_, highlight square
      if (message.sender === "Advisor"
          && args[0] === /*i18n*/"_hint_") {
        let row = args[2] - 1, col = args[3] - 1;
        $(`#Board_${col}x${row}`).addClass("hint-placement");
      }
    }

    /**
     * Process a tick from the server. Does nothing in an untimed game.
     * @param {object} params Parameters
     * @param {string} gameKey game key
     * @param {string} playerKey player key
     * @param {string} clock seconds left for this player to play
     */
    handle_TICK(params) {
      // console.debug("--> tick");
      if (params.gameKey !== this.game.key)
        console.error(`key mismatch ${this.game.key}`);
      $(".player-clock")
      .hide();

      const ticked = this.game.getPlayerWithKey(params.playerKey);
      if (!ticked) {
        console.error("No such player", params.playerKey);
        return;
      }
      let remains = params.clock;
      ticked.clock = remains;

      const clocks = Utils.formatTimeInterval(remains);

      let extraClass = "tick-alert-none";
      if (this.game.timerType === Timer.TURN) {
        if (this.player && ticked.key === this.player.key
            && remains <= 10
            && this.getSetting("warnings"))
          this.playAudio("tick");

        if (remains < this.game.timeLimit / 6)
          extraClass = "tick-alert-high";
        else if (remains < this.game.timeLimit / 3)
          extraClass = "tick-alert-medium";
        else if (remains < this.game.timeLimit / 2)
          extraClass = "tick-alert-low";
      }
      else if (this.game.timerType === Timer.GAME) {
        if (remains < this.game.timeLimit / 10) // 2.5 mins
          extraClass = "tick-alert-high";
        else if (remains < this.game.timeLimit / 5) // 5 mins
          extraClass = "tick-alert-medium";
      }

      $(`#player${ticked.key} .player-clock`)
      .show()
      .removeClass("tick-alert-low tick-alert-medium tick-alert-high")
      .addClass(extraClass)
      .text(clocks);
    }

    /**
     * Process a Turn object received from the server. `Notify.TURN` events
     * are sent by the server when an action by any player has
     * modified the game state.
     * @param {Turn} turn a Turn object
     */
    handle_TURN(turn) {
      console.debug("--> turn ", turn);

      this.game.pushTurn(turn);

      $(".undoButton").toggle(this.getSetting("undo_redo"));

      this.removeMoveActionButtons();
      const player = this.game.getPlayerWithKey(turn.playerKey);
      const challenger = (typeof turn.challengerKey === "string")
            ? this.game.getPlayerWithKey(turn.challengerKey) : undefined;

      if (turn.type === Turns.CHALLENGE_LOST) {
        challenger.score += turn.score;
        challenger.$refreshScore();
      } else {
        switch (typeof turn.score) {
        case "number":
          player.score += turn.score;
          player.$refreshScore();
          break;
        case "object":
          for (const k in turn.score) {
            const delta = turn.score[k];
            const p = this.game.getPlayerWithKey(k);
            p.score += (delta.tiles || 0) + (delta.time || 0);
            p.$refreshScore();
          }
        }
      }

      // Unhighlight last placed tiles
      $(".last-placement").removeClass("last-placement");

      this.$log(true, this.game.describeTurn(turn, this.player, true));

      // Was the play initiated by, or primarily affecting, us
      const wasUs = (player === this.player);

      switch (turn.type) {
      case Turns.CHALLENGE_WON:
      case Turns.TOOK_BACK:
        if (wasUs)
          this.takeBackTiles();

        // Move new tiles out of challenged player's rack
        // into the bag
        if (turn.replacements)
          this.game.rackToBag(turn.replacements, player);

        // Take back the placements from the board into the
        // challenged player's rack
        if (turn.placements)
          this.game.boardToRack(turn.placements, player);

        // Was it us?
        if (wasUs) {
          if (turn.type === Turns.CHALLENGE_WON) {
            if (this.getSetting("warnings"))
              this.playAudio("oops");
            this.notify(
              /*i18n*/"Challenge succeeded!",
              /*i18n*/"$1 has successfully challenged your turn. You have lost the $2 points you scored, and the tiles you played are back on your rack",
              this.game.getPlayerWithKey(turn.playerKey).name,
              -turn.score);
          }
        }

        if (turn.type == Turns.TOOK_BACK) {
          this.notify(
            /*i18n*/"Move retracted!",
            /*i18n*/"$1 has taken back their turn",
            this.game.getPlayerWithKey(turn.playerKey).name);
        }
        break;

      case Turns.CHALLENGE_LOST:
        if (this.getSetting("warnings"))
          this.playAudio("oops");
        if (challenger === this.player) {
          // Our challenge failed
          this.notify(/*i18n*/"Your challenge failed",
            /*i18n*/"Your challenge failed");
        } else {
          this.notify(/*.i18n*/"Failed challenge!",
            /*i18n*/"$1 challenged your turn, but the dictionary backed you up",
            player.name);
        }

        break;

      case Turns.PLAYED:
        if (wasUs)
          this.takeBackTiles();

        // Take the placed tiles out of the players rack and
        // lock them onto the board.
        if (wasUs)
          this.game.rackToBoard(turn.placements, player);
        else
          this.game.rackToBoard(
            turn.placements, player,
            tile => // Highlight the tile as "just placed"
            tile.$tile.addClass("last-placement"));

        // Remove the new tiles from our copy of the bag and put them
        // on the rack.
        if (turn.replacements)
          this.game.bagToRack(turn.replacements, player);

        break;

      case Turns.SWAPPED:
        if (wasUs)
          this.takeBackTiles();
        // If it was our swap, then the rack was cleared when the command
        // was sent. We have to put the swapped tiles (turn.placements)
        // back in the bag, draw the turn.replacements, and put them on
        // the rack.
        this.game.rackToBag(turn.placements, player);
        this.game.bagToRack(turn.replacements, player);

        break;

      case Turns.GAME_ENDED:
        // End of game has been accepted
        if (wasUs)
          this.takeBackTiles();
        this.game.state = State.GAME_OVER;
        this.setAction("action_anotherGame", /*i18n*/"Another game?");
        this.enableTurnButton(true);
        this.notify(
          /*i18n*/"Game over",
          /*i18n*/"Your game is over...");

        if (this.player === this.game.getWinner()) {
            if (this.getSetting("cheers"))
              this.playAudio("endCheer");
        } else if (this.getSetting("cheers"))
          this.playAudio("lost");

        return;
      }

      if (this.isThisPlayer(turn.nextToGoKey)) {
        if (this.getSetting("turn_alert"))
          this.playAudio("yourturn");
        this.lockBoard(false);
        this.enableTurnButton(true);
      } else {
        this.lockBoard(true);
        this.enableTurnButton(false);
      }

      if (turn.nextToGoKey && turn.type !== Turns.CHALLENGE_WON) {

        if (turn.type == Turns.PLAYED) {
          if (wasUs) {
            if (this.game.allowTakeBack) {
              this.addTakeBackPreviousButton(turn);
            }
          } else {
            // It wasn't us, we might want to challenge.
            // Not much point in challenging a robot, but
            // ho hum...
            this.addChallengePreviousButton(turn);
          }
        }

        if (this.isThisPlayer(turn.nextToGoKey)
            && turn.type !== Turns.TOOK_BACK) {
          // It's our turn next, and we didn't just take back
          this.notify(/*i18n*/"Your turn",
            /*i18n*/"$1 has taken their turn and now it is your turn",
            this.game.getPlayerWithKey(turn.playerKey).name);
        }
        this.game.whosTurnKey = turn.nextToGoKey;
        this.updateWhosTurn();
      }
      this.updateGameStatus();
    }

    /**
     * Handle nextGame event. This tells the UI that a follow-on
     * game is available.
     * @param {object} info event info
     * @param {string} info.gameKey key for next game
     */
    handle_NEXTGAME(info) {
      console.debug("--> nextGame", info.gameKey);
      this.game.nextGameKey = info.gameKey;
      this.setAction("action_nextGame", /*i18n*/"Next game");
    }

    /**
     * In a game where words are checked before the play is accepted,
     * the server may reject a bad word with a 'reject' message.
     * @param {object} rejection the rejection object
     * @param {string} rejection.playerKey the rejected player
     * @param {string[]} rejection.words the rejected words
     */
    handle_REJECT(rejection) {
      console.debug("--> reject", rejection);
      // The tiles are only locked down when a corresponding
      // turn is received, so all we need to do is restore the
      // pre-sendCommand state and issues a message.
      this.lockBoard(false);
      this.enableTurnButton(true);
      if (this.getSetting("warnings"))
        this.playAudio("oops");
      this.$log(true, $.i18n(
        "The word{{PLURAL:$1||s}} $2 {{PLURAL:$1|was|were}} not found in the dictionary",
        rejection.words.length,
        rejection.words.join(", ")), "turn-narrative");
    }

    /**
     * Handle a pause event.
     * By using a modal dialog to report the pause, we block further
     * interaction until the pause is released.
     * @param {object} params Parameters
     * @param {string} params.key game key
     * @param {string} params.name name of player who paused/released
     */
    handle_PAUSE(params) {
      console.debug(`--> pause ${params.name}`);
      if (params.key !== this.game.key)
        console.error(`key mismatch ${this.game.key}`);
      $(".Surface .letter").addClass("hidden");
      $(".Surface .score").addClass("hidden");
      $("#pauseDialog > .banner")
      .text($.i18n("$1 has paused the game", params.name));
      $("#pauseDialog")
      .dialog({
        dialogClass: "no-close",
        modal: true,
        buttons: [
          {
            text: $.i18n("Continue the game"),
            click: () => {
              this.sendCommand(Command.UNPAUSE);
              $("#pauseDialog").dialog("close");
            }
          }
        ]});
    }

    /**
     * Handle an unpause event.
     * Close the modal dialog used to report the pause.
     * @param {object} params Parameters
     * @param {string} params.key game key
     * @param {string} params.name name of player who paused/released
     */
    handle_UNPAUSE(params) {
      console.debug(`--> unpause ${params.name}`);
      $(".Surface .letter").removeClass("hidden");
      $(".Surface .score").removeClass("hidden");
      $("#pauseDialog")
      .dialog("close");
    }

    /**
     * Handle an undone event. This is broadcast when a command has
     * been undone on the server.
     */
    handle_UNDONE(turn) {
      this.undoStack.push(turn);
      this.game.undo(true);
      const isMyGo = this.isThisPlayer(this.game.whosTurnKey);
      this.updatePlayerTable();
      this.updateWhosTurn();
      this.updateGameStatus();
      $(".redoButton").toggle(this.getSetting("undo_redo"));
      $(".last-placement")
      .removeClass("last-placement");
      if (this.game.turnCount() === 0)
        $(".undoButton").hide();
      this.lockBoard(!isMyGo);
      this.enableTurnButton(isMyGo);
      this.$log(true, $.i18n(
        "Undone $1, waiting for $2",
        turn.type, this.game.getPlayer().name));
      $(".undoButton")
      .toggle(this.game.turnCount() > 0 && this.getSetting("undo_redo"));
    }

    /**
     * Handle a key down event.
     * These are captured in the root of the UI and dispatched here.
     */
    keyDown(event) {
      // Only handle events targeted when the board is not
      // locked, and ignore events targeting the chat input.
      // Checks for selection status are performed in
      // individual handler functions.
      if (event.target.id !== "body" || this.boardLocked)
        return;

      switch (event.key) {

      case "ArrowUp": case "Up":
        this.moveTypingCursor(0, -1);
        break;

      case "ArrowDown": case "Down":
        this.moveTypingCursor(0, 1);
        break;

      case "ArrowLeft": case "Left":
        this.moveTypingCursor(-1, 0);
        break;

      case "ArrowRight": case "Right":
        this.moveTypingCursor(1, 0);
        break;

      case "Backspace":
      case "Delete": // Remove placement behind typing cursor
        this.unplaceLastTyped();
        break;

      case "Home": // Take back letters onto the rack
        this.takeBackTiles();
        break;

      case "End": // Commit to move
        this.action_commitMove();
        break;

      case "@": // Shuffle rack
        this.shuffleRack();
        break;

      case "?": // Pass
        this.action_pass();
        break;

      case "!": // Challenge / take back
        {
          const lastTurn = this.game.lastTurn();
          if (lastTurn && lastTurn.type == Turns.PLAYED) {
            if (this.isThisPlayer(this.game.whosTurnKey))
              // Challenge last move
              this.challenge(lastTurn.playerKey);
            else
              // Still us
              this.takeBackMove();
          }
        }
        break;

      case "*": // to place typing cursor in centre
        // (or first empty square, scanning rows from
        // the top left, if the centre is occupied)
        {
          const mr = Math.floor(this.game.board.rows / 2);
          const mc = Math.floor(this.game.board.cols / 2);
          let sq = this.game.board.at(mc, mr);
          if (!sq.isEmpty()) {
            this.game.board.forEachSquare(
              boardSquare => {
                if (boardSquare.isEmpty()) {
                  sq = boardSquare;
                  return true;
                }
                return false;
              });
          }
          this.selectSquare(sq);
        }
        break;

      case " ":
        this.rotateTypingCursor();
        break;

      default:
        this.manuallyPlaceLetter(event.key.toUpperCase());
        break;
      }
    }

    /**
     * Update the list of non-playing observers
     * @param {object[]} non-playing observers
     */
    updateObservers(obs) {
      if (obs.length > 0) {
        $("#scoresBlock > .observerCount")
        .show()
        .text($.i18n("+ $1 observer{{PLURAL:$1||s}}",
                     obs.length));
      } else
        $("#scoresBlock > .observerCount").hide();
    }

    /**
     * Refresh the player table
     */
    updatePlayerTable() {
      const $playerTable = this.game.$playerTable(this.player);
      $("#scoresBlock > .playerList").html($playerTable);
      $(".player-clock").toggle(this.game.timerType);
      this.updateWhosTurn();
    }

    /**
     * Show who's turn it is
     */
    updateWhosTurn() {
      $(".whosTurn").removeClass("whosTurn");
      $(`#player${this.game.whosTurnKey}`).addClass("whosTurn");
    }

    /**
     * Update the display of the number of tiles remaining in the
     * letter bag and player's racks. This includes showing the
     * swap rack, if enough tiles remain in the bag.
     */
    updateTileCounts() {
      const remains = this.game.letterBag.remainingTileCount();
      if (remains > 0) {
        const mess = $.i18n(
          "$1 tile{{PLURAL:$1||s}} left in the bag", remains);
        $("#scoresBlock > .letterbag").text(mess);
        $("#scoresBlock td.remaining-tiles").empty();
      } else {
        $("#scoresBlock > .letterbag")
        .text($.i18n("The letter bag is empty"));
        const countElements = $("#scoresBlock td.remaining-tiles");
        this.game.getPlayers().forEach(
          (player, i) =>
          $(countElements[i]).text(`(${player.rack.squaresUsed()})`));
      }
      $("#swapRack")
      .toggle(remains >= this.game.rackSize);
    }

    /**
     * Identify the logged-in user, and make sure they are playing
     * in this game.
     * @param {BrwoserGame} game the game
     * @return {Promise} a promise that resolves to the player key
     * or undefined if the player is not logged in or is not in the game
     * @private
     */
    identifyPlayer(game) {
      $(".bad-user").hide();
      return this.getSession()
      .then(session => {
        if (session) {
          // Find if they are a player
          this.player = game.getPlayerWithKey(session.key);
          if (this.player)
            return this.player.key;
          $(".bad-user")
          .show()
          .find("button")
          .on("click", () => {
            $.post("/logout")
            .then(() => window.location.reload());
          });
          this.observer = this.session.name;
        }
        $(".notPlaying").show();
        return undefined;
      });
    }

    /**
     * A game has been read; load it into the UI
     * @param {Game} game the Game being played
     * @return {Promise} Promise that resolves to a game
     */
    loadGame(game) {
      console.debug("Loading UI for", game);

      game._debug = console.debug;
      this.game = game;

      // Number of tiles placed on the board since the last turn
      this.placedCount = 0;

      // Can swap up to swapCount tiles
      this.swapRack = new Rack(
        "Swap", game.swapSize, $.i18n("SWAP"));

      this.updatePlayerTable();

      if (this.player) {
        this.player.rack.$populate($("#playRack .Surface"));
        this.swapRack.$populate($("#swapRack"));
      }

      const $board = $("#board");
      game.board.$populate($board);
      this.handle_resize();

      this.$log(true, $.i18n("Game started"), "game-state");

      game.forEachTurn(
        (turn, isLast) => this.$log(
          false, this.game.describeTurn(turn, this.player, isLast)));

      this.$log(true, ""); // Force scroll to end of log

      if (game.turnCount() > 0)
        $(".undoButton").toggle(this.getSetting("undo_redo"));

      if (game.hasEnded()) {
        if (game.nextGameKey)
          this.setAction("action_nextGame", /*i18n*/"Next game");
        else
          this.setAction("action_anotherGame", /*i18n*/"Another game?");
      }

      $(".pauseButton")
      .toggle(game.timerType);

      $(".undoButton")
      .on(
        "click", () => {
          // unplace any pending move
          this.takeBackTiles();
          this.sendCommand(Command.UNDO);
        });

      $(".redoButton")
      .hide()
      .on(
        "click", () => {
          if (this.undoStack.length > 0) {
            const turn = this.undoStack.pop();
            this.sendCommand(Command.REDO, turn);
            if (this.undoStack.length === 0)
              $(".redoButton").hide();
          }
        });

      let myGo = this.isThisPlayer(game.whosTurnKey);
      this.updateWhosTurn();
      this.lockBoard(!myGo);
      this.enableTurnButton(myGo || game.hasEnded());

      this.updateGameStatus();

      const lastTurn = game.lastTurn();
      if (lastTurn && (lastTurn.type === Turns.PLAYED
                       || lastTurn.type === Turns.CHALLENGE_LOST)) {
        if (this.isThisPlayer(lastTurn.playerKey)) {
          // It isn't our turn, but we might still have time to
          // change our minds on the last move we made
          if (game.allowTakeBack)
            this.addTakeBackPreviousButton(lastTurn);
        } else
          // It wasn't our go, enable a challenge
          this.addChallengePreviousButton(lastTurn);
      }

      if (this.player) {
        $(".shuffle-button")
        .button({
          showLabel: false,
          icon: "shuffle-icon",
          classes: {
            "ui-button-icon": "fat-icon"
          }
        })
        .on("click", () => this.shuffleRack());

        $(".unplace-button").button({
          showLabel: false,
          icon: "unplace-icon",
          classes: {
            "ui-button-icon": "fat-icon"
          }
        })
        .on("click", () => this.takeBackTiles());

        $(".turn-button")
        .on("click", () => this.click_turnButton());
      } else {
        $(".shuffle-button").hide();
        $(".turn-button").hide();
      }

      return Promise.resolve();
    }

    // @override
    readyToListen() {
      const playerKey = this.player ? this.player.key : undefined;
      // Confirm to the server that we're ready to listen
      console.debug("<-- join");
      // This will throw if there is no server on the other end
      this.socket.emit(Notify.JOIN, {
        gameKey: this.game.key,
        playerKey: playerKey
      });
      return Promise.resolve();
    }

    // @override
    attachSocketListeners() {
      super.attachSocketListeners();

      this.socket

      .on(Notify.CONNECTIONS,
          observers => this.handle_CONNECTIONS(checkSequenceNumber(observers)))

      // A turn has been taken. turn is a Turn
      .on(Notify.TURN,
          turn => this.handle_TURN(
            new Turn(this.game, checkSequenceNumber(turn))))

      // Server clock tick.
      .on(Notify.TICK,
          params => this.handle_TICK(checkSequenceNumber(params)))

      // A follow-on game is available
      .on(Notify.NEXT_GAME,
          params => this.handle_NEXT_GAME(checkSequenceNumber(params)))

      // A message has been sent
      .on(Notify.MESSAGE,
          message => this.handle_MESSAGE(checkSequenceNumber(message)))

      // Attempted play has been rejected
      .on(Notify.REJECT,
          params => this.handle_REJECT(checkSequenceNumber(params)))

      // Game has been paused
      .on(Notify.PAUSE,
          params => this.handle_PAUSE(checkSequenceNumber(params)))

      // Game has been unpaused
      .on(Notify.UNPAUSE,
          params => this.handle_UNPAUSE(checkSequenceNumber(params)))

      // An UNDO has been serviced
      .on(Notify.UNDONE,
          message => this.handle_UNDONE(checkSequenceNumber(message)))

      .on(Notify.JOIN, () => console.debug("--> join"));
    }

    handle_resize() {
      if (!this.game)
        return;
      const ww = $(window).width();
      const wh = $(window).height();
      const sz = Math.max(this.game.board.cols, this.game.board.rows);
      const landscape = ww > wh;
      const tdSize = (landscape ? wh * 0.8 : ww) / sz;
      $(".Surface td").css("width", `${tdSize}px`);
      $(".Surface td").css("height", `${tdSize}px`);
      const tileSize = tdSize * 0.85;
      $(".Tile").css("width", `${tileSize}px`);
    }

    /**
     * @override
     */
    attachHandlers() {
      const ui = this;

      // Configure chat input
      $("#chatBlock input")

      .on("change", function() {
        // Send chat
        console.debug("<-- message");
        ui.socket.emit(
          Notify.MESSAGE,
          {
            sender: ui.player ? ui.player.name : "Observer",
            text: $(this).val()
          });
        $(this).val("");
        $("body").focus();
      })

      .on("keydown", function(event) {
        // Tab and Escape both blur the input
        if (event.key === "Tab" || event.key === "Escape")
          $("body").focus();
      });

      $(".pauseButton")
      .on("click", () => this.sendCommand(Command.PAUSE));

      // Events raised by game components to request UI updates
      // See common/Types for meanings
      $(document)
      .on(UIEvents.PLACE_TILE,
          (e, square) => square.$placeTile())

      .on(UIEvents.UNPLACE_TILE,
          (e, square, tile) => square.$unplaceTile())

      .on(UIEvents.SELECT_SQUARE,
          (e, square) => this.selectSquare(square))

      .on(UIEvents.CLEAR_SELECT,
          e => this.clearSelect())

      .on(UIEvents.DROP_TILE,
          (e, source, square) => this.dropTile(source, square))

      // Keydown anywhere in the document
      .on("keydown", event => this.keyDown(event));

      $(window).on("resize", () => this.handle_resize());

      super.attachHandlers();
    }

    /**
     * Handle a letter being typed when the typing cursor is active
     * @param {string} letter character being placed
     */
    manuallyPlaceLetter(letter) {
      if (!this.selectedSquare
          || !this.selectedSquare.isEmpty()
          // Make sure the selected square is on the board!
          || !this.selectedSquare.isOnBoard)
        return;

      // check it's supported
      if (this.game.letterBag.legalLetters.indexOf(letter) < 0)
        return;

      // Find the letter in the rack
      const rackSquare = this.player.rack.findSquare(letter);
      if (rackSquare) {
        // moveTile will use a blank if the letter isn't found
        this.moveTile(rackSquare, this.selectedSquare, letter);
        if (this.getSetting("tile_click"))
          this.playAudio("tiledown");
        if ($("#typingCursor").hasClass("down"))
          this.moveTypingCursor(0, 1);
        else
          this.moveTypingCursor(1, 0);
      } else
        this.$log($.i18n("'$1' is not on the rack", letter));
    }

    /**
     * When a letter has been typed, move the cursor skipping over
     * tiles. If the edge of the board is reached, ignore the
     * move.
     * @param {number} col column deltae
     * @param {number} row row delta
     */
    moveTypingCursor(col, row) {
      if (!this.selectedSquare)
        return;
      do {
        try {
          const nusq = this.game.board.at(
            this.selectedSquare.col + col,
            this.selectedSquare.row + row);
          this.selectedSquare = nusq;
        } catch (e) {
          // off the board
          this.selectedSquare = undefined;
        }
      } while (this.selectedSquare && !this.selectedSquare.isEmpty());
      if (this.selectedSquare)
        this.selectedSquare.select(true);
    }

    /**
     * Selection is used both for click-click tile moves when dragging
     * isn't available, and for the typing cursor.
     * @param {Square} square square to select
     */
    selectSquare(square) {
      Platform.assert(square, "No square selected");
      console.debug(`select ${square.id}`);

      // Is the target square on the board and occupied by a locked tile?
      const isLocked = square.isOnBoard && square.isLocked();

      // Is the target square an empty square on a rack?
      const isRackVoid = !square.isOnBoard && square.isEmpty();

      // Is a square already selected?
      if (this.selectedSquare) {
        if (this.selectedSquare.isEmpty()) {
          if (square === this.selectedSquare) {
            // Same square selected again
            this.rotateTypingCursor();
            return;
          }
          // Selecting a different square
        }
        else {
          // The selected square has a tile on it. Is the square
          // being selected empty?

          if (square && square.isEmpty()) {
            // It's empty, so this is a move
            this.selectedSquare.select(false);
            this.moveTile(this.selectedSquare, square);
            this.selectedSquare = undefined;
            return;
          }

          if (isLocked)
            // Target occupied and locked, can't move and can't select,
            // so ignore, keeping the old selection.
            return;

          // Selecting a different square
        }
        // Switch off the selection on the old square
        this.selectedSquare.select(false);
        this.selectedSquare = undefined;
      }

      // No pre-selection, or prior selection cancelled.

      if (isLocked || isRackVoid)
          // Only unlocked & empty squares on the board
          return;

      this.selectedSquare = square;
      square.select(true);
    }

    clearSelect() {
      if (this.selectedSquare) {
        this.selectedSquare.select(false);
        this.selectedSquare = undefined;
      }
    }

    /**
     * Swap the typing cursor between across and down
     */
    rotateTypingCursor() {
      const $tc = $("#typingCursor");
      if ($tc.hasClass("down"))
        $tc.removeClass("down");
      else
        $tc.addClass("down");
    }

    /**
     *  If the typing cursor is active, move back in the direction
     * it is set to an unplace the next unlocked tile encountered
     */
    unplaceLastTyped() {
      if (!this.selectedSquare || $("#typingCursor").is(":hidden"))
        return;
      let row = 0, col = 0;
      if ($("#typingCursor").hasClass("down"))
        row = -1;
      else
        col = -1;

      let sq = this.selectedSquare;
      do {
        try {
          sq = this.game.board.at(sq.col + col, sq.row + row);
        } catch (e) {
          // off the board
          sq = undefined;
        }
      } while (sq && sq.isLocked());
      if (sq && !sq.isEmpty()) {
        // Unplace the tile, returning it to the rack
        this.takeBackTile(sq);
        this.selectSquare(sq);
      }
    }

    /**
     * Handler for 'DropTile' event, invoked when a tile has
     * been dropped on a square.
     * @param {Square} fromSquare the square the tile is coming from
     * @param {Square} toSquare the square the tile is moving to
     */
    dropTile(fromSquare, toSquare) {
      if (fromSquare.tile) {
        this.clearSelect();
        this.moveTile(fromSquare, toSquare);
        if (this.getSetting("tile_click"))
          this.playAudio("tiledown");
      }
    }

    /**
     * Promise to prompt for a letter for a blank
     * @return {Promise} Promise that resolves to the chosen letter
     */
    promptForLetter() {
      return new Promise(resolve => {
        const $dlg = $("#blankDialog");
        const $tab = $("#blankDialog .letterTable");
        $tab.empty();
        const ll = this.game.letterBag.legalLetters.slice().sort();
        const dim = Math.ceil(Math.sqrt(ll.length));
        let rowlength = dim;
        let $row = null;
        while (ll.length > 0) {
          const letter = ll.shift();
          if (rowlength == dim) {
            if ($row)
              $tab.append($row);
            $row = $("<tr></tr>");
            rowlength = 0;
          }
          const $td = $(`<td>${letter}</td>`);
          $td.on("click", () => {
            $dlg.dialog("close");
            resolve(letter);
          });
          $row.append($td);
          rowlength++;
        }
        if ($row)
          $tab.append($row);

        $dlg.dialog({
          dialogClass: "no-title",
          modal: true,
          closeOnEscape: false,
          closeText: "hide"
        });
      });
    }

    /**
     * Move a tile from one surface to another e.g. from the
     * rack to the board
     * @param {Square} fromSquare the square the tile is coming from
     * @param {Square} toSquare the square the tile is moving to
     * @param {string} ifBlank (optional) if the tile is blank and we are
     * moving it to the board, then assign it this letter. Otherwise
     * a dialog will prompt for the letter.
     */
    moveTile(fromSquare, toSquare, ifBlank) {

      const tile = fromSquare.tile;

      if (fromSquare.isOnBoard) {
        if (this.boardLocked)
          return; // can't move from board
        if (!(toSquare.isOnBoard))
          this.placedCount--;
      } else if (toSquare.isOnBoard) {
        if (this.boardLocked)
          return; // can't move to board
        this.placedCount++;
      }

      fromSquare.unplaceTile();
      if (tile.isBlank) {
        if (!toSquare.isOnBoard) {
          tile.reset();
        } else if (ifBlank) {
          tile.letter = ifBlank;
        } else if (tile.letter === " ") {
          this.promptForLetter()
          .then(letter => {
            tile.letter = letter;
            tile.$ui(); // Force a refresh of the tile
          });
        }
      }
      toSquare.placeTile(tile);

      window.setTimeout(() => this.updateGameStatus(), 500);
    }

    /**
     * Update the UI to reflect the status of the game. This handles
     * board locking and display of the turn button. It doesn't
     * affect buttons embedded in the log.
     */
    updateGameStatus() {
      $("#playBlock > .your-move").empty();
      this.updateTileCounts();

      if (this.game.hasEnded()) {
        // moveAction will be one of confirmGameOver, anotherGame
        // or nextGame, so don't hide the turn button
        this.lockBoard(true);
        return;
      }

      // If this player is not the current player, their only
      // allowable is a challenge, which is handled using a button
      // in the log, so we can hide the turn button
      if (!this.isThisPlayer(this.game.whosTurnKey)) {
        $(".turn-button").hide();
        return;
      }

      // If the last player's rack is empty, it couldn't be refilled
      // and the game might be over.
      const lastPlayer = this.game.previousPlayer();
      if (lastPlayer && lastPlayer.rack.isEmpty()) {
        this.lockBoard(true);
        if (this.player.key === this.game.whosTurnKey)
          this.setAction("action_confirmGameOver",
                         /*i18n*/"Accept last move");
        else
          $(".turn-button").hide();
        return;
      }

      if (this.placedCount > 0) {
        // Player has dropped some tiles on the board
        // move action is to make the move
        this.setAction("action_commitMove", /*i18n*/"Finished Turn");
        // Check that the play is legal
        const move = this.game.board.analysePlay();
        const $move = $("#playBlock > .your-move");
        if (typeof move === "string") {
          // Play is bad
          $move.append($.i18n(move));
          this.enableTurnButton(false);
        } else {
          // Play is legal, calculate bonus if any
          const bonus =
                this.game.calculateBonus(move.placements.length);
          move.score += bonus;
          $move.append(move.$score(!this.game.predictScore));
          this.enableTurnButton(true);
        }

        // Use 'visibility' and not 'display' to keep the layout stable
        $(".unplace-button").css("visibility", "inherit");
        $("#swapRack").hide();
        return;
      }

      if (this.swapRack.squaresUsed() > 0) {
        // Swaprack has tiles on it, change the move action to swap
        this.setAction("action_swap", /*i18n*/"Swap");
        $("#board .ui-droppable").droppable("disable");
        this.enableTurnButton(true);
        $(".unplace-button").css("visibility", "inherit");
        return;
      }

      // Otherwise nothing has been placed, turn action is a pass
      this.setAction("action_pass", /*i18n*/"Pass");
      $("#board .ui-droppable").droppable("enable");
      this.enableTurnButton(true);
      $(".unplace-button").css("visibility", "hidden");
    }

    /**
     * Set board locked status. The board is locked when it's
     * not this player's turn.
     * @param {boolean} newVal new setting of "locked"
     */
    lockBoard(newVal) {
      this.boardLocked = newVal;
    }

    /**
     * Enable/disable the turn button
     * @param {boolean} enable true to enable, disable otherwise
     */
    enableTurnButton(enable) {
      $(".turn-button").button(enable ? "enable" : "disable");
    }

    /**
     * Add a 'Challenge' button to the log pane to challenge the last
     * player's move (if it wasn't us)
     * @param {Turn} turn the current turn
     */
    addChallengePreviousButton(turn) {
      if (!this.player)
        return;
      const player = this.game.getPlayerWithKey(turn.playerKey);
      if (!player)
        return;
      const text = $.i18n(
        "Challenge $1's turn", player.name);
      const $button =
            $(`<button name="challenge">${text}</button>`)
            .addClass("moveAction")
            .button()
            .on("click", () => this.challenge(player.key));
      this.$log(true, $button, "turn-control");
    }

    /**
     * Add a 'Take back' button to the log pane to take back
     * (this player's) previous move, if the game allows it.
     * @param {Turn} turn the current turn
     */
    addTakeBackPreviousButton(turn) {
      const $button =
            $(`<button name="takeBack" class="moveAction"></button>`)
            .text($.i18n("Take back"))
            .button()
            .on("click", () => this.takeBackMove());
      this.$log(true, $button, "turn-control");
    }

    /**
     * Remove any action buttons from the log pane.
     */
    removeMoveActionButtons() {
      $("button.moveAction").remove();
    }

    /**
     * Issue a challenge against the given player.
     * @param {string} challengedKey key of the player being challenged
     */
    challenge(challengedKey) {
      this.takeBackTiles();
      this.sendCommand(Command.CHALLENGE, {
        challengedKey: challengedKey
      });
    }

    /**
     * Handler for the 'Make Move' button. Invoked via 'click_turnButton'.
     * Response will be turn type Turns.PLAYED (or Turns.TOOK_BACK if the play
     * is rejected).
     */
    action_commitMove() {
      $(".hint-placement").removeClass("hint-placement");

      const move = this.game.board.analysePlay();
      if (typeof move === "string") {
        // fatal - should never get here
        UI.report(move);
        return;
      }
      const bonus = this.game.calculateBonus(move.placements.length);
      move.score += bonus;
      if (bonus > 0 && this.getSetting("cheers"))
        this.playAudio("bonusCheer");

      this.sendCommand(Command.PLAY, move);
    }

    /**
     * Handler for the 'Take back' button clicked. Invoked via
     * 'click_turnButton'. Response will be a turn type Turns.TOOK_BACK.
     */
    takeBackMove() {
      this.takeBackTiles();
      this.sendCommand(Command.TAKE_BACK);
    }

    /**
     * Handler for the 'Pass' button clicked. Invoked via 'click_turnButton'.
     */
    action_pass() {
      this.takeBackTiles();
      this.sendCommand(Command.PASS);
    }

    /**
     * Handler for the 'Confirm move' button clicked. Invoked
     *  via 'click_turnButton'. The response may contain a score adjustment.
     */
    action_confirmGameOver() {
      this.takeBackTiles();
      this.sendCommand(Command.CONFIRM_GAME_OVER);
    }

    /**
     * Handler for the 'Another game?" button.
     * Invoked via click_turnButton.
     */
    action_anotherGame() {
      $.post(`/anotherGame/${this.game.key}`)
      .then(nextGameKey => {
        this.game.nextGameKey = nextGameKey;
        this.setAction("action_nextGame", /*i18n*/"Next game");
        this.enableTurnButton(true);
      })
      .catch(console.error);
    }

    /**
     * Handler for the 'Next game" button. Invoked via click_turnButton.
     */
    action_nextGame() {
      const key = this.game.nextGameKey;
      $.post(`/join/${key}`)
      .then(info => {
        location.replace(
          `/html/game.html?game=${key}&player=${this.player.key}`);
      })
      .catch(console.error);
    }

    /**
     * Handler for the 'Swap' button clicked. Invoked via 'click_turnButton'.
     */
    action_swap() {
      const tiles = this.swapRack.empty();
      // Move the swapRack tiles back to the playRack until the play
      // is confirmed
      this.player.rack.addTiles(tiles);
      this.sendCommand(Command.SWAP, tiles);
    }

    /**
     * Set the action when the turn button is pressed.
     * @param {string} action function name e.g. action_commitMove
     * @param {string} title button title e.g. "Commit Move"
     * @private
     */
    setAction(action, title) {
      console.debug("setAction", action);
      if (this.player) {
        $(".turn-button")
        .data("action", action)
        .empty()
        .append($.i18n(title))
        .show();
      }
    }

    /**
     * Handler for a click on the 'Make Move' button. This button
     * may be associated with different actions depending on the
     * state, through the 'data-action' attribute.
     *
     * * 'commitMove' will send the current tile placements to the server
     * * 'swap' will sawp the tiles currently on the swap rack
     * * 'pass' will pass the current move (set when no tiles are placed)
     *
     * This action will map to the matching function in 'this'.
     */
    click_turnButton() {
      const action = $(".turn-button").data("action");
      console.debug("click_turnButton =>", action);
      this[action]();
    }

    /**
     * Handler for a click on the 'Take Back' button, to pull
     * back tiles from the board and swap rack
     * @param {boolean} noswap true to not take tiles back from
     * the swap rack.
     */
    takeBackTiles(noswap) {
      this.game.board.forEachSquare(
        boardSquare => {
          if (this.takeBackTile(boardSquare))
            this.placedCount--;
          return false;
        });
      if (!noswap)
        this.swapRack.forEachSquare(
          swapSquare => {
            this.takeBackTile(swapSquare);
            return false;
          });
      this.updateGameStatus();
    }

    /**
     * Take back a single tile from the given square.
     * @param {Square} square the square with the tile being taken back
     * @return {boolean} true if a tile was returned
     */
    takeBackTile(square) {
      if (square.isLocked())
        return false;

      const tile = square.unplaceTile();
      if (tile) {
        const rackSquare = this.player.rack.addTile(tile);
        return true;
      }
      return false;
    }

    /**
     * Handler for click on the 'Shuffle' button
     */
    shuffleRack() {
      this.player.rack.shuffle();
    }

    /**
     * Handler for click on the 'Undo' button
     */
    undo() {
      this.sendComand(Command.UNDO);
    }

    /**
     * Handler for click on the 'redo' button
     */
    redo() {
    }
  }

  requirejs(["touch-punch"], () => new GameUI().create());
});
