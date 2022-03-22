/* See README.md at the root of this distribution for copyright and
   license information */
/* eslint-env amd, node */

define('server/UserManager', [
	'fs', 'proper-lockfile', 'bcrypt',
	'express-session',
	'passport', 'passport-strategy',
	'platform'
], (
	fs, Lock, BCrypt,
	ExpressSession,
	Passport, Strategy,
	Platform
) => {

	const Fs = fs.promises;

	function pw_hash(pw) {
		if (typeof pw === 'undefined')
			return Promise.resolve(pw);
		else
			return BCrypt.hash(pw, 10);
	}

	function pw_compare(pw, hash) {
		if (typeof pw === 'undefined')
			return Promise.resolve(typeof hash === 'undefined');
		else
			return BCrypt.compare(pw, hash);
	}

	/**
	 * This a Passport strategy, radically cut-down from passport-local.
	 * It is required because passport-local logins fail on null password,
	 * and we specifically want to support this.
	 */
	class XanadoPass extends Strategy {
		constructor(verify) {
			super();
			this.name = 'xanado';
			this._verify = verify;
		}

		authenticate(req) {
			const user = req.body.login_username;
			const pass = req.body.login_password;
			return this._verify(user, pass)
			.then(uo => this.success(uo))
			.catch (e => this.error([ e.message, user ]));
		}
	}

	/**
	 * Manage user login, registration, password reset using Express
	 * and Passport. User object will be kept in req, and contains
	 * { name:, email:, key:, pass: }
	 *
	 * This makes no pretence of being secure, it is simply a means to manage
	 * simple player login to a game.
	 * The routes added are:
	 * POST /register (name, email, pass)
	 * POST /login (name, pass)
	 * POST /logout
	 * POST /reset-password
	 * POST /change-password (pass)
	 * GET /reset-password/:token
	 * GET /session get the redacted user object for the logged-in player
	 */
	class UserManager {

		/**
		 * Construct, adding relevant routes to the given Express application
		 * @param {object} config system configuration object
		 * @param {object} config.auth authentication options
		 * @param {string} config.auth.sessionSecret secret to use with express
		 * sessions
		 * @param {string} config.auth.db_file path to json file that
		 * stores user information
		 * @param {object} config.auth.oauth2 OAuth2 providers
		 * @param {object} config.mail mail configuration for use with
		 * @param {Express} app Express application object
		 */
		constructor(config, app) {
			this.config = config;
			this.db = undefined;
			
			// Passport requires ExpressSession to be configured
			app.use(ExpressSession({
				secret: this.config.auth.sessionSecret,
				resave: false,
				saveUninitialized: false
			}));

			app.use(Passport.initialize());

			// Same as app.use(passport.authenticate('session')); 
			app.use(Passport.session());

			Passport.serializeUser((userObject, done) => {
				// Decide what info from the user object loaded from
				// the DB needs to be shadowed in the session as
				// req.user
				//console.debug("serializeUser", userObject);
				done(null, userObject);
			});

			Passport.deserializeUser((userObject, done) => {
				// Session active, look it up to get user
				//console.debug("deserializeUser",userObject);
				// attach user object as req.user
				done(null, userObject);
			});

			Passport.use(new XanadoPass(
				(user, pass) => this.getUser({ name: user, pass: pass })));

			// Load and configure oauth2 strategies
			const strategies = [];
			for (let provider in this.config.auth.oauth2) {
				strategies.push(new Promise(resolve => {
					const cfg = this.config.auth.oauth2[provider];
					// .module is used to override the strategy name
					// needed because passport-google-oauth20 declares
					// strategy "google"
					const module = cfg.module || `passport-${provider}`;
					requirejs([module], strategy => {
						this.setUpOAuth2Strategy(strategy, provider, cfg, app);
						resolve();
					});
				}));
			}
			Promise.all(strategies);

			// See if there is a current session
			app.get(
				'/session',
				(req, res) => this.handle_session(req, res));

			// Remember where we came from
			app.use((req, res, next) => {
				if (/(^|[?&;])origin=/.test(req.url))
					req.session.origin = decodeURI(
						req.url.replace(/^.*[?&;]origin=([^&;]*).*$/,"$1"));
				//console.debug("Remembering origin", req.session.origin);
				next();
			});

			// Register a new user
			app.post(
				'/register',
				(req, res, next) => this.handle_xanado_register(req, res, next));

			// Log in a user
			app.post(
				'/login',
				Passport.authenticate("xanado", { assignProperty: "userObject" }),
				(req, res) => {
					// error will -> 401
					req.userObject.provider = 'xanado';
					return this.passportLogin(req, res, req.userObject)
					.then(() => this.sendResult(res, 200, []));
				});
			
			app.get("/oauth2-providers",
					   (req, res) => this.handle_oauth2_providers(req, res));
			
			// Log out the current signed-in user
			app.post(
				'/logout',
				(req, res) => this.handle_logout(req, res));

			// Send a password reset email to the user with the given email
			app.post(
				'/reset-password',
				(req, res) => this.handle_xanado_reset_password(req, res));

			// Receive a password reset from a link in email
			app.get(
				'/reset-password/:token',
				(req, res) => this.handle_xanado_password_reset(req, res));

			// Change the password for the current user
			app.post(
				'/change-password',
				(req, res) => this.handle_xanado_change_password(req, res));
		}

		/**
		 * Call req.login to complete the login process
		 * @param {object} uo user object
		 * @private
		 */
		passportLogin(req, res, uo) {
			console.debug("passportLogin in", uo);
			return new Promise(resolve => {
				req.login(uo, () => {
					console.log(uo, "logged in");
					resolve(uo);
				});
			});
		}

		/**
		 * Load the user DB
		 * @return {Promise} promise that resolves to the DB
		 * @private
		 */
		getDB() {
			if (this.db)
				return Promise.resolve(this.db);
			
			return Lock.lock(this.config.auth.db_file)
			.then(release => Fs.readFile(this.config.auth.db_file)
				  .then(data => release()
						.then(() => JSON.parse(data))))
			.then(db => {
				this.db = db || [];
				return db;
			})
			.catch(e => (this.db = []));
		}

		/**
		 * Write the DB after an update e.g. user added, pw change etc
		 * @return {Promise} that resolves when the write completes
		 * @private
		 */
		writeDB() {
			const s = JSON.stringify(this.db, null, 1);
			return Fs.access(this.config.auth.db_file)
			.then(acc => Lock.lock(this.config.auth.db_file)
				  .then(release => Fs.writeFile(
					  this.config.auth.db_file, s)
						.then(() => release())))
			.catch(e => Fs.writeFile(this.config.auth.db_file, s)); // file does not exist
		}

		/**
		 * Promise to get the user object for the described user.
		 * You can lookup a user without name if you have email or key.
		 * But if you give name you also have to give password - unless
		 * ignorePass is explicitly set
		 * @param {object} desc user descriptor
		 * @param {string?} user user name
		 * @param {string?} pass user password, requires user.
		 * @param {string?} email user email
		 * @param {string?} key optionally force the key to this
		 * @param {boolean} ignorePass truw will ignore passwords
		 * @return {Promise} resolve to user object, or throw
		 * @private
		 */
		getUser(desc, ignorePass) {
			return this.getDB()
			.then(db => {
				for (let uo of db) {
					if (typeof desc.key !== 'undefined' && uo.key === desc.key)
						return uo;
					if (typeof desc.token !== 'undefined' && uo.token === desc.token) {
						delete uo.token;
						return this.writeDB()
						.then(() => uo);
					}
					if (typeof desc.name !== 'undefined' && uo.name === desc.name) {
						if (ignorePass)
							return uo;
						if (typeof uo.pass === 'undefined') {
							if (desc.pass === uo.pass)
								return uo;
							throw new Error(/*i18n*/'um-bad-pass');
						}
						return pw_compare(desc.pass, uo.pass)
						.then(ok => {
							if (ok)
								return uo;
							throw new Error(/*i18n*/'um-bad-pass');
						})
						.catch(e => {
							console.error("getUser", desc, "failed; bad pass", e);
							throw new Error(/*i18n*/'um-bad-pass');
						});
					}
					if (typeof desc.email !== 'undefined' && uo.email === desc.email)
						return uo;
				}
				console.error("getUser", desc, "failed; no such user");
				throw new Error(/*i18n*/'um-no-such-user');
			});
		}

		/**
		 * @private
		 */
		setUpOAuth2Strategy(strategy, provider, cfg, app) {
			if (!cfg.clientID || !cfg.clientSecret || !cfg.callbackURL)
				throw new Error("Misconfiguration", cfg);
			Passport.use(new strategy(
				cfg,
				(accessToken, refreshToken, profile, done) => {
					//console.debug("Logging in", profile.displayName);
					if (profile.emails && profile.emails.length > 0)
						profile.email = profile.emails[0].value;
					if (!profile.id || !profile.displayName)
						throw new Error("Misconfiguration .reprofile", profile);
					const key = `${provider}-${profile.id}`;
					this.getUser({ key: key })
					.catch(() => {
						// New user
						return this.addUser({
							name: profile.displayName,
							email: profile.email,
							provider: provider,
							key: key
						});
					})
					.then(uo => {
						if (!profile.email || uo.email === profile.email)
							return uo;
						uo.email = profile.email;
						if (!uo.provider)
							throw new Error("Provider expected in user object");
						return this.writeDB();
					})
					.then(uo => done(null, uo));
					// uo will end up in userObject
				}));

			// Login using oauth2 service
			// Note: this route MUST be a GET and MUST come from an href and
			// not an AJAX request, or CORS will foul up.
			app.get(
				`/oauth2/login/${provider}`,
				Passport.authenticate(provider));

			// oauth2 redirect target
			app.get(
				`/oauth2/callback/${provider}`,
				Passport.authenticate(provider, { assignProperty: "userObject" }),
				(req, res) => {
					// error will -> 401
					//console.debug("OAuth2 user is", req.userObject);
					req.login(req.userObject, () => {
						// Back to where we came from
						//console.debug("Redirect to",req.session.origin);
						res.redirect(req.session.origin);
					});
				});
		}

		/**
		 * Generate a unique key not already in the user DB. Assumes
		 * the DB is loaded.
		 * @return {string} unique 16-character string
		 * @private
		 */
		genKey() {
			let key, unique;
			do {
				do {
					key = Math.floor(1e16 + Math.random() * 9e15)
					.toString(36).substr(0, 10);
				} while (key === UserManager.ROBOT_KEY);

				unique = true;
				if (this.db) {
					for (let f of this.db) {
						if (key === f.key) {
							unique = false;
							break;
						}
					}
				}
			} while (!unique);
			return key;
		}

		/**
		 * Make a one-time token for use in password resets
		 * @param {Object} user user object
		 * @private
		 */
		setToken(user) {
			const token = Math.floor(1e16 + Math.random() * 9e15)
				  .toString(36).substr(0, 10);
			user.token = token;
			return this.writeDB()
			.then(() => token);
		}

		/**
		 * Add a new user to the DB, if they are not already there
		 * @param {object} desc user descriptor
		 * @param {string} desc.user user name
		 * @param {string} desc.provider authentication provider e.g. google
		 * @param {string?} desc.pass user password, requires user.
		 * Will be encrypted if defined before saving.
		 * @param {string?} desc.email user email
		 * @param {string?} key optionally force the key to this
		 * @return {Promise} resolve to user object, or reject if duplicate
		 * @private
		 */
		addUser(desc) {
			if (!desc.key)
				desc.key = this.genKey();
			return pw_hash(desc.pass)
			.then(pw => {
				if (typeof pw !== 'undefined')
					desc.pass = pw;
				console.log("Add user", desc);
				this.db.push(desc);
				return this.writeDB()
				.then(() => desc);
			});
		}

		/**
		 * @private
		 */
		sendResult(res, status, info) {
			console.debug(`<-- ${status}`, info);
			res.status(status).send(info);
		}

		/**
		 * @private
		 */
		handle_xanado_register(req, res, next) {
			const username = req.body.register_username;
			const email = req.body.register_email;
			const pass = req.body.register_password;
			if (!username)
				return this.sendResult(
					res, 500, [ /*i18n*/'um-bad-user', username ]);
			return this.getUser({name: username }, true)
			.then(() => {
				this.sendResult(
					res, 403, [ /*i18n*/'um-user-exists', username ]);
			})
			.catch(() => {
				// New user
				return this.addUser({
					name: username,
					email: email,
					provider: 'xanado',
					pass: pass
				})
				.then(userObject => this.passportLogin(req, res, userObject))
				.then(() => this.handle_session(req, res));
			});
		}

		/**
		 * Get a list of oauth2 providers
		 */
		handle_oauth2_providers(req, res) {
			const list = [];
			for (let name in this.config.auth.oauth2) {
				const cfg = this.config.auth.oauth2[name];
				list.push({ name: name, logo: cfg.logo });
			}
			this.sendResult(res, 200, list);
		}

		/**
		 * Simply forgets the user, doesn't log OAuth2 users out from the provider.
		 * @private
		 */
		handle_logout(req, res, next) {
			if (req.session
				&& req.session.passport
				&& req.session.passport.user
				&& req.logout) {
				const departed = req.session.passport.user.name;
				console.log("Logging out", departed);
				req.logout();
				return this.sendResult(res, 200, [
					/*i18n*/'um-logged-out', departed ]);
			}
			return this.sendResult(
				res, 500, [ /*i18n*/'um-not-logged-in' ]);
		}

		/**
		 * @private
		 */
		handle_xanado_change_password(req, res) {
			if (req.session
				&& req.session.passport
				&& req.session.passport.user) {
				const pass = req.body.password;
				const userObject = req.session.passport.user;
				userObject.pass = pass;
				return this.writeDB()
				.then(() => this.sendResult(res, 200, [
					/*i18n*/'um-pass-changed',
					req.session.passport.user.name ]));
			}
			return this.sendResult(
				res, 500, [ /*i18n*/'um-not-logged-in' ]);
		}

		/**
		 * @private
		 */
		handle_xanado_reset_password(req, res) {
			const email = req.body.reset_email;
			//console.debug(`/reset-password for ${email}`);
			if (!email)
				return this.sendResult(
					res, 500, [ /*i18n*/'um-unknown-email' ]);
			const surly = `${req.protocol}://${req.get('Host')}`;
			return this.getUser({email: email})
			.then(user => {
				return this.setToken(user)
				.then(token => {
					const url = `${surly}/reset-password/${token}`;
					console.log(`Send password reset ${url} to ${user.email}`);
					if (!this.options.mail)
						return this.sendResult(res, 500, [
							/*i18n*/'um-mail-not-configured' ]);
					return this.options.mail.transport.sendMail({
						from: this.options.mail.sender,
						to:  user.email,
						subject: Platform.i18n('um-password-reset'),
						text: Platform.i18n('um-reset-text', url),
						html: Platform.i18n('um-reset-html', url)
					})
					.then(() => this.sendResult(
						res, 403, [ /*i18n*/'um-reset-sent', user.name ]))
					.catch(e => {
						console.error("WARNING: Mail misconfiguration?", e);
						return this.sendResult(
							res, 500, [	/*i18n*/'um-mail-not-configured' ]);
					});
				});
			})
			.catch(e => this.sendResult(res, 403, [ e.message, email ]));
		}

		/**
		 * @private
		 */
		handle_password_reset(req, res) {
			console.log(`Password reset ${req.params.token}`);
			return this.getUser({token: req.params.token})
			.then(userObject => this.passportLogin(req, res, userObject))
			.then(() => res.redirect('/'))
			.catch(e => this.sendResult(res, 500, [	e.message ]));
		}

		/**
		 * Report who is logged in. This will return a redacted user
		 * object, with just the user name and uniqe key
		 * @private
		 */
		handle_session(req, res) {
			if (req.user)
				// Return redacted user object
				return this.sendResult(res, 200, {
					name: req.user.name,
					provider: req.user.provider,
					key: req.user.key
				});

			return this.sendResult(res, 401, [	'not-logged-in' ]);
		}

		/**
		 * Middleware to check if a user is signed in. Use it with
		 * any route where a logged-in user is required.
		 * @private
		 */
		checkLoggedIn(req, res, next) {
			if (req.isAuthenticated())
				return next();
			return this.sendResult(res, 401, [ /*i18n*/'um-not-logged-in' ]);
		}
	}

	UserManager.ROBOT_KEY = 'babefacebabeface';

	return UserManager;
});
