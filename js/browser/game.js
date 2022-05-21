/*Copyright (C) 2019-2022 The Xanado Project https://github.com/cdot/Xanado
License MIT. See README.md at the root of this distribution for full copyright
and license information*/
/* eslint-env browser, jquery */

define("browser/game", [
	"common/Fridge", "common/Utils",
	"game/Tile", "game/Rack", "game/Board",
	"game/Game", "game/Player", "game/Turn",
	"game/Command", "game/Notify",
	"browser/UI", "browser/Dialog",
	"jquery", "jqueryui", "cookie", "browser/icon_button"
], (
	Fridge, Utils,
	Tile, Rack, Board,
	Game, Player, Turn,
	Command, Notify,
	UI, Dialog
) => {

	/**
	 * Format a move score summary.
	 * @param turn {Move|Turn} the turn or move being scored.
	 * @param {boolean} hideScore true to elide the score
	 * @private
	 */
	function formatScore(turn, hideScore) {
		let sum = 0;
		const $span = $("<span></span>");
		for (let word of turn.words) {
			$span
			.append(` <span class="word">${word.word}</span>`);
			if (!hideScore) {
				$span
				.append(` (<span class="word-score">${word.score}</span>)`);
			}
			sum += word.score;
		}
		// .score will always be a number after a move
		if (!hideScore && turn.words.length > 1 || turn.score > sum) {
			$span
			.append(" ")
			.append($.i18n("total $1", turn.score));
		}
		return $span;
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
	function addToLog(interactive, mess, css) {
		const $div = $("<div></div>").addClass("logEntry");
		if (css)
			$div.addClass(css);
		$div.append(mess);
		const $lm = $("#logMessages");
		$lm.append($div);
		if (interactive)
			$lm.animate({
				scrollTop: $("#logMessages").prop("scrollHeight")
			}, 300);
		return $div;
	}


	/**
	 * User interface to a game in a browser. The Ui reflects the game state as
	 * communicated from the server, through the exchange of various messages.
	 */
	class GameUI extends UI {

		constructor() {
			super();

			/**
			 * Currently selected Square
			 * @member {Square}
			 */
			this.selectedSquare = null;

			/**
			 * Quick reference to typing cursor DOM object
			 * lateinit in loadGame
			 * @member {jQuery}
			 */
			this.$typingCursor = null;
			
			/**
			 * Typing is across if true, down if false
			 * @member {boolean}
			 */
			this.typeAcross = true;

			/**
			 * lateinit in loadGame
			 * @member {Player}
			 */
			this.player = undefined;

			/**
			 * Board lock status, private
			 * @member {boolean}
			 */
			this.boardLocked = false;
		}

		// @Override
		decorate() {
			let m = document.URL.match(/[?;&]game=([^;&]+)/);
			if (!m) {
				const mess = `no game in ${document.URL}`;
				console.error(mess);
				throw new Error(mess);
			}
			const gameKey = m[1];

			this.attachHandlers();

			console.debug(`GET /game/${gameKey}`);
			return $.get(`/game/${gameKey}`)
			.then(frozen => {
				console.debug(`--> Game ${gameKey}`);
				return Fridge.thaw(frozen, Game.classes);
			})
			.then(game => {
				return this.identifyPlayer(game)
				.then (playerKey => this.loadGame(game));
			})
			.then(() => super.decorate())
			.catch(UI.report);
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
		 * Send a game command to the server. Game commands are listed in the {@link Command} type
		 * @param {string} command command name
		 * @param {object} args arguments for the request body
		 */
		sendCommand(command, args) {
			console.debug(`POST /command/${command}`);
			this.lockBoard(true);
			this.enableTurnButton(false);
			this.cancelNotification();
			$.ajax({
				url: `/command/${command}/${this.game.key}`,
				type: "POST",
				contentType: "application/json",
				data: JSON.stringify(args)
			})
			.then(r => console.debug(`${command} OK`, r))
			.catch(console.error);
		}

		/**
		 * Append information on a turn to the log. This is used both on
		 * receipt of a Turn through the socket, and when replaying a game
		 * history.
		 * @param {Turn} turn a Turn
		 * @param {boolean} isLatestTurn set true if this is the most
		 * recent turn
		 * @param {boolean} interactive true if this is the latest
		 * turn during a game (as against a step in a replay)
		 */
		describeTurn(turn, isLatestTurn, interactive) {
			if (turn.type === Turn.GAME_OVER) {
				this.describeGameOver(turn, interactive);
				return;
			}

			// Who's turn was it?
			let player = this.game.getPlayer(turn.playerKey);
			if (!player)
				player = new Player({name: "Unknown player"});
			const challenger = (typeof turn.challengerKey === "string")
				  ? this.game.getPlayer(turn.challengerKey) : undefined;

			let what, who;
			if (turn.type === Turn.CHALLENGE_LOST) {
				what = $.i18n("challenge");
				if (challenger === this.player)
					who = $.i18n("Your");
				else
					who = $.i18n("$1's", challenger.name);
			} else {
				what = $.i18n("turn");
				if (player === this.player)
					who = $.i18n("Your");
				else
					who = $.i18n("$1's", player.name);
			}
			addToLog(interactive, $.i18n(
				"<span class='player-name'>$1</span> $2", who, what),
					 "turn-player");

			// What did they do?
			let turnText;

			let playerPossessive;
			let playerIndicative;
			if (this.player === player) {
				playerPossessive = $.i18n("Your");
				playerIndicative = $.i18n("You");
			} else {
				playerPossessive = $.i18n("$1's", player.name);
				playerIndicative = player.name;
			}

			let challengerPossessive;
			let challengerIndicative;
			if (this.player === challenger) {
				challengerPossessive = $.i18n("Your");
				challengerIndicative = $.i18n("You");
			} else if (challenger) {
				challengerPossessive = $.i18n("$1's", challenger.name);
				challengerIndicative = challenger.name;
			}

			switch (turn.type) {

			case Turn.PLAY:
				turnText = formatScore(turn, false);
				break;

			case Turn.SWAP:
				turnText = $.i18n(
					"Swapped $1 tile{{PLURAL:$1||s}}",
					turn.replacements.length);
				break;

			case Turn.TIMEOUT:
				turnText = $.i18n("Timed out");
				break;

			case Turn.PASSED:
				turnText = $.i18n("Passed");
				break;

			case Turn.TOOK_BACK:
				turnText = $.i18n("Took back their turn");
				break;

			case Turn.CHALLENGE_WON:
				turnText = $.i18n(
					"$1 successfully challenged $2 play",
					challengerIndicative, playerPossessive);
				break;

			case Turn.CHALLENGE_LOST:
				turnText = $.i18n(
					"$1 challenge of $2 play failed.",
					challengerPossessive, playerPossessive);
				switch (this.game.penaltyType) {
				case Game.PENALTY_PER_WORD:
				case Game.PENALTY_PER_TURN:
					turnText += " " + $.i18n(
						"$1 lost $2 points",
						challengerIndicative, -turn.score);
					break;
				case Game.PENALTY_MISS:
					turnText += " "
					+ $.i18n("$1 will miss a turn", challengerIndicative);
					break;
				}
				break;

			default:
				// Terminal, no point in translating
				throw Error(`Unknown move type ${turn.type}`);
			}

			addToLog(interactive, turnText, "turn-detail");

			if (isLatestTurn
				&& turn.emptyPlayerKey
				&& !this.game.hasEnded()
				&& turn.type !== Turn.CHALLENGE_LOST
				&& turn.type !== Turn.GAME_OVER) {
				if (this.isThisPlayer(turn.emptyPlayerKey)) {
					addToLog(interactive, $.i18n(
						"You have no more tiles, game will be over if your play isn't challenged"),
						"turn-narrative");
				} else
					addToLog(interactive, $.i18n(
						"$1 has no more tiles, game will be over unless you challenge",
						this.game.getPlayer(turn.emptyPlayerKey).name),
							 "turn-narrative");
			}
		}

		/**
		 * Append a formatted 'end of game' message to the log
		 * @param {Turn} turn a Turn.GAME_OVER Turn
		 * @param {boolean} interactive false if we are replaying messages into
		 * the log, true if this is an interactive response to a player action.
		 * @private
		 */
		describeGameOver(turn, interactive) {
			const game = this.game;
			const adjustments = [];
			const winningScore = game.winningScore();
			const winners = [];
			let iWon = false;

			// When the game ends, each player's score is reduced by
			// the sum of their unplayed letters. If a player has used
			// all of his or her letters, the sum of the other players'
			// unplayed letters is added to that player's score. The
			// score adjustments are already done, on the server side,
			// we just need to present the results.
			const unplayed = game.players.reduce(
				(sum, player) => sum + player.rack.score(), 0);
			addToLog(interactive, $.i18n(turn.endState || Game.STATE_GAME_OVER),
					 "game-state");
			const $narrative = $("<div></div>").addClass("game-outcome");
			game.players.forEach(player => {
				const isMe = this.isThisPlayer(player.key);
				const name = isMe ? $.i18n("You") : player.name;
				const $rackAdjust = $("<div></div>").addClass("rack-adjust");

				if (player.score === winningScore) {
					if (isMe) {
						iWon = true;
						if (interactive && this.getSetting("cheers"))
							this.playAudio("endCheer");
					}
					winners.push(name);
				} else if (isMe && interactive && this.getSetting("cheers"))
					this.playAudio("lost");

				if (player.rack.isEmpty()) {
					if (unplayed > 0) {
						$rackAdjust.text($.i18n(
							"$1 gained $2 point{{PLURAL:$2||s}} from the racks of other players",
										 name, unplayed));
					}
				} else if (player.rack.score() > 0) {
					// Lost sum of unplayed letters
					$rackAdjust.text($.i18n(
						"$1 lost $2 point{{PLURAL:$2||s}} for a rack containing '$3'",
						name, player.rack.score(),
						player.rack.lettersLeft().join(",")));
				}
				player.$refresh();
				$narrative.append($rackAdjust);

				const timePenalty = turn.score[player.key].time;
				if (typeof timePenalty === "number" && timePenalty !== 0) {
					const $timeAdjust = $("<div></div>").addClass("time-adjust");
					$timeAdjust.text($.i18n(
						"$1 lost $2 point{{PLURAL:$2||s}} to the clock",
						name, Math.abs(timePenalty)));
					$narrative.append($timeAdjust);
				}
			});

			let who;
			if (winners.length == 0)
				who = "";
			else if (winners.length == 1)
				who = winners[0];
			else
				who = $.i18n("$1 and $2",
							 winners.slice(0, winners.length - 1).join(", "),
							 winners[winners.length - 1]);

			let nWinners = 0;
			if (iWon && winners.length === 1)
				who = $.i18n("You");
			else
				nWinners = winners.length;
			addToLog(interactive, $.i18n("$1 {{PLURAL:$2|has|have}} won",
										 who, nWinners));
			addToLog(interactive, $narrative);
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
		handle_message(message) {
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

			addToLog(true, $mess);

			// Special handling for Hint, highlight square
			if (message.sender === "Advisor"
				&& args[0] === "Hint") {
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
		handle_tick(params) {
			// console.debug("--> tick");
			if (params.gameKey !== this.game.key)
				console.error(`key mismatch ${this.game.key}`);

			const ticked = this.game.getPlayer(params.playerKey);
			let remains = params.clock;
			ticked.clock = remains;

			const clocks = Utils.formatTimeInterval(remains);
			if (this.game.timerType === Player.TIMER_TURN) {
				$(`.player-clock`)
				.empty()
				.removeClass("tick-alert-low tick-alert-medium tick-alert-high");
				if (remains <= 0)
					return;
			}

			if (ticked === this.player
				&& this.game.timerType === Player.TIMER_TURN
				&& remains <= 10
				&& this.getSetting("warnings"))
				this.playAudio("tick");

			const $to = $(`#player${ticked.key} .player-clock`);
			if (remains < this.game.timeLimit / 6) {
				$to.addClass("tick-alert-high");
			} else if (remains < this.game.timeLimit / 3)
				$to.addClass("tick-alert-medium");
			else if (remains < this.game.timeLimit / 2)
				$to.addClass("tick-alert-low");
			$to.text(clocks);
		}

		/**
		 * Handle nextGame event. This tells the UI that a follow-on
		 * game is available.
		 * @param {object} info event info
		 * @param {string} info.gameKey key for next game
		 */
		handle_nextGame(info) {
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
		handle_reject(rejection) {
			console.debug("--> reject", rejection);
			// The tiles are only locked down when a corresponding
			// turn is received, so all we need to do is restore the
			// pre-sendCommand state and issues a message.
			this.lockBoard(false);
			this.enableTurnButton(true);
			if (this.getSetting("warnings"))
				this.playAudio("oops");
			addToLog(true, $.i18n(
				"The word{{PLURAL:$1||s}} $2 {{PLURAL:$1|was|were}} not found in the dictionary",
				rejection.words.length,
				rejection.words.join(", ")), "turn-narrative");
		}

		/**
		 * Handle a keydown. These are captured in the root of the UI and dispatched here.
		 */
		handleKeydown(event) {
			// Only handle events targeted when the board is not
			// locked, and ignore events targeting the chatInput.
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

			case "!": // Challenge
				{
					const lastTurn = this.game.lastTurn();
					if (lastTurn && lastTurn.type == Turn.PLAY) {
						if (this.isThisPlayer(this.game.whosTurnKey))
							// Challenge last move
							this.challenge();
						else
							// Still us
							this.takeBackMove();
					}
				}
				break;

			case "2": case '"': // and type until return
				break;

			case "8": case "*": // to place typing cursor in centre
				// (or first empty square, starting at top left)
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

		updatePlayerTable() {
			const $playerTable = this.game.$ui(this.player);
			$("#playerList").html($playerTable);
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
				$("#letterbag").text(mess);
				$("#scoresBlock td.remaining-tiles").empty();
			} else {
				$("#letterbag").text($.i18n("The letter bag is empty"));
				const countElements = $("#scoresBlock td.remaining-tiles");
				this.game.players.forEach(
					(player, i) =>
					$(countElements[i]).text(`(${player.rack.squaresUsed()})`));
			}
			$("#swapRack")
			.toggle(remains >= this.game.board.rackCount);
		}

		/**
		 * Identify the logged-in user, and make sure they are playing
		 * in this game.
		 * @param {Game} game the game
		 * @return {Promise} a promise that resolves to the player key
		 * or undefined if the player is not logged in or is not in the game
		 */
		identifyPlayer(game) {
			$(".bad-user").hide();
			return this.getSession()
			.then(session => {
				if (session) {
					// Find if they are a player
					this.player = game.players.find(
						p => p.key === session.key);
					if (this.player)
						return this.player.key;
					$("#bad-user>span")
					.text($.i18n(
						"You ($1) are not playing in this game",
						this.session.name));
					$("#bad-user")
					.show()
					.find("button")
					.on("click", () => {
						$.post("/logout")
						.then(() => location.replace(location));
					});
				}
				return undefined;
			});
		}

		/**
		 * A game has been read; load it into the UI
		 * @param {Game} game the Game being played
		 * @return {Promise} Promise that resolves to a game
		 */
		loadGame(game) {
			console.debug("Loading UI for", game.toString());

			this.game = game;

			// Number of tiles placed on the board since the last turn
			this.placedCount = 0;

			// Can swap up to swapCount tiles
			this.swapRack = new Rack(
				"Swap", game.board.swapCount, $.i18n("SWAP"));

			this.updatePlayerTable();

			if (this.player) {
				$("#rackControls").prepend(this.player.rack.$ui());

				$("#swapRack")
				.append(this.swapRack.$ui("SWAP"));

				this.swapRack.$refresh();
			}

			const $board = game.board.$ui();
			$("#board").append($board);

			addToLog(true, $.i18n("Game started"), "game-state");

			game.turns.forEach(
				(turn, i) => this.describeTurn(
					turn, i === game.turns.length - 1), false);
			addToLog(true, ""); // Force scroll to end of log

			if (game.hasEnded()) {
				if (game.nextGameKey)
					this.setAction("action_nextGame", /*i18n*/"Next game");
				else
					this.setAction("action_anotherGame", /*i18n*/"Another game?");
			}

			$("#pauseButton").toggle(game.timeLimit > 0);

			let myGo = this.isThisPlayer(game.whosTurnKey);
			this.updateWhosTurn();
			this.lockBoard(!myGo);
			this.enableTurnButton(myGo || game.hasEnded());

			this.updateGameStatus();

			const lastTurn = game.lastTurn();
			if (lastTurn && (lastTurn.type === Turn.PLAY
							 || lastTurn.type === Turn.CHALLENGE_LOST)) {
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
				$("#shuffleButton")
				.button({
					showLabel: false,
					icon: "shuffle-icon",
					title: $.i18n("Shuffle"),
					classes: {
						"ui-button-icon": "fat-icon"
					}
				})
				.on("click", () => this.shuffleRack());
			
				$("#takeBackButton").button({
					showLabel: false,
					icon: "take-back-icon",
					title: $.i18n("Take back"),
					classes: {
						"ui-button-icon": "fat-icon"
					}				
				})
				.on("click", () => this.takeBackTiles());

				$("#turnButton")
				.on("click", () => this.click_turnButton());
			} else {
				$("#shuffleButton").hide();
				$("#turnButton").hide();
			}
			
			this.$typingCursor = $("#typingCursor");
			this.$typingCursor.hide(0);

			this.refresh();

			return Promise.resolve();
		}

		// @Override
		connectToServer() {
			const playerKey = this.player ? this.player.key : undefined;
			// Confirm to the server that we're ready to play
			console.debug("<-- join");
			this.socket.emit(Notify.JOIN, {
				gameKey: this.game.key,
				playerKey: playerKey
			});
			return Promise.resolve();
		}

		// @Override
		attachSocketListeners(socket) {
			socket

			// socket.io events 'new_namespace', 'disconnecting',
			// 'initial_headers', 'headers', 'connection_error' are not handled

			// Custom messages

			.on(Notify.CONNECTIONS, players => {
				// Update list of active connections. 'players' is a list of
				// Player.simple
				console.debug("--> connections");
				this.game.updatePlayerList(players);
				this.updatePlayerTable();
				let myGo = this.isThisPlayer(this.game.whosTurnKey);
				this.lockBoard(!myGo);
			})

			// A turn has been taken. turn is a Turn
			.on(Notify.TURN, turn => this.handle_turn(turn))

			// Server clock tick.
			.on(Notify.TICK, params => this.handle_tick(params))

			// A follow-on game is available
			.on(Notify.NEXT_GAME,	params => this.handle_nextGame(params))

			// A message has been sent
			.on(Notify.MESSAGE, message => this.handle_message(message))

			// Attempted play has been rejected
			.on(Notify.REJECT, params => this.handle_reject(params))

			// Game has been paused
			.on(Notify.PAUSE, params => this.handle_pause(params))

			// Game has been unpaused
			.on(Notify.UNPAUSE, params => this.handle_unpause(params))

			.on(Notify.JOIN, () => console.debug("--> join"));
		}

		/**
		 * Handle a pause event.
		 * By using a modal dialog to report the pause, we block further
		 * interaction until the pause is released.
		 * @param {object} params Parameters
		 * @param {string} params.key game key
		 * @param {string} params.name name of player who paused/released
		 */
		handle_pause(params) {
			console.debug(`--> pause ${params.name}`);
			if (params.key !== this.game.key)
				console.error(`key mismatch ${this.game.key}`);
			$(".Surface .letter").addClass("hidden");
			$(".Surface .score").addClass("hidden");
			$("#pauseBanner")
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
		handle_unpause(params) {
			console.debug(`--> unpause ${params.name}`);
			if (params.key !== this.game.key)
				console.error(`key mismatch ${this.game.key}`);
			$(".Surface .letter").removeClass("hidden");
			$(".Surface .score").removeClass("hidden");
			$("#pauseDialog")
			.dialog("close");
		}

		/**
		 * Attach listeners for jquery and game events
		 */
		attachHandlers() {
			const ui = this;

			// Configure chat input
			$("#chatInput input")
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

			// clock button
			$("#pauseButton")
			.on("click", () => this.sendCommand(Command.PAUSE));

			// Events raised by game components
			$(document)
			.on("SquareChanged",
				(e, square) => square.$refresh())

			.on("SelectSquare",
				(e, square) => this.selectSquare(square))

			.on("DropSquare",
				(e, source, square) => this.dropSquare(source, square))

			// Keydown anywhere in the document
			.on("keydown", event => this.handleKeydown(event));
		}

		/**
		 * Handle a letter being typed when the typing cursor is active
		 * @param {string} letter character being placed
		 */
		manuallyPlaceLetter(letter) {
			if (!this.selectedSquare
				|| !this.selectedSquare.isEmpty()
				// Make sure the selected square is on the board!
				|| !(this.selectedSquare.owner instanceof Board))
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
				if (this.typeAcross)
					this.moveTypingCursor(1, 0);
				else
					this.moveTypingCursor(0, 1);
			} else
				addToLog($.i18n("'$1' is not on the rack", letter));
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
				this.selectedSquare.setSelected(true);
			this.updateTypingCursor();
		}

		/**
		 * Square selection is used for click-click moves when dragging
		 * isn't available
		 * @param {Square?} square square to select, or null to clear the
		 * selection
		 */
		selectSquare(square) {
			if (square)
				console.debug(`select ${square.id}`);

			if (this.selectedSquare) {
				// Is a square already selected?
				if (!this.selectedSquare.isEmpty()) {
					// The the destination available for a move?
					if (square && square.isEmpty() && square !== this.selectedSquare) {
						this.moveTile(this.selectedSquare, square);
					}
				} else if (square === this.selectedSquare) {
					this.rotateTypingCursor();
				}
				this.selectedSquare.setSelected(false);
			}
			this.selectedSquare = undefined;
			if (square
				// Only select empty squares on the board
				&& (!square.isEmpty() || square.owner instanceof Board)) {
				this.selectedSquare = square;
				this.selectedSquare.setSelected(true);
			}
			this.updateTypingCursor();
		}

		/**
		 * Swap the typing cursor between across and down
		 */
		rotateTypingCursor() {
			if (this.typeAcross) {
				this.$typingCursor.html("&#8659;"); // Down arrow
				this.typeAcross = false;
			} else {
				this.$typingCursor.html("&#8658;"); // Right arrow
				this.typeAcross = true;
			}
		}

		/**
		 *  Update the typing cursor DOM to sit over the selectedSquare
		 */
		updateTypingCursor() {
			if (this.selectedSquare && this.selectedSquare.isEmpty()) {
				const $dom = $(`#${this.selectedSquare.id}`);
				$dom.prepend(this.$typingCursor);
				this.$typingCursor.show();
			} else
				this.$typingCursor.hide();
		}

		/**
		 *  If the typing cursor is active, move back in the direction
		 * it is set to an unplace the next unlocked tile encountered
		 */
		unplaceLastTyped() {
			if (!this.selectedSquare || this.$typingCursor.is(":hidden"))
				return;
			let row = 0, col = 0;
			if (this.typeAcross)
				col = -1;
			else
				row = -1;
			let sq = this.selectedSquare;
			do {
				try {
					sq = this.game.board.at(sq.col + col, sq.row + row);
				} catch (e) {
					// off the board
					sq = undefined;
				}
			} while (sq && sq.tileLocked);
			if (sq && sq.tile) {
				// Unplace the tile, returning it to the rack
				this.takeBackTile(sq);
				this.selectSquare(sq);
				this.updateTypingCursor();
			}
		}

		/**
		 * Handler for 'DropSquare' event, invoked when a draggable has
		 * been dropped on a square.
		 * @param {Square} fromSquare the square the tile is coming from
		 * @param {Square} toSquare the square the tile is moving to
		 */
		dropSquare(fromSource, toSquare) {
			if (fromSource.tile) {
				this.moveTile(fromSource, toSquare);
				this.selectSquare(null);
				if (this.getSetting("tile_click"))
					this.playAudio("tiledown");
			}
		}

		/**
		 * Redraw the interface
		 */
		refresh() {
			if (this.player)
				this.player.rack.$refresh();
			this.game.board.$refresh();
			if (this.game.pausedBy)
				this.pause(this.game.pausedBy, true);
		}

		/**
		 * Promise to prompt for a letter for a blank
		 * @return {Promise} Promise that resolves to the chosen letter
		 */
		promptForLetter() {
			return new Promise(resolve => {
				const $dlg = $("#blankDialog");
				const $tab = $("#blankLetterTable");
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

			if (fromSquare.owner instanceof Board) {
				if (this.boardLocked)
					return; // can't move from board
				if (!(toSquare.owner instanceof Board))
					this.placedCount--;
			} else if (toSquare.owner instanceof Board) {
				if (this.boardLocked)
					return; // can't move to board
				this.placedCount++;
			}

			fromSquare.placeTile(null);
			if (tile.isBlank) {			
				if (!(toSquare.owner instanceof Board)) {
					// blanks are permitted
					tile.letter = " ";
					toSquare.$refresh();
				} else if (ifBlank) {
					tile.letter = ifBlank;
					toSquare.$refresh();
				} else {
					this.promptForLetter()
					.then(letter => {
						tile.letter = letter;
						toSquare.$refresh();
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
			$("#yourMove").empty();
			this.updateTileCounts();

			if (this.game.hasEnded()) {
				// moveAction will be one of confirmGameOver, anotherGame
				// or nextGame, so don't hide the turnButton
				this.lockBoard(true);
				return;
			}

			// If this player is not the current player, their only
			// allowable is a challenge, which is handled using a button
			// in the log, so we can hide the turn button
			if (!this.isThisPlayer(this.game.whosTurnKey)) {
				$("#turnButton").hide();
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
					$("#turnButton").hide();
				return;
			}

			if (this.placedCount > 0) {
				// Player has dropped some tiles on the board
				// move action is to make the move
				this.setAction("action_commitMove", /*i18n*/"Finished Turn");
				// Check that the play is legal
				const move = this.game.board.analysePlay();
				const $move = $("#yourMove");
				if (typeof move === "string") {
					// Play is bad
					$move.append($.i18n(move));
					this.enableTurnButton(false);
				} else {
					// Play is legal
					$move.append(formatScore(move, !this.game.predictScore));
					this.enableTurnButton(true);
				}

				// Use 'visibility' and not 'display' to keep the layout stable
				$("#takeBackButton").css("visibility", "inherit");
				$("#swapRack").hide();
				return;
			}

			if (this.swapRack.squaresUsed() > 0) {
				// Swaprack has tiles on it, change the move action to swap
				this.setAction("action_swap", /*i18n*/"Swap");
				$("#board .ui-droppable").droppable("disable");
				this.enableTurnButton(true);
				$("#takeBackButton").css("visibility", "inherit");
				return;
			}

			// Otherwise nothing has been placed, turn action is a pass
			this.setAction("action_pass", /*i18n*/"Pass");
			$("#board .ui-droppable").droppable("enable");
			this.enableTurnButton(true);
			$("#takeBackButton").css("visibility", "hidden");
		}

		/**
		 * Set board locked status. The board is locked when it's
		 * not this player's turn.
		 * @param {boolean} newVal new setting of "locked"
		 */
		lockBoard(newVal) {
			this.boardLocked = newVal;
			this.game.board.$refresh();
		}

		/**
		 * Enable/disable the turn button
		 * @param {boolean} enable true to enable, disable otherwise
		 */
		enableTurnButton(enable) {
			$("#turnButton").button(enable ? "enable" : "disable");
		}

		/**
		 * Process a Turn object received from the server. `Notify.TURN` events
		 * are sent by the server when an action by any player has
		 * modified the game state.
		 * @param {Turn} turn a Turn object
		 */
		handle_turn(turn) {
			console.debug("--> turn ", turn);
			// Take back any locally placed tiles
			this.game.board.forEachSquare(
				boardSquare => {
					if (this.takeBackTile(boardSquare))
						this.placedCount--;
				});

            this.removeMoveActionButtons();
			const player = this.game.getPlayer(turn.playerKey);
			const challenger = (typeof turn.challengerKey === "string")
				  ? this.game.getPlayer(turn.challengerKey) : undefined;

			if (turn.type === Turn.CHALLENGE_LOST) {
				challenger.score += turn.score;
				challenger.$refresh();
			} else {
				if (typeof turn.score === "number")
					player.score += turn.score;
				else if (typeof turn.score === "object")
					Object.keys(turn.score).forEach(
						k => this.game.players
						.find(p => p.key === k)
						.score +=
						(turn.score[k].tiles || 0) +
						(turn.score[k].time || 0));
				player.$refresh();
			}

			// Unhighlight last placed tiles
			$(".last-placement").removeClass("last-placement");

			this.describeTurn(turn, true, true);

			// Was the play intiated by, or primarily affecting, us
			const wasUs = this.isThisPlayer(turn.playerKey);

			switch (turn.type) {
			case Turn.CHALLENGE_WON:
			case Turn.TOOK_BACK:
				// Move new tiles out of challenged player's rack
				// into the bag
				if (turn.replacements)
					for (let newTile of turn.replacements) {
						const tile = player.rack.removeTile(newTile);
						this.game.letterBag.returnTile(tile);
					}

				// Take back the placements from the board into the
				// challenged player's rack
				if (turn.placements)
					for (const placement of turn.placements) {
						const square = this.game.at(
							placement.col, placement.row);
						const recoveredTile = square.tile;
						square.placeTile(null);
						player.rack.addTile(recoveredTile);
					}

				// Was it us?
				if (wasUs) {
					player.rack.$refresh();

					if (turn.type === Turn.CHALLENGE_WON) {
						if (this.getSetting("warnings"))
							this.playAudio("oops");
						this.notify(
							/*.i18n("ui-notify-title-succeeded")*/
							/*i18n ui-notify-body-*/"succeeded",
							this.game.getPlayer(turn.playerKey).name,
							-turn.score);
					}
				}

				if (turn.type == Turn.TOOK_BACK) {
					/*.i18n("ui-notify-title-retracted")*/
					this.notify(/*i18n ui-notify-body-*/"retracted",
								this.game.getPlayer(turn.playerKey).name);
				}
				break;

			case Turn.CHALLENGE_LOST:
				if (this.getSetting("warnings"))
					this.playAudio("oops");
				if (challenger === this.player) {
					// Our challenge failed
					/*.i18n("ui-notify-title-you-failed")*/
					this.notify(/*i18n ui-notify-body-*/"you-failed");
				} else {
					/*.i18n("ui-notify-title-they-failed")*/
					this.notify(/*i18n ui-notify-body-*/"they-failed",
						player.name);
				}
				break;

			case Turn.PLAY:
				if (wasUs) {
					if (turn.bonus > 0 && this.getSetting("cheers"))
						this.playAudio("bonusCheer");
					this.placedCount = 0;
				}

				// Take the placed tiles out of the players rack and
				// lock them onto the board.
				for (let i = 0; i < turn.placements.length; i++) {
					const placement = turn.placements[i];
					const square = this.game.at(
						placement.col, placement.row);
					player.rack.removeTile(placement);
					square.placeTile(placement, true);
					if (wasUs)
						square.$refresh();
					else
						// Highlight the tile as "just placed"
						$(`#${square.id}`).addClass("last-placement");
				}

				// Shrink the bag by the number of new
				// tiles. This is purely to keep the counts in
				// synch, we never use tiles taken from the bag on
				// the client side.
				if (turn.replacements)
					this.game.letterBag.getRandomTiles(
						turn.replacements.length);

				// Deliberate fall-through to Turn.SWAP to get the
				// replacements onto the rack

			case Turn.SWAP:
				// Add replacement tiles to the player's rack. Number of tiles
				// in letter bag doesn't change.
				if (turn.replacements) {
					for (let newTile of turn.replacements)
						player.rack.addTile(newTile);

					player.rack.$refresh();
				}

				break;

			case Turn.GAME_OVER:
				// End of game has been accepted
				this.gameOverConfirmed(turn);
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

			if (turn.nextToGoKey && turn.type !== Turn.CHALLENGE_WON) {

				if (turn.type == Turn.PLAY) {
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
					&& turn.type !== Turn.TOOK_BACK) {
					// It's our turn next, and we didn't just take back
					/*.i18n("ui-notify-title-your-turn")*/
					this.notify(/*i18n ui-notify-body-*/"your-turn",
								this.game.getPlayer(turn.playerKey).name);
				}
				this.game.whosTurnKey = turn.nextToGoKey;
				this.updateWhosTurn();
			}
			this.updateGameStatus();
		}

		/**
		 * Handle game-ended confirmation. This confirmation will come after
		 * a player accepts that the previous player's final turn is OK
		 * and they don't intend to challenge.
		 * @param {object} turn Turn.simple describing the game
		 */
		gameOverConfirmed(turn) {
			console.debug(`--> gameOverConfirmed ${turn.gameKey}`);
			this.game.state = Game.STATE_GAME_OVER;
			// unplace any pending move
			this.takeBackTiles();
			this.setAction("action_anotherGame", /*i18n*/"Another game?");
			this.enableTurnButton(true);
			/*.i18n("ui-notify-title-game-over")*/
			this.notify(/*i18n ui-notify-body-*/"game-over");
		}

		/**
		 * Add a 'Challenge' button to the log pane to challenge the last
		 * player's move (if it wasn't us)
		 * @param {Turn} turn the current turn
		 */
		addChallengePreviousButton(turn) {
			if (!this.player)
				return;
			const player = this.game.getPlayer(turn.playerKey);
			if (!player)
				return;
			const text = $.i18n(
				"Challenge $1's turn", player.name);
			const $button =
				  $(`<button name="challenge">${text}</button>`)
				  .addClass("moveAction")
				  .button()
				  .on("click", () => this.challenge());
			addToLog(true, $button, "turn-control");
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
			addToLog($button, "turn-control");
		}

		/**
		 * Remove any action buttons from the log pane.
		 */
		removeMoveActionButtons() {
			$("button.moveAction").remove();
		}

		/**
		 * Action on "Challenge" button clicked
		 */
		challenge() {
			// Take back any tiles we placed
			this.takeBackTiles();
			// Remove action buttons and lock board
			this.sendCommand(Command.CHALLENGE);
		}

		/**
		 * Handler for the 'Make Move' button. Invoked via 'click_turnButton'.
		 * Response will be turn type Turn.PLAY (or Turn.TOOK_BACK if the play
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
			move.playerKey = this.player.key;

			this.sendCommand(Command.PLAY, move);
		}

		/**
		 * Handler for the 'Take back' button clicked. Invoked via
		 * 'click_turnButton'. Response will be a turn type Turn.TOOK_BACK.
		 */
		action_takeBackMove() {
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
			this.sendCommand(Command.GAME_OVER);
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
			$.post(`/join/${key}/${this.player.key}`)
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
			const tiles = this.swapRack.tiles();
			this.swapRack.empty();
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
				$("#turnButton")
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
			const action = $("#turnButton").data("action");
			console.debug("click_turnButton =>", action);
			this[action]();
		}

		/**
		 * Handler for a click on the 'Take Back' button, to pull
		 * back tiles from the board and swap rack
		 */
		takeBackTiles() {
			this.game.board.forEachSquare(
				boardSquare => {
					if (this.takeBackTile(boardSquare))
						this.placedCount--;
				});
			this.swapRack.forEachSquare(
				swapSquare => this.takeBackTile(swapSquare));
			this.updateGameStatus();
		}

		/**
		 * Take back a single tile from the given square.
		 * @param {Square} square the square with the tile being taken back
		 * @return {boolean} true if a tile was returned
		 */
		takeBackTile(square) {
			if (!square.tile || square.tileLocked)
				return false;

			// Find a space on the rack for it
			let freesquare = undefined;
			this.player.rack.forEachSquare(square => {
				if (!square.tile) {
					freesquare = square;
					return true;
				}
				return false;
			});

			// Move the tile back to the rack
			freesquare.tile = square.tile;
			if (square.tile.isBlank)
				square.tile.letter = " ";
			freesquare.$refresh();
			square.tile = null;
			square.$refresh();
			return true;
		}

		/**
		 * Handler for click on the 'Shuffle' button
		 */
		shuffleRack() {
			this.player.rack.shuffle().$refresh();
		}
	}

	new GameUI().build();
});
