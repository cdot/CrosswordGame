/*Copyright (C) 2019-2022 The Xanado Project https://github.com/cdot/Xanado
  License MIT. See README.md at the root of this distribution for full copyright
  and license information. Author Crawford Currie http://c-dot.co.uk*/
/* eslint-env node */

/**
 * This is the node.js implementation of common/Platform. There is an
 * implementation for the browser, too, in js/browser/Platform.js
 */
define("platform", [
	"events", "fs", "proper-lockfile", "node-gzip", "get-user-locale", "path",
	"common/Platform", "common/Fridge"
], (
	Events, fs, Lock, Gzip, Locale, Path,
	Platform, Fridge
) => {

	const Fs = fs.promises;
	const emitter = new Events.EventEmitter();

	/**
	 * Simple file database implementing {@linkcode Database} for use
	 * server-side, where data is stored in files named the same as
	 * the key. There are some basic assumptions here:
	 * 1. Callers will filter the set of keys based on their requirements
	 * 2. Keys starting with . are forbidden
	 * 3. Key names must be valid file names
 	 */
	class FileDatabase extends Platform.Database {

		/**
		 * @param {string} path name of a pre-existing
		 * directory to store games in, relative to requirejs.toUrl. 
		 * @param {string} type will be used as the extension on file names
		 */
		constructor(path, type) {
			super(path, type);
			this.directory = ServerPlatform.getFilePath(path);
			this.type = type;
			this.re = new RegExp(`\\.${type}$`);
			this.locks = {};
		}

		/** See {@linkcode Database#keys|Database.keys} for documentation */
		keys() {
			return Fs.readdir(this.directory)
			.then(list =>
				    list.filter(f => this.re.test(f))
				    .map(fn => fn.replace(this.re, "")));
		}

		/** See {@linkcode Database#set|Database.set} for documentation */
		set(key, data) {
      /* istanbul ignore if */
			if (/^\./.test(key))
				throw Error(`Invalid DB key ${key}`);
			const fn = Path.join(this.directory, `${key}.${this.type}`);
			const s = JSON.stringify(Fridge.freeze(data), null, 1);
      //console.log("Writing", fn);
			return Fs.access(fn)
			.then(acc => {
				return Lock.lock(fn) // file exists
				.then(release => Fs.writeFile(fn, s)
					    .then(() => release()));
			})
			.catch(e => Fs.writeFile(fn, s)); // file does not exist
		}

		/** See {@linkcode Database#get|Database.get} for documentation */
		get(key, classes) {
			const fn = Path.join(this.directory, `${key}.${this.type}`);

			/* Locking doesn't work cleanly; locks are often left dangling,
			   despite our releasing them religiously.

			   return Lock.lock(fn)
			   .then(release => Fs.readFile(fn)
				 .then(data => release()
				 .then(() => {
				 console.debug(`Unlocked ${fn}`);
				 return Fridge.thaw(JSON.parse(data), classes);
				 })));
      */
			return Fs.readFile(fn)
			.then(data => {
				return Fridge.thaw(JSON.parse(data), classes);
			});
		}

		/** See {@linkcode Database#rm|Database.rm} for documentation */
		rm(key) {
			return Fs.unlink(Path.join(this.directory, `${key}.${this.type}`));
		}
	}

  /**
	 * Partial implementation of jquery i18n to support server-side
	 * string translations using the same data files as browser-side.
	 * Language files will be located by looking up the path for
	 * `./i18n/en.json`
	 */
  function I18N(s) {
    if (typeof s === "string") {
		  if (typeof ServerPlatform.TX[s] !== "undefined")
			  s = ServerPlatform.TX[s];
		  // TODO: support PLURAL
		  return s.replace(
			  /\$(\d+)/g,
			  (m, index) => arguments[index]);
    }
		return {
			load: locale => {
				let langdir = ServerPlatform.getFilePath(`i18n`);
				let langfile = Path.join(langdir, `${locale}.json`);
				// Try the full locale e.g. "en-US"
				return Fs.readFile(langfile)
				.catch(e => {
					// Try the first part of the locale i.e. "en"
					// from "en-US"
					langfile = Path.join(langdir,
										           `${locale.split("-")[0]}.json`);
					return Fs.readFile(langfile);
				})
				.catch(
          /* istanbul ignore next */
          e => {
					  // Fall back to "en"
					  langfile = Path.join(langdir, "en.json");
					  return Fs.readFile(langfile);
				  })
				.then(buffer => {
					ServerPlatform.TX = JSON.parse(buffer.toString());
				});
			}
		};
	}

	let asyncFindBestPlay, syncFindBestPlay;

	/**
	 * Implementation of {@linkcode Platform} for use in node.js.
	 * See {@linkcode FileDatabase} of the `Platform.Database` implementation,
	 * and {@linkcode I18N} for the `Platform.i18n` implementation.
	 * {@linkcode module:game/findBestPlay} is used to implement `findBestPlay`.
	 * @implements Platform
	 */
	class ServerPlatform extends Platform {
		/** See {@linkcode Platform#trigger|Platform.trigger} for documentation */
		static trigger(e, args) {
			emitter.emit(e, args);
		}

		/** See {@linkcode Platform#findBestPlay|Platform.findBestPlay} for documentation */
		static findBestPlay() {
			if (global.SYNC_FBP) // used for debug
			  // block this thread
        return syncFindBestPlay.apply(arguments);
      else
			  // use a worker thread
			  return asyncFindBestPlay.apply(null, arguments);
		}

		/** See {@linkcode Platform#getFilePath|Platform.getFilePath} for documentation */
		static getFilePath(p) {
			return Path.normalize(requirejs.toUrl(p || ""));
		}

		/** See {@linkcode Platform#readFile|Platform.readFile} for documentation */
		static readFile(p) {
			return Fs.readFile(p);
		}

		/** See {@linkcode Platform#readZip|Platform.readZip} for documentation */
		static readZip(p) {
			return Fs.readFile(p)
			.then(data => Gzip.ungzip(data));
		}
	}
	
  ServerPlatform.Database = FileDatabase;

	ServerPlatform.i18n = I18N;

	// Asynchronous load to break circular dependency
	requirejs([
    "game/findBestPlayController",
    "game/findBestPlay" ], (afbp, sfbp) => {
      asyncFindBestPlay = afbp;
      syncFindBestPlay = sfbp;
    });

	return ServerPlatform;
});

