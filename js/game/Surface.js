/* See README.md at the root of this distribution for copyright and
   license information */
/* eslint-env amd, node, jquery */

define('game/Surface', ['game/Square'], Square => {

	/**
	 * Base class of a 2D grid of {@link Sqaure} (a Rack or a Board)
	 */
	class Surface {

		/**
		 * @param {string} id unique id for the surface 
		 * @param {number} cols number of columns
		 * @param {number} rows number of rows (1 for a rack)
		 * @param {function} type function(col, row) returning the square type
		 */
		constructor(id, cols, rows, type) {

			if (typeof id !== 'string'
				|| typeof cols !== 'number'
				|| typeof rows !== 'number')
				throw Error("Bad parameters to Surface");

			/**
			 * Unique id for the surface 
			 * @member {string}
			 */
			this.id = id;

			/**
			 * Number of columns on the surface
			 * @member {number}
			 */
			this.cols = cols;

			/**
			 * Number of rows on the surface
			 * @member {number}
			 */
			this.rows = rows;

			/**
			 * rowsXcols array of Square
			 * @member {Square[][]}
			 * @private
			 */
			this.squares = [];

			for (let i = 0; i < cols; i++) {
				const row = [];
				for (let j = 0; j < rows; j++)
					row.push(new Square(
						type(i, j), this, i, rows > 1 ? j : undefined));
				this.squares.push(row);
			}
		}

		/**
		 * Get the square at [col][row]
		 */
		at(col, row) {
			return this.squares[col][row];
		}

		/**
		 * Call fn on every square, column major.
		 * @param {function} fn function(Square, col, row)
		 * Iteration will stop if fn returns true.
		 * @return {boolean} true if fn() returns true, false otherwise
		 */
		forEachSquare(fn) {
			for (let c = 0; c < this.cols; c++)
				for (let r = 0; r < this.rows; r++)
					if (fn(this.squares[c][r], c, r))
						return true;
			return false;
		}

		/**
		 * Call fn(square, col, row) on every square that has a tile
		 * @param {function} fn function(Square, col, row)
		 * Iteration will stop if the function returns true.
		 * @return {boolean} true if fn() returns true, false otherwise
		 */
		forEachTiledSquare(fn) {
			return this.forEachSquare((square, c, r) => {
				if (square.tile)
					return fn(square, c, r);
				return false;
			});
		}

		/**
		 * Call fn(square, col, row) on every square that has no tile.
		 * @param {function} fn function(Square, col, row)
		 * Iteration will stop if the function returns true.
		 * @return {boolean} true if fn() returns true, false otherwise
		 */
		forEachEmptySquare(fn) {
			return this.forEachSquare((square, c, r) => {
				if (!square.tile)
					return fn(square, c, r);
				return false;
			});
		}

		/**
		 * Get the number of squares currently occupied by a tile
		 * @return {number} number of occupied squares
		 */
		squaresUsed() {
			let count = 0;
			this.forEachTiledSquare(() => {
				count++;
				return false;
			});
			return count;
		}

		/**
		 * Get a list of the tiles placed on the surface
		 * @return {Tile[]} list of placed tiles
		 */
		tiles() {
			const tiles = [];
			this.forEachTiledSquare(square => {
				tiles.push(square.tile);
				return false;
			});
			return tiles;
		}

		/**
		 * Remove all tiles from the surface, return a list of tiles
		 * removed;
		 */
		empty() {
			const removed = [];
			this.forEachTiledSquare(square => {
				removed.push(square.tile);
				square.placeTile(null);
			});
			return removed;
		}

		/**
		 * Get the total of the scoring tiles placed on the
		 * surface. Does not apply square multipliers.
		 * @return {number} total score
		 */
		score() {
			return this.tiles().reduce((s, tile) => s + tile.score, 0);
		}

		/**
		 * Determine if the surface is empty of tiles
		 * @return {boolean} true if surface is empty
		 */
		isEmpty() {
			return this.tiles().length === 0;
		}

		/**
		 * Refresh the UI for all squares.  Must be implemented by
		 * subclasses.
		 */
		$ui() {
			throw Error("Pure virtual");
		}

		/**
		 * Refresh the UI for all squares on the surface.
		 */
		$refresh() {
			this.forEachSquare(s => s.$refresh());
		}
	}

	return Surface;
});
