/*Copyright (C) 2022 The Xanado Project https://github.com/cdot/Xanado
  License MIT. See README.md at the root of this distribution for full copyright
  and license information. Author Crawford Currie http://c-dot.co.uk*/
/* eslint-env browser, jquery */

define([
  "browser/BrowserPlayer", "browser/BrowserGame", "browser/Dialog"
], (
  Player, Game, Dialog
) => {

  /**
   * Functionality shared between the client/server and standalone
   * versions of the Games UI
   * @mixin browser/GamesUIMixin
   */
  return superclass => class GamesUIMixin extends superclass {

    /**
     * Format of rows in the games table.
     * See {@linkcode browser/BrowserGame#headline}
     */
    static GAME_TABLE_ROW = '<tr class="game" id="%i">'
    + '<td class="h-edition">%e</td>'
    + '<td class="h-created">%c</td>'
    + '<td class="h-players">%p</td>'
    + '<td class="h-state">%s</td>'
    + '<td class="h-won">%w</td>'
    + '</tr>';

    /**
     * Attach event handlers to objects in the UI
     * @instance
     * @memberof browser/GamesUIMixin
     */
    attachUIEventHandlers() {
      $("#showAllGames")
      .on("change", () => this.refreshGames());
    }

    /**
     * Used by GameDialog
     * @instance
     * @memberof browser/GamesUIMixin
     */
    gameOptions(game) {
      assert.fail("GamesUIMixin.gameOptions");
    }

    /**
     * Used by GameDialog
     * @instance
     * @memberof browser/GamesUIMixin
     */
    joinGame(game) {
      assert.fail("GamesUIMixin.joinGame");
    }

    /**
     * Used by GameDialog
     * @instance
     * @memberof browser/GamesUIMixin
     */
    addRobot(game) {
      assert.fail("GamesUIMixin.addRobot");
    }

    /**
     * Used by GameDialog
     * @instance
     * @memberof browser/GamesUIMixin
     */
    invitePlayers(game) {
      assert.fail("GamesUIMixin.invitePlayers");
    }

    /**
     * Used by GameDialog
     * @instance
     * @memberof browser/GamesUIMixin
     */
    anotherGame(game) {
      assert.fail("GamesUIMixin.anotherGame");
    }

    /**
     * Used by GameDialog
     * @instance
     * @memberof browser/GamesUIMixin
     */
    deleteGame(game) {
      assert.fail("GamesUIMixin.deleteGame");
    }

    /**
     * Used by GameDialog
     * @instance
     * @memberof browser/GamesUIMixin
     */
    observe(game) {
      assert.fail("GamesUIMixin.observe");
    }

    /**
     * @override
     * @instance
     * @memberof browser/GamesUIMixin
     */
    readyToListen() {
      return this.refresh();
    }

    /**
     * Construct a table row that shows the state of the given player
     * @instance
     * @memberof browser/GamesUIMixin
     * @param {Game|object} game a Game or Game.simple
     * @param {Player} player the player
     * @param {boolean} isActive true if the game isn't over
     */
    $player(game, player, isActive) {
      assert(player instanceof Player, "Not a player");
      const $tr = player.$tableRow();

      if (isActive) {
        if (player.dictionary && player.dictionary !== game.dictionary) {
          const dic = $.i18n("using-dic", player.dictionary);
          $tr.append(`<td>${dic}</td>`);
        }

        if (game.timerType && player.clock) {
          const left = $.i18n("left-to-play", player.clock);
          $tr.append(`<td>${left}</td>`);
        }

      } else {
        const winningScore = game.getPlayers().reduce(
          (max, p) =>
          Math.max(max, p.score), 0);

        if (player.score === winningScore) {
          $tr.append('<td class="ui-icon icon-winner"></td>');
        }

        return $tr;
      }

      const $box = $(document.createElement("td"));
      $box.addClass("button-box");
      $tr.append($box);

      if (player.key === this.session.key) {
        // Currently signed in player
        $box.append(
          $(document.createElement("button"))
          .attr("name", `join${game.key}`)
          .button({ label: $.i18n("Open game") })
          .tooltip({
            content: $.i18n("tt-open")
          })
          .on("click", () => {
            console.debug(`Open game ${game.key}/${this.session.key}`);
            this.joinGame(game);
          }));
      }
      return $tr;
    }

    /**
     * Construct a table row that shows the state of the given game
     * @instance
     * @memberof browser/GamesUIMixin
     * @param {Game|object} game a Game or Game.simple
     * @private
     */
    $gameTableRow(game) {
      assert(game instanceof Game, "Not a game");
      return $(game.tableRow(this.constructor.GAME_TABLE_ROW))
      .on("click", () => {
        Dialog.open("browser/GameDialog", {
          game: game,
          ui: this
        });
      });
    }

    /**
     * Refresh the display of a single game
     * @instance
     * @memberof browser/GamesUIMixin
     * @param {Game|object} game a Game or Game.simple
     * @private
     */
    showGame(game) {
      // Update the games list and dialog headlines as appropriate
      $(`#${game.key}`).replaceWith(
        game.tableRow(this.constructor.GAME_TABLE_ROW));
      // Update the dialog if appropriate
      $(`#GameDialog[name=${game.key}]`)
      .data("this")
      .populate(game);
    }

    /**
     * Refresh the display of all games
     * @instance
     * @memberof browser/GamesUIMixin
     * @param {object[]} games array of Game.simple
     */
    showGames(simples) {
      if (simples.length === 0) {
        $("#gamesList").hide();
        return;
      }

      const $gt = $("#gamesList > tbody");
      $gt.empty();

      const games = simples.map(simple => Game.fromSerialisable(simple, Game))
            .sort((a, b) => a.creationTimestamp < b.creationTimestamp ? -1 :
                  a.creationTimestamp > b.creationTimestamp ? 1 : 0);

      games.forEach(game => $gt.append(this.$gameTableRow(game)));

      $("#gamesList").show();
    }

    /**
     * Request an update for all games in a games table
     * @instance
     * @memberof browser/GamesUIMixin
     * @param {boolean?} noPlayers true to omit players from the
     * table headline
     */
    refreshGames() {
      const what = $("#showAllGames").is(":checked") ? "all" : "active";
      return this.getGames(what)
      .then(games => this.showGames(games))
      .catch(this.constructor.report);
    }

    /**
     * Request an update for a single game (which must exist in the
     * games table)
     * @instance
     * @memberof browser/GamesUIMixin
     * @param {string} key Game key
     */
    refreshGame(key) {
      return this.getGame(key)
      .then(simple => this.showGame(
        Game.fromSerialisable(simple[0], Game)))
      .catch(this.constructor.report);
    }

    /**
     * Request an update for session status and all games lists
     * @instance
     * @memberof browser/GamesUIMixin
     * @return {Promise} promise that resolves when all AJAX calls
     * have completed
     */
    refresh() {
      console.debug("refresh");
      return Promise.all([
        this.getSession()
        .then(session => {
          if (session) {
            $("#create-game").show();
            $("#chpw_button").toggle(session.provider === "xanado");
          } else {
            $("#create-game").hide();
          }
        })
        .then(() => this.refreshGames()),

        this.getHistory()
        .then(data => {
          if (data.length === 0) {
            $("#gamesCumulative").hide();
            return;
          }
          let n = 1;
          $("#gamesCumulative").show();
          const $gt = $("#playerList");
          $gt.empty();
          data.forEach(player => {
            const s = $.i18n(
              "leader-board-row", n++, player.name, player.score,
              player.games, player.wins);
            $gt.append(`<div class="player-cumulative">${s}</div>`);
          });
        })
      ]);
    }

    /**
     * Get a list of games
     * @instance
     * @memberof browser/GamesUIMixin
     * @param {string} what 'all' or 'active' (default)
     * @return {Promise} resolves to a list of objects, one per
     * unique player, each with keys as follows:
     * * key: player key
     * * name: player name
     * * score: total cumulative score
     * * wins: number of wins
     * * games: number of games played
     */
    getHistory(what) {
      assert.fail("GamesUIMixin.getHistory");
    }

    /**
     * Get a list of games
     * @instance
     * @memberof browser/GamesUIMixin
     * @param {string} what `all` or `active`
     * @return {Promise} resolves to a list of Game.simple
     */
    getGames(what) {
      assert.fail("GamesUIMixin.getGames");
    }

    /**
     * Get the given game
     * @instance
     * @memberof browser/GamesUIMixin
     * @return {Promise} promise that resolves to a Game or Game.simple
     */
    getGame(key) {
      assert.fail("GamesUIMixin.getGame");
    }
  };
});
