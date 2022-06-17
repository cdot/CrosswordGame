/*Copyright (C) 2019-2022 The Xanado Project https://github.com/cdot/Xanado
License MIT. See README.md at the root of this distribution for full copyright
and license information. Author Crawford Currie http://c-dot.co.uk*/
/* eslint-env amd, node */

define("server/Server", [
	"fs", "path", "events", "cookie", "cors", "express", "errorhandler",
	"platform",	"common/Fridge",
	"server/UserManager",
	"game/Types",
	"game/Game", "game/Player", "game/Turn", "game/Edition"
], (
	fs, Path, Events, Cookie, cors, Express, ErrorHandler,
	Platform, Fridge,
	UserManager, Types,
	Game, Player, Turn, Edition
) => {

	const Fs = fs.promises;
    const Command = Types.Command;
    const Notify = Types.Notify;
    const Turns = Types.Turns;

	/**
	 * Web server for crossword game.
	 */
	class Server {

		/**
		 * @param {Object} config See example-config.json for content
		 */
		constructor(config) {
			this.config = config;

			/* istanbul ignore if */
			if (!config.defaults)
				throw new Error("No config.defaults, see example-config.json for requirements");

			/* istanbul ignore if */
			if (config.debug_server)
				this._debug = console.debug;
			else
				this._debug = () => {};

			// Add a couple of dynamically computed defaults that need to
			// be sent with /defaults
			config.defaults.canEmail = (typeof config.mail !== "undefined");
			config.defaults.notification = config.defaults.notification &&
			(typeof config.https !== "undefined");

			this.db = new Platform.Database(
				// Allow (undocumented) override of default /games
				// database path, primarily for unit testing.
				config.games || "games",
				"game");

			// Live games; map from game key to Game
			this.games = {};
			// Status-monitoring sockets (game pages)
			this.monitors = [];

			process.on("unhandledRejection", reason => {
				/* istanbul ignore next */
				console.error("Command rejected", reason, reason ? reason.stack : "");
			});

			this.express = new Express();

			// Headers not added by passport?
			this.express.use(cors());

			// Parse incoming requests with url-encoded payloads
			this.express.use(Express.urlencoded({ extended: true }));

			// Parse incoming requests with a JSON body
			this.express.use(Express.json());

			// Can't use __dirname, only available in top level
			const staticRoot = Platform.getFilePath();
			// Grab all static files relative to the project root
			// html, images, css etc. The Content-type should be set
			// based on the file mime type (extension) but Express doesn't
			// always get it right.....
			this._debug("static files from", staticRoot);
			this.express.use(Express.static(staticRoot));

            // Debug report incoming requests
			this.express.use((req, res, next) => {
				this._debug("-->", req.method, req.url);
				next();
			});

			// Add user manager routes (/login, /register etc.
			this.userManager = new UserManager(config, this.express);

			// Create a router for game commands
			const cmdRouter = Express.Router();

			// Get the HTML for the main interface (the "games" page)
			cmdRouter.get(
                "/",
				(req, res) => res.sendFile(
					Platform.getFilePath("html/games.html")));

			// Get a simplified version of games list or a single game
			// (no board, bag etc) for the "games" page. You can request
			// "active" games (those still in play), "all" games (for
			// finished games too), or a single game key
			cmdRouter.get(
                "/simple/:send",
				(req, res, next) => this.request_simple(req, res)
                .catch(next));

			// Get a games history. Sends a summary of cumulative player
			// scores to date, for each unique player.
			cmdRouter.get(
                "/history",
				(req, res, next) => this.request_history(req, res)
                .catch(next));

			// Get a list of available locales
			cmdRouter.get(
                "/locales",
				(req, res, next) => this.request_locales(req, res)
                .catch(next));

			// Get a list of of available editions
			cmdRouter.get(
                "/editions",
				(req, res, next) => this.request_editions(req, res)
                .catch(next));

			// Get a description of the available dictionaries
			cmdRouter.get(
                "/dictionaries",
				(req, res, next) => this.request_dictionaries(req, res)
                .catch(next));

			// Get a description of the available themes
			cmdRouter.get(
                "/themes",
				(req, res, next) => this.request_themes(req, res)
                .catch(next));

			// Get a css for the current theme.
			cmdRouter.get(
                "/theme/:css",
				(req, res, next) => this.request_theme(req, res)
                .catch(next));

			// Defaults for user session settings.
			// Some of these can be overridden by a user.
			cmdRouter.get(
                "/defaults",
				(req, res, next) => res.send(config.defaults));

			// Get Game. This is a full description of the game, including
			// the Board. c.f. /simple which provides a cut-down version
			// of the same thing.
			cmdRouter.get(
                "/game/:gameKey",
				(req, res, next) => this.request_game(req, res));

			// Construct a new game. Invoked from games.js
			cmdRouter.post(
                "/createGame",
				(req, res, next) =>
				this.userManager.checkLoggedIn(req, res, next),
				(req, res, next) => this.request_createGame(req, res)
                .catch(next));

			// Invite players by email. Invoked from games.js
			cmdRouter.post(
                "/invitePlayers/:gameKey",
				(req, res, next) =>
				this.userManager.checkLoggedIn(req, res, next),
				(req, res, next) => this.request_invitePlayers(req, res)
                .catch(next));

			// Delete an active or old game. Invoked from games.js
			cmdRouter.post(
                "/deleteGame/:gameKey",
				(req, res, next) =>
				this.userManager.checkLoggedIn(req, res, next),
				(req, res, next) => this.request_deleteGame(req, res)
                .catch(next));

			// Request another game in a series
			// Note this is NOT auth-protected, it is invoked
			// from the game interface to create a follow-on game
			cmdRouter.post(
                "/anotherGame/:gameKey",
				(req, res, next) =>
				this.userManager.checkLoggedIn(req, res, next),
				(req, res, next) => this.request_anotherGame(req, res)
                .catch(next));

			// send email reminders about active games
			cmdRouter.post(
                "/sendReminder/:gameKey",
				(req, res, next) =>
				this.userManager.checkLoggedIn(req, res, next),
				(req, res, next) => this.request_sendReminder(req, res)
                .catch(next));

			// Handler for player joining a game.
			cmdRouter.post(
                "/join/:gameKey",
                (req, res, next) =>
	            this.userManager.checkLoggedIn(req, res, next),
				(req, res, next) => this.request_join(req, res)
                .catch(next));

			// Handler for player leaving a game
			cmdRouter.post(
                "/leave/:gameKey",
				(req, res, next) =>
				this.userManager.checkLoggedIn(req, res, next),
				(req, res, next) => this.request_leave(req, res)
                .catch(next));

			// Handler for adding a robot to a game
			cmdRouter.post(
                "/addRobot/:gameKey",
				(req, res, next) =>
				this.userManager.checkLoggedIn(req, res, next),
				(req, res, next) => this.request_addRobot(req, res)
                .catch(next));

			// Handler for adding a robot to a game
			cmdRouter.post(
                "/removeRobot/:gameKey",
				(req, res, next) =>
				this.userManager.checkLoggedIn(req, res, next),
				(req, res, next) => this.request_removeRobot(req, res)
                .catch(next));

			// Request handler for a turn (or other game command)
			cmdRouter.post(
                "/command/:command/:gameKey",
				(req, res, next) =>
				this.userManager.checkLoggedIn(req, res, next),
				(req, res, next) => this.request_command(req, res)
                .catch(next));

			this.express.use(cmdRouter);

			// Install error handler
			this.express.use((err, req, res, next) => {
			    if (typeof err === "object" && err.code === "ENOENT") {
				    // Special case of a database file load failure
				    this._debug("<-- 404", req.url, err.toString());
				    res.status(404).send([
					    "Database file load failed", req.url, err]);
			    } else {
			        this._debug("<-- 500", err.toString());
				    res.status(500).send(err);
                }
			});

            // Finally handle otherwise unhandled errors
			this.express.use(ErrorHandler({
				dumpExceptions: true,
				showStack: true
			}));
		}

		/**
		 * Load the game from the DB, if not already in server memory
		 * @param {string} key game key
		 * @return {Promise} Promise that resolves to a {@link Game}
		 */
		loadGame(key) {
			/* istanbul ignore if */
			if (typeof key === "undefined")
				return Promise.reject("Game key is undefined");
			if (this.games[key])
				return Promise.resolve(this.games[key]);

			return this.db.get(key, Game.classes)
			.then(game => game.onLoad(this.db))
			.then(game => game.checkAge())
			.then(game => {
				Events.EventEmitter.call(game);

				Object.defineProperty(
					// makes connections non-persistent
					game, "connections", { enumerable: false });

				this.games[key] = game;
				/* istanbul ignore if */
				if (this.config.debug_game)
				    game._debug = console.debug;

				return game.playIfReady();
			});
		}

		/**
		 * Attach the handlers for incoming socket messages from the UI
		 * @param {socket.io} socket the socket to listen to
		 */
		attachSocketHandlers(socket) {
			socket

			.on("connect", sk => {
				// Player or monitor connecting
				this._debug("-S-> connect");
				this.updateObservers();
			})

			.on("disconnect", sk => {
				this._debug("-S-> disconnect");

				// Don't need to refresh players using this socket, because
				// each Game has a 'disconnect' listener on each of the
				// sockets being used by players of that game. However
				// monitors don't.

				// Remove any monitor using this socket
				const i = this.monitors.indexOf(socket);
				if (i >= 0) {
					// Game monitor has disconnected
					this._debug("\tmonitor disconnected");
					this.monitors.slice(i, 1);
				} else
					this._debug("\tanonymous disconnect");
				this.updateObservers();
			})

			.on(Notify.MONITOR, () => {
				// Games monitor has joined
				this._debug("-S-> monitor");
				this.monitors.push(socket);
			})

			.on(Notify.JOIN, params => {
				// Player joining.
                // When the game interface is opened in a browser, the
                // interface initiates a socket connection. WebSockets then
                // sends "connect" to the UI. JOIN is then sent by the UI,
                // which connects the UI to the game.
				this._debug(
                    "-S-> join", params.playerKey, "joining", params.gameKey);
				this.loadGame(params.gameKey)
				.then(game => {
					return game.connect(socket, params.playerKey)
					.then(() => this.updateObservers(game));
				})
				.catch(e => {
					console.error("socket join error:", e);
				});
			})

			.on(Notify.MESSAGE, message => {

                if (!socket.game)
                    return;

				// Chat message
				this._debug("-S-> message", message);
                let m;
				if (message.text === "hint")
					socket.game.hint(socket.player);
				else if (message.text === "advise")
					socket.game.toggleAdvice(socket.player);
				else if ((m = /^allow\s+(\w+)\s*$/.exec(message.text))) {
					socket.game.getDictionary()
                    .then(dict => {
                        const word = m[1].toUpperCase();
                        if (dict.addWord(word)) {
                            socket.game.notifyAll(
                                Notify.MESSAGE, {
                                    sender: /*i18n*/"Advisor",
                                    text:
                                    /*i18n*/"$1 has added '$2' to $3",
                                    args: [
                                        socket.player.name, word, dict.name
                                    ]
                                });
                        } else {
                            socket.game.notifyPlayer(
                                socket.player,
                                Notify.MESSAGE, {
                                    sender: /*i18n*/"Advisor",
                                    text: /*i18n*/"'$1' is already in $2",
                                    args: [ word, dict.name ]
                                });
                        }
                    });
				} else
					socket.game.notifyAll(Notify.MESSAGE, message);
			});
		}

		/**
		 * Notify games and monitors that something about the game.
		 * @param {Game?} game if undefined, will simply send "update"
		 * to montors.
		 */
		updateObservers(game) {
			this._debug("<-S- update", game ? game.key : "*");
			this.monitors.forEach(socket => socket.emit(Notify.UPDATE));
			if (game)
				game.updateConnections();
		}

		/**
         * Handle /simple/:send
		 * Sends a simple description of active games (optionally with
		 * completed games). `send` can be a single game key to
		 * get a single game, `active` to get active games, or `all`
		 * to get all games, including finished games. Note: this
		 * sends simple objects, not {@link Game}s.
		 * @param {Request} req the request object
		 * @param {Response} res the response object
		 * @return {Promise} Promise to send a list of games as requested
		 */
		request_simple(req, res, next) {
			const server = this;
			const send = req.params.send;
			// Make list of keys we are interested in
			return ((send === "all" || send === "active")
				? this.db.keys()
				: Promise.resolve([send]))
			// Load those games
			.then(keys => Promise.all(keys.map(key => this.loadGame(key))))
			// Filter the list and generate simple data
			.then(games => Promise.all(
				games
				.filter(game => (send !== "active" || !game.hasEnded()))
				.map(game => game.simple(this.userManager))))
			// Sort the resulting list by last activity, so the most
			// recently active game bubbles to the top
			.then(gs => gs.sort((a, b) => a.lastActivity < b.lastActivity ? 1
								: a.lastActivity > b.lastActivity ? -1 : 0))
			// Finally send the result
			.then(data => {
				this._debug("<-- 200 simple", send);
				return res.status(200).send(data);
			});
		}

		/**
		 * Handler for GET /history
		 * Sends a summary of cumulative player scores to date, for all
		 * unique players.
		 * @param {Request} req the request object
		 * @param {Response} res the response object
		 * @return {Promise}
		 */
		request_history(req, res, next) {
			const server = this;

			return this.db.keys()
			.then(keys => keys.map(key => this.loadGame(key)))
			.then(promises => Promise.all(promises))
			.then(games => {
				const results = {};
				games
				.filter(game => game.hasEnded())
				.map(game => {
					const winScore = game.winningScore();
					game.getPlayers().forEach(
						player => {
							let result = results[player.key];
							if (!result) {
								results[player.key] =
								result = {
									key: player.key,
									name: player.name,
									score: 0,
									wins: 0,
									games: 0
								};
							}
							result.games++;
							if (player.score === winScore)
								result.wins++;
							result.score += player.score;
						});
				});
				const list = [];
				for (let name in results)
					list.push(results[name]);
				return list;
			})
			.then(list => list.sort((a, b) => a.score < b.score ? 1
									: (a.score > b.score ? -1 : 0)))
			.then(list => res.status(200).send(list));
		}

		/**
		 * Handler for GET /locales
		 * Sends a list of available translation locales.  Used when
		 * selecting a presentation language for the UI.
		 * @param {Request} req the request object
		 * @param {Response} res the response object
		 * @return {Promise} Promise to list locales
		 */
		request_locales(req, res, next) {
			const db = new Platform.Database(
				"i18n", "json");
			return db.keys()
			.then(keys => res.status(200).send(keys));
		}

		/**
		 * Handler for GET /editions
		 * Promise to get an index of available editions.
		 * @param {Request} req the request object
		 * @param {Response} res the response object
		 * @return {Promise} Promise to index available editions
		 */
		request_editions(req, res, next) {
			return Fs.readdir(Platform.getFilePath("editions"))
			.then(list => res.status(200).send(
				list.filter(f => /^[^_].*\.js$/.test(f))
				.map(fn => fn.replace(/\.js$/, ""))));
		}

		/**
		 * Handler for GET /dictionaries
		 * @param {Request} req the request object
		 * @param {Response} res the response object
		 * @return {Promise} Promise to index available dictionaries
		 */
		request_dictionaries(req, res) {
			return Fs.readdir(Platform.getFilePath("dictionaries"))
			.then(list => res.status(200).send(
				list.filter(f => /\.dict$/.test(f))
				.map(fn => fn.replace(/\.dict$/, ""))));
		}

		/**
		 * Handler for GET /themes/:css
		 * @param {Request} req the request object
		 * @param {Response} res the response object
		 * @return {Promise} Promise to index available themes
		 */
		request_themes(req, res) {
			const dir = Platform.getFilePath("css");
			return Fs.readdir(dir)
			.then(list => res.status(200).send(list));
		}

		/**
		 * Handler for GET /theme
		 * return {Promise} Promise to return css for current theme, if
		 * a user is logged in and they have selected a theme.
		 * @param {Request} req the request object
		 * @param {Response} res the response object
		 * @return {Promise} Promise to return the requested theme file
		 */
		request_theme(req, res) {
			let theme = "default";
			if (req.user && req.user.settings && req.user.settings.theme)
				theme = req.user.settings.theme;
			const dpath = Platform.getFilePath(`css/default/${req.params.css}`);
			const path = Platform.getFilePath(`css/${theme}/${req.params.css}`);
            this._debug("Send theme", path);
            return new Promise(
                (resolve, reject) => res.sendFile(
                    Path.normalize(path), {
                        dotfiles: "deny"
                    },
                    err => err ? reject(err) : resolve()))
            .catch(e => new Promise(
                // on error, fall back to default theme
                (resolve, reject) => res.sendFile(
                    Path.normalize(dpath), {
                        dotfiles: "deny"
                    },
                    err => err ? reject(err) : resolve()))
                  );
		}

		/**
		 * Handler for POST /createGame
		 * @param {Request} req the request object
		 * @param {Response} res the response object
		 * @return {Promise}
		 */
		request_createGame(req, res) {
			return Edition.load(req.body.edition)
			.then(edition => new Game(req.body).create())
			.then(game => game.onLoad(this.db))
			.then(game => {
				/* istanbul ignore if */
				if (this.config.debug_game)
					game._debug = console.debug;
				this._debug("Created", game.key);
				return game.save();
			})
			.then(game => res.status(200).send(game.key))
			.then(() => this.updateObservers());
		}

		/**
		 * @param {object} to a lookup suitable for use with UserManager.getUser
		 * @param {Request} req the request object
		 * @param {Response} res the response object
		 * @param {string} gameKey game to which this applies
		 * @param {string} subject subject
		 * @param {string} text email text
		 * @param {string} html email html
		 * @return {Promise} Promise that resolves to the user that was mailed,
		 * either their game name or their email if there is no game name.
		 */
		sendMail(to, req, res, gameKey, subject, text, html) {
			return this.userManager.getUser(
				{key: req.session.passport.user.key})
			.then(sender => `${sender.name}<${sender.email}>`)
			.catch(
                // should never happen so long as only logged-in
                // users can send mail
                /* istanbul ignore next */
                e => this.config.mail.sender)
			.then(sender =>
				new Promise(
					resolve => this.userManager.getUser(to, true)
					.catch(e => {
						// Not a known user, rely on email in the
						// getUser query
						resolve({
							name: to.email, email: to.email
						});
					})
					.then(uo => resolve(uo)))
				.then(uo => {
					if (!uo.email) // no email
						return Platform.i18n("($1 has no email address)",
										  uo.name || uo.key);
					this._debug(
							subject,
							`${uo.name}<${uo.email}> from `,
							sender);
					return this.config.mail.transport.sendMail({
						from: sender,
						to: uo.email,
						subject: subject,
						text: text,
						html: html
					})
					.then(() => uo.name || uo.email);
				}));
		}

		/**
		 * Handle /invitePlayers/:gameKey
		 * @param {Request} req the request object
		 * @param {Response} res the response object
		 * @return {Promise}
		 */
		request_invitePlayers(req, res, next) {
            /* istanbul ignore if */
			if (!this.config.mail || !this.config.mail.transport)
				throw new Error("Mail is not configured");
            /* istanbul ignore if */
			if (!req.body.player)
				throw new Error("Nobody to notify");

			const gameURL =
				  `${req.protocol}://${req.get("Host")}/html/games.html?untwist=${req.params.gameKey}`;
			let textBody = (req.body.message || "") + "\n" + Platform.i18n(
				"Join the game by following this link: $1", gameURL);
			// Handle XSS risk posed by HTML in the textarea
			let htmlBody = (req.body.message.replace(/</g, "&lt;") || "")
			+ "<br>" + Platform.i18n(
				"Click <a href='$1'>here</a> to join the game.", gameURL);
			let subject = Platform.i18n("You have been invited to play XANADO");
			return Promise.all(req.body.player.map(
				to => this.sendMail(
					to, req, res, req.body.gameKey,
					subject, textBody, htmlBody)))
			.then(list => {
				const names = list.filter(uo => uo);
				this._debug("<-- 200 ", names);
				return res.status(200).send(names);
			});
		}

		/**
		 * Handler for POST /sendReminder
		 * Email reminders to next human player in (each) game
		 * @param {Request} req the request object
		 * @param {Response} res the response object
		 */
		request_sendReminder(req, res, next) {
			const gameKey = req.params.gameKey;
			this._debug("Sending turn reminders to", gameKey);
			const gameURL =
				  `${req.protocol}://${req.get("Host")}/game/${gameKey}`;

			const prom = (gameKey === "*")
				  ? this.db.keys() : Promise.resolve([gameKey]);

			return prom
			.then(keys => Promise.all(keys.map(
				key => (this.games[key]
						? Promise.resolve(this.games[key])
						: this.db.get(key, Game.classes))
			    .then(game => {
					const pr = game.checkAge();
					if (game.hasEnded())
						return undefined;

					const player = game.getPlayer();
					if (!player)
						return undefined;
					this._debug("Sending reminder mail to",
                                `${player.name}/${player.key}`);

					const subject = Platform.i18n(
						"It is your turn in your XANADO game");
					const textBody = Platform.i18n(
						"Join the game by following this link: $1",
						gameURL);
					const htmlBody = Platform.i18n(
						"Click <a href='$1'>here</a> to join the game.",
						gameURL);
					return this.sendMail(
						player, req, res, game.key,
						subject, textBody, htmlBody);
				}))))
			.then(reminders => reminders.filter(e => typeof e !== "undefined"))
			.then(names=> {
				this._debug("<-- 200", names);
				return res.status(200).send(names);
			});
		}

		/**
		 * Handle /join/:gameKey player joining a game. /join is requested
         * by the games interface, and by the "Next game" button in
         * the game UI. It ensures the game is loaded and adds the player
         * indicated by the session indicated in the request (if necessary).
		 * @param {Request} req the request object
		 * @param {Response} res the response object
		 * @return {Promise}
		 */
		request_join(req, res, next) {
			const gameKey = req.params.gameKey;
			return this.loadGame(gameKey)
			.then(game => {
				// Player is either joining or connecting
				const playerKey = req.user.key;
				let player = game.getPlayerWithKey(playerKey);
				let prom;
				if (player) {
					this._debug("Player", playerKey, "opening", gameKey);
					prom = Promise.resolve(game);
				} else {
					this._debug("Player", playerKey, "joining", gameKey);
					player = new Player(
						{ name: req.user.name, key: playerKey });
					game.addPlayer(player);
					prom = game.save();
				}
				// The game may now be ready to start
				return prom.then(game => game.playIfReady());
			})
			.then(() => res.status(200).send("OK"));
			// Don't need to updateObservers, that will be done
			// in the connect event handler
		}

		/**
		 * Handle /addRobot to add a robot to the game
		 * It's an error to add a robot to a game that already has a robot.
		 * Note the gameKey is passed in the request body, this is because it
		 * comes from a dialog.
		 * @param {Request} req the request object
		 * @param {Response} res the response object
		 * @return {Promise}
		 */
		request_addRobot(req, res, next) {
			const gameKey = req.params.gameKey;
			const dic = req.body.dictionary;
			const canChallenge = req.body.canChallenge || false;
			let game;
			return this.loadGame(gameKey)
			.then(g => game = g)
			.then(() => {
				if (game.hasRobot())
			        /* istanbul ignore next */
					throw new Error("Game already has a robot");

				this._debug("Robot joining", gameKey, "with", dic);
				// Robot always has the same player key
				const robot = new Player(
					{
						name: "Robot",
						key: UserManager.ROBOT_KEY,
						isRobot: true,
						canChallenge: canChallenge
					});
				if (dic && dic !== "none")
			        /* istanbul ignore next */
					robot.dictionary = dic;
				game.addPlayer(robot);
				return game.save()
				// Game may now be ready to start
				.then(() => game.playIfReady())
				.then(() => this.updateObservers(game))
				.then(() => res.status(200).send("OK"));
			});
		}

		/**
		 * Handle /removeRobot/:gameKey to remove the robot from a game
		 * @param {Request} req the request object
		 * @param {Response} res the response object
		 * @return {Promise}
		 */
		request_removeRobot(req, res, next) {
			const gameKey = req.params.gameKey;
			return this.loadGame(gameKey)
			.then(game => {
				const robot = game.hasRobot();
				if (!robot)
			        /* istanbul ignore next */
					throw new Error("Game doesn't have a robot");
				this._debug("Robot leaving", gameKey);
				game.removePlayer(robot);
				return game.save();
			})
			// Game may now be ready to start
			.then(game => {
				return game.playIfReady()
				.then(() => this.updateObservers(game));
			})
			.then(() => res.status(200).send("OK"));
		}

		/**
		 * Handle /leave/:gameKey player leaving a game.
		 * @param {Request} req the request object
		 * @param {Response} res the response object
		 * @return {Promise}
		 */
		request_leave(req, res, next) {
			const gameKey = req.params.gameKey;
			const playerKey = req.user.key;
			return this.loadGame(gameKey)
			.then(game => {
				this._debug("Player", playerKey, "leaving", gameKey);
				const player = game.getPlayerWithKey(playerKey);
				if (player) {
					// Note that if the player leaving dips the number
					// of players below minPlayers for the game, the
					// game state is reset to WAITING
					game.removePlayer(player);
					return game.save()
					.then(() => res.status(200).send("OK"))
					.then(() => this.updateObservers());
				}
			    /* istanbul ignore next */
				throw new Error(
					`Player ${playerKey} is not in game ${gameKey}`);
			});
		}

		/**
		 * Handle /game/:gameKey request for a dump of the game.
         * This is designed for use when opening the `game` interface.
         * The game is frozen using {@link Fridge} before sending to fully
         * encode the entire {@link Game} object, including the
         * {@link Player}s, {@link Turn} history, and the {@link Board}
         * so they can be recreated client-side. Subsequent commands and
         * notifications maintain the client-side game object in synch
         * with the server game object.
		 * @param {Request} req the request object
		 * @param {Response} res the response object
		 * @return {Promise} promise that resolves to the frozen game
		 */
		request_game(req, res, next) {
			const gameKey = req.params.gameKey;
			return this.db.get(gameKey, Game.classes)
			.then(game => res.status(200).send(Fridge.freeze(game)));
		}

		/**
		 * Handle /deleteGame/:gameKey
		 * Delete a game.
		 * @param {Request} req the request object
		 * @param {Response} res the response object
		 * @return {Promise}
		 */
		request_deleteGame(req, res, next) {
			const gameKey = req.params.gameKey;
			this._debug("Delete game", gameKey);
			return this.loadGame(gameKey)
            .then(game => game.stopTheClock()) // in case it's running
			.then(() => this.db.rm(gameKey))
			.then(() => res.status(200).send("OK"))
			.then(() => this.updateObservers());
		}

		/**
		 * Create another game with the same players.
		 * @param {Request} req the request object
		 * @param {Response} res the response object
		 * @return {Promise}
		 */
		request_anotherGame(req, res, next) {
			return this.loadGame(req.params.gameKey)
			.then(game => {
				return game.anotherGame()
				.then(() => res.status(200).send(game.nextGameKey));
			});
		}

		/**
		 * A good result is a 200, a bad result has a explanatory string.
		 * Command results are broadcast in Turn objects.
		 * @param {Request} req the request object
		 * @param {Response} res the response object
		 * @return {Promise}
		 */
		request_command(req, res, next) {
			const command = req.params.command;
			const gameKey = req.params.gameKey;
			const playerKey = req.user.key;
			//this._debug("Handling", command, gameKey, playerKey);
			return this.loadGame(gameKey)
			.then(game => {
				if (game.hasEnded())
					// Ignore the command
					return Promise.resolve();

				const player = game.getPlayerWithKey(playerKey);
				if (!player)
			        /* istanbul ignore next */
					throw new Error(
						`Player ${playerKey} is not in game ${gameKey}`);

				// The command name and arguments
				const args = req.body;
				
				this._debug("COMMAND", command,
                            "player", player.name,
                            "game", game.key);

				// Istanbul can ignore next because it's just routing
				/* istanbul ignore next */
				switch (command) {

				case Command.PLAY:
					return game.play(player, args);

				case Command.PASS:
					return game.pass(player);

				case Command.SWAP:
					return game.swap(player, args);

				case Command.CHALLENGE:
					return game.challenge(player);

				case Command.TAKE_BACK:
					return game.takeBack(player, Turns.TOOK_BACK);

				case Command.CONFIRM_GAME_OVER:
					return game.confirmGameOver();

				case Command.PAUSE:
					return game.pause(player);

				case Command.UNPAUSE:
					return game.unpause(player);

				default:
					throw Error(`unrecognized command: ${command}`);
				}
            })
			.then(() => {
				//this._debug(command, "handled`);
				// Notify non-game monitors (games pages)
				this.updateObservers();
				return res.status(200).send("OK");
			});
		}
	}
		
	return Server;
});
