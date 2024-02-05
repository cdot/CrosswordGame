/* See README.md at the root of this distribution for copyright and
   license information */
/* eslint-env mocha,node */
"use strict";

import { assert } from "chai";
import { setupPlatform } from "../TestPlatform.js";
import { CBOR } from "../../src/game/CBOR.js";
import { Game } from "../../src/game/Game.js";
const Square = Game.CLASSES.Square;
const Turn = Game.CLASSES.Turn;
const Tile = Game.CLASSES.Tile;
const Player = Game.CLASSES.Player;

/**
 * Unit tests for Game base class. See ServerGame.ut and BrowserGame.ut
 * for more.
 */
describe("game/Game", () => {

  before(setupPlatform);

  it("construct, serialisable, fromSimple", () => {
    const p = {
      edition:"English_Scrabble",
      dictionary:"Oxford_5000",
      timerType: Game.Timer.GAME,
      timeAllowed: 60,
      timePenalty: 100,
      predictScore: true,
      allowTakeBack: true,
      wordCheck: Game.WordCheck.AFTER,
      minPlayers: 5,
      //_debug: console.debug,
      maxPlayers: 10
    };
    let game;
    return new Game(p)
    .create()
    .then(g => game = g)
    .then(() => {
      assert.equal(game.edition, p.edition);
      assert.equal(game.dictionary, p.dictionary);
      assert.equal(game.timerType, Game.Timer.GAME);
      assert.equal(game.timePenalty, 100);
      assert.equal(game.timeAllowed, 60);
      assert(game.predictScore);
      assert(game.allowTakeBack);
      assert(game.wordCheck);
      assert.equal(game.minPlayers, 5);
      assert.equal(game.maxPlayers, 10);
      assert.equal(game.state, Game.State.WAITING);
      return game.serialisable();
    })
    .then(s => {
      assert.equal(s.key, game.key);
      assert.equal(s.creationTimestamp, game.creationTimestamp);
      assert.equal(s.edition, game.edition);
      assert.equal(s.dictionary, game.dictionary);
      assert.equal(s.predictScore, game.predictScore);
      assert.equal(s.wordCheck, game.wordCheck);
      assert.equal(s.allowTakeBack, game.allowTakeBack);
      assert.equal(s.state, game.state);
      assert.equal(s.whosTurnKey, game.whosTurnKey);
      assert.equal(s.timerType, game.timerType);
      assert.equal(s.timeAllowed, game.timeAllowed);
      assert.equal(s.timePenalty, game.timePenalty);
      assert.equal(s.pausedBy, game.pausedBy);
      assert.equal(s.minPlayers, game.minPlayers);
      assert.equal(s.maxPlayers, game.maxPlayers);
      assert.equal(s.challengePenalty, game.challengePenalty);
      assert.equal(s.penaltyPoints, game.penaltyPoints);
      assert.equal(s.nextGameKey, game.nextGameKey);
      assert.equal(s.lastActivity, game.lastActivity());
      assert.equal(s.players.length, 0);
      game = Game.fromSerialisable(s, Game.CLASSES);
      assert.equal(s.key, game.key);
      assert.equal(s.creationTimestamp, game.creationTimestamp);
      assert.equal(s.edition, game.edition);
      assert.equal(s.dictionary, game.dictionary);
      assert.equal(s.predictScore, game.predictScore);
      assert.equal(s.wordCheck, game.wordCheck);
      assert.equal(s.allowTakeBack, game.allowTakeBack);
      assert.equal(s.state, game.state);
      assert.equal(s.whosTurnKey, game.whosTurnKey);
      assert.equal(s.timerType, game.timerType);
      assert.equal(s.timeAllowed, game.timeAllowed);
      assert.equal(s.timePenalty, game.timePenalty);
      assert.equal(s.pausedBy, game.pausedBy);
      assert.equal(s.minPlayers, game.minPlayers);
      assert.equal(s.maxPlayers, game.maxPlayers);
      assert.equal(s.challengePenalty, game.challengePenalty);
      assert.equal(s.penaltyPoints, game.penaltyPoints);
      assert.equal(s.nextGameKey, game.nextGameKey);
      assert.equal(s.lastActivity, game.lastActivity());
      assert.equal(s.players.length, 0);
      assert.equal(s.turns.length, 0);
    });
  });

  it("basics", () => {
    const p = {
      //_debug: console.debug,
      edition:"English_Scrabble",
      dictionary:"Oxford_5000",
      timerType: Game.Timer.TURN,
      timeAllowed: 999,
      predictScore: false,
      allowTakeBack: false,
      wordCheck: Game.WordCheck.AFTER,
      minPlayers: 30,
      maxPlayers: 1
    };

    const game = new Game(p);
    const robot1 = new Player({
      name:"Robot 1", key:"robot1", isRobot: true}, Game.CLASSES);
    assert.equal(Game.CLASSES, robot1._factory);
    const human2 = new Player({
      name:"human2", key:"human2", isRobot: false}, Game.CLASSES);
    const human3 = new Player({
      name:"human3", key:"human3", isRobot: false}, Game.CLASSES);

    const human4 = new Player({
      name:"human4", key:"human4", isRobot: false}, Game.CLASSES);

    const um = { // UserManager fixture
      getUser: k => Promise.resolve({ email: k.key + "@players.com" })
    };

    return game.create()
    .then(() => {
      assert.equal(game.edition, p.edition);
      assert.equal(game.dictionary, p.dictionary);
      assert.equal(game.timeAllowed, 999);
      assert(!game.predictScore);
      assert(!game.allowTakeBack);
      assert.equal(game.wordCheck, Game.WordCheck.AFTER);
      assert.equal(game.minPlayers, 30);
      assert.equal(typeof game.maxPlayers, "undefined");
      assert(!game.hasRobot());
      game.addPlayer(robot1, true);
      game.addPlayer(human2, true);
      game.addPlayer(human3, false);
      game.addPlayer(human4, true);
      assert(game.hasRobot());
      assert.equal(game.getPlayers().length, 4);
      assert.equal(game.getPlayerWithKey(human2.key), human2);
      assert.equal(game.getPlayerWithNoTiles(), human3);
      human3.fillRack(game.letterBag, 1);
      assert(!game.getPlayerWithNoTiles());
      human3.rack.empty();
      game.whosTurnKey = human2.key;

      robot1.score = 1;
      human2.score = 2;
      human3.score = 3;
      human4.score = 4;

      human4._isConnected = true;
      human4.isNextToGo = true;

      let player = game.getPlayer();
      assert.equal(player, human2);
      player = game.getPlayerWithKey(human2.key);
      assert.equal(player.key, human2.key);
      assert.equal(game.nextPlayer(), human3);
      assert.equal(game.previousPlayer(), robot1);
      assert.equal(game.previousPlayer(robot1), human4);
      assert.equal(game.previousPlayer(human2), robot1);
      assert.equal(game.nextPlayer().key, human3.key);
      assert.equal(game.nextPlayer(robot1), human2);
      assert.equal(game.nextPlayer(human2.key), human3);
      assert.equal(game.winningScore(), 4);
      assert.equal(game.state, Game.State.WAITING);
      assert.equal(game.calculateBonus(1), 0);
      assert.equal(game.calculateBonus(2), 0);
      assert.equal(game.calculateBonus(3), 0);
      assert.equal(game.calculateBonus(4), 0);
      assert.equal(game.calculateBonus(5), 0);
      assert.equal(game.calculateBonus(6), 0);
      assert.equal(game.calculateBonus(7), 50);
      assert.equal(game.getWinner(), human4);
      return game.serialisable(um);
    })
    .then(s => {
      assert.equal(s.key, game.key);
      assert.equal(s.creationTimestamp, game.creationTimestamp);
      assert.equal(s.edition, game.edition);
      assert.equal(s.dictionary, game.dictionary);
      assert.equal(s.predictScore || false, game.predictScore || false);
      assert.equal(s.wordCheck, game.wordCheck);
      assert.equal(s.allowTakeBack || false, game.allowTakeBack || false);
      assert.equal(s.state, game.state);
      assert.equal(s.whosTurnKey, game.whosTurnKey);
      assert.equal(s.timerType, game.timerType);
      assert.equal(s.timeAllowed, game.timeAllowed);
      assert.equal(s.timePenalty, game.timePenalty);
      assert.equal(s.pausedBy, game.pausedBy);
      assert.equal(s.minPlayers, game.minPlayers);
      assert.equal(s.maxPlayers, game.maxPlayers);
      assert.equal(s.challengePenalty, game.challengePenalty);
      assert.equal(s.penaltyPoints, game.penaltyPoints);
      assert.equal(s.nextGameKey, game.nextGameKey);
      assert.equal(s.lastActivity, game.lastActivity());
      assert.equal(s.players.length, 4);
      return Promise.all([
        robot1.serialisable(game, um),
        human2.serialisable(game, um),
        human3.serialisable(game, um)
      ])
      .then(ps => {
        assert.deepEqual(s.players[0], ps[0]);
        assert.deepEqual(s.players[1], ps[1]);
        assert.deepEqual(s.players[2], ps[2]);
        game.removePlayer(robot1);
        game.removePlayer(human4);
        assert.equal(game.getPlayers().length, 2);
        assert(!game.getPlayerWithKey(robot1.key));
        assert.equal(game.getPlayerWithKey(human2.key), human2);
        assert.equal(game.getPlayerWithKey(human3.key), human3);
      });
    });
  });

  it("turns", () => {
    const p = {
      //_debug: console.debug,
      edition:"English_Scrabble",
      dictionary:"Oxford_5000",
      timerType: Game.Timer.TURN,
      timeAllowed: 999,
      predictScore: false,
      allowTakeBack: false,
      wordCheck: Game.WordCheck.AFTER,
      minPlayers: 30,
      maxPlayers: 1
    };

    const game = new Game(p);
    return game.create().then(() => {
      game.turns = [
        new Turn({
          score: 0,
          type: "swap",
          gameKey: "e6c65400618fd8aa",
          playerKey: "2v5oyt5qpi",
          nextToGoKey: "49dabe7iua",
          timestamp: 1
        }),
        new Turn({
          score: -5,
          type: "challenge-lost",
          gameKey: "e6c65400618fd8aa",
          playerKey: "49dabe7iua",
          nextToGoKey: "2v5oyt5qpi",
          challengerKey: "2v5oyt5qpi",
          timestamp: game.creationTimestamp + 1
        })
      ];

      assert.equal(game.lastTurn(), game.turns[1]);
      let i = 0;
      game.forEachTurn(t => {
        assert.equal(t, game.turns[i++]);
      });
      assert.equal(i, 2);

      assert(game.at(0, 0) instanceof Square);

      return game.serialisable();
    })
    .then(s => {
      assert.equal(s.turns.length, 2);
    });
  });

  it("CBOR", () => {
    const p = {
      edition:"English_Scrabble",
      dictionary:"Oxford_5000",
      timerType: Game.Timer.GAME,
      timeAllowed: 60,
      timePenalty: 100,
      predictScore: true,
      allowTakeBack: true,
      wordCheck: Game.WordCheck.AFTER,
      minPlayers: 5,
      //_debug: console.debug,
      maxPlayers: 10
    };
    return new Game(p)
    .create()
    .then(game => {
      CBOR.encode(game, Game.CLASSES);
    });
  });

  it("pack", () => {
    const p = {
      edition:"English_Scrabble",
      dictionary:"Oxford_5000",
      timerType: Game.Timer.GAME,
      timeAllowed: 60,
      timePenalty: 100,
      predictScore: true,
      allowTakeBack: true,
      wordCheck: Game.WordCheck.AFTER,
      challengePenalty: Game.Penalty.PER_WORD,
      state: Game.State.WAITING,
      minPlayers: 5,
      maxPlayers: 10,
      allowUndo: true
    };

    const robot1 = new Player({
      name:"Robot", key:"robot1", isRobot: true}, Game.CLASSES);
    assert.equal(Game.CLASSES, robot1._factory);
    const human2 = new Player({
      name:"Human", key:"human2", isRobot: false}, Game.CLASSES);

    return new Game(p)
    .create()
    .then(g => {
      g.addPlayer(robot1, true);
      g.addPlayer(human2, true);
      g.turns = [
        new Turn({
          score: -5,
          type: Turn.Type.CHALLENGE_LOST,
          gameKey: g.key,
          playerKey: human2.key,
          nextToGoKey: robot1.key,
          challengerKey: robot1.key,
          timestamp: g.creationTimestamp + 1
        }),
        new Turn({
          score: 0,
          type: Turn.Type.SWAPPED,
          gameKey: g.key,
          playerKey: robot1.key,
          nextToGoKey: human2.key,
          replacements: [
            new Tile({ letter: "A", score: 1 }),
            new Tile({ letter: "Q", score: 10 })
          ],
          timestamp: 1
        })
      ];

      const s = g.pack();
      //console.debug(s);

      const p = {};
      s.split(";").forEach(part => {
        const bits = part.split("=");
        if (bits.length === 1)
          p[bits[0]] = true;
        else
          p[bits[0]] = decodeURIComponent(bits[1]);
      });

      assert.equal(p.b, '(225)'); // blank board
      assert.equal(p.c, 3);
      assert.equal(p.d, "Oxford_5000");
      assert.equal(p.e, "English_Scrabble");
      assert(p.g);
      assert(p.i);
      assert.equal(p.k.length, 16);
      assert(p.m);
      assert.equal(p.o, 5);
      assert.equal(p.s, 0);
      assert.equal(p.t, 2);
      assert.equal(p.v, 1);
      assert.equal(p.x, 60);
      assert.equal(p.y, 100);

      assert.equal(p.P0k, 'robot1');
      assert.equal(p.P0n, 'Robot');
      assert.equal(p.P0r, true);
      assert.equal(p.P0s, 0);
      assert.equal(p.P1k, 'human2');
      assert.equal(p.P1n, 'Human');
      assert.equal(p.P1s, 0);

      assert(p.T0m);
      assert.equal(p.T0n, robot1.key);
      assert.equal(p.T0p, human2.key);
      assert.equal(p.T0t, 3);
      assert.equal(p.T0c, robot1.key);

      assert(p.T1m);
      assert.equal(p.T1n, human2.key);
      assert.equal(p.T1p, robot1.key);
      assert.equal(p.T1r, 'AQ');
      assert.equal(p.T1t, 1);
    });
  });

  it("unpack", () => {
    const params = {
      a:1,
      b:"qUESTION(6)C--P(7)I--I(7)E--N(7)N--I(7)C--O(7)E--NO(10)M(36)",
      c:3,
      o:5,
      d:"Oxford_5000",
      e:"Test",
      g:true,
      i: true,
      k:"30e820bbc5f4ef41",
      m:1707125064802,
      P0k:"robot1",
      P0n:"Robot",
      P0r:true,
      P0R:"NTGTSVO-",
      P0s:0,
      P1k:"human2",
      P1n:"Human",
      P1R:"NEAGAEA-",
      P1s:12,
      T0c:"robot1",
      T0m:1707125064803,
      T0n:"robot1",
      T0p:"human2",
      T0t:3,
      T1m:1,
      T1n:"human2",
      T1s:12,
      T1p:"robot1",
      T1r:"AQ",
      T1t:1,
      s:1,
      t:2,
      u:true,
      v:1,
      x:60,
      y:100
    };

    return Game.unpack(params)
    .then(game => {
      //console.log(game);
      assert.equal(game.challengePenalty, Game.Penalty.PER_WORD);
      assert.equal(game.dictionary, "Oxford_5000");
      assert.equal(game.edition, "Test");
      assert(game.allowTakeBack);
      assert(game.predictScore);
      assert.equal(game.key, "30e820bbc5f4ef41");
      assert.equal(game.creationTimestamp, 1707125064802);
      assert.equal(game.penaltyPoints, 5);
      assert.equal(game.state, Game.State.PLAYING);
      assert.equal(game.timerType, Game.Timer.GAME);
      assert.equal(game.wordCheck, Game.WordCheck.AFTER);
      assert.equal(game.timeAllowed, 60);
      assert.equal(game.timePenalty, 100);

      // Test has 59 tiles initially
      assert.equal(game.letterBag.tiles.length, 28);

      const p0 = game.players[0];
      assert.equal(p0.key, 'robot1');
      assert.equal(p0.name, 'Robot');
      assert.equal(p0.score, 0);
      assert(p0.isRobot);

      const p1 = game.players[1];
      assert.equal(p1.key, 'human2');
      assert.equal(p1.name, 'Human');
      assert.equal(p1.score, 12);
      assert(!p1.isRobot);

      const t0 = game.turns[0];
      assert.equal(t0.type, Turn.Type.CHALLENGE_LOST);
      assert.equal(t0.timestamp, 1707125064803);
      assert.equal(t0.nextToGoKey, 'robot1');
      assert.equal(t0.playerKey, 'human2');
      assert.equal(t0.challengerKey, 'robot1');

      const t1 = game.turns[1];
      assert.equal(t1.type, Turn.Type.SWAPPED);
      assert.equal(t1.timestamp, 1);
      assert.equal(t1.nextToGoKey, 'human2');
      assert.equal(t1.playerKey, 'robot1');
      assert.equal(t1.replacements[0].letter, "A");
      assert.equal(t1.replacements[0].score, 1);
      assert.equal(t1.replacements[1].letter, "Q");
      assert.equal(t1.replacements[1].score, 4);
      console.log(game.pack());
    });
  });
});

