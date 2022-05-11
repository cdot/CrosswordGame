/*Copyright (C) 2019-2022 The Xanado Project https://github.com/cdot/Xanado
License MIT. See README.md at the root of this distribution for full copyright
and license information*/
/* eslint-env browser, jquery */

/**
 * Browser implementation of game/Platform. See js/game/Platform.js
 * for the abstract base class.  Note there is no Platform.Database
 * implementation for the browser.
 */
define("platform", [ "game/Platform" ], (Platform) => {

	/**
	 * Implementation of game/Platform
	 * @implements Platform
	 */
	class BrowserPlatform extends Platform {
		/** See {@link Platform#trigger} for documentation */
		static trigger(e, args) {
			// Pass events straight to the document
			return $(document).trigger(e, args);
		}

		/** See {@link Platform#getResource} for documentation */
		static getResource(path) {
			return $.get(path);
		}

		static findBestPlay() {
			// NOP, not available in browser
		}

		/** See {@link Platform#i18n} for documentation */
		static i18n() {
			return $.i18n.apply(null, arguments);
		}
	}

	return BrowserPlatform;
});
