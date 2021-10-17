/* See README.md at the root of this distribution for copyright and
   license information */
/* eslint-env amd, node, jquery */

define('game/Board', ['game/Surface', 'game/Tile', 'game/Move'], (Surface, Tile, Move) => {

	class Board extends Surface {

		/**
		 * @param {Edition} edition the edition defining the board layout
		 */
		constructor(edition) {
			super(edition.cols, edition.rows,
				  (col, row) => edition.squareType(col, row));

			// Copy essentials from the Edition, so we don't have
			// to serialise it
			this.bonuses = edition.bonuses;
			this.rackCount = edition.rackCount;
			this.swapCount = edition.swapCount;
			this.midrow = Math.floor(edition.rows / 2);
			this.midcol = Math.floor(edition.cols / 2);
		}

		/**
		 * Load the board from the string representation output by
		 * toString. This is for use in tests.
		 * @param {string} sboard string representation of the board
		 * @param {Edition} edition the edition defining the board layout
		 */
		parse(sboard, edition) {
			const rows = sboard.split('\n');
			let row = 0;
			while (row < this.rows && row < rows.length) {
				const r = rows[row].split('|');
				let col = 1;
				while (col < this.cols && col < r.length) {
					const letter = r[col];
					if (letter != ' ') {
						// Treat lower-case letters as cast blanks.
						// May not work in non-latin languages.
						const isBlank = letter.toUpperCase() != letter;
						const tile = new Tile({
							letter: letter.toUpperCase(),
							isBlank: isBlank,
							score: isBlank ? 0	: edition.letterScore(letter)
						});
						this.at(col, row).placeTile(tile, true);
					}
					col++;
				}
				row++;
			}
		}

		/**
		 * Debug
		 */
		toString() {
			let s = `Board ${this.cols}x${this.rows}\n`;

			for (let row = 0; row < this.rows; row++) {
				const r = [];
				for (let col = 0; col < this.cols; col++) {
					const square = this.at(col, row);
					const t = square.tile;
					if (t) {
						// Show cast blanks using lower case letters
						// May not work in non-Latin languages.
						if (t.isBlank)
							r.push(t.letter.toLowerCase());
						else
							r.push(t.letter);
					} else {
						if (square.letterScoreMultiplier > 1)
							r.push(square.letterScoreMultiplier);
						else if (square.wordScoreMultiplier > 1)
							r.push(4 + square.wordScoreMultiplier);
						else
							r.push(' ');
					}
				}
				s += `|${r.join('|')}|\n`;
			}
			return s;
		}
		
		/**
		 * True if one of the neighbours of [col, row] is already occupied by
		 * a tile that was placed in a previous move
		 * @param {number} col 0-based row
		 * @param {number} row 0-based row
		 */
		touchingOld(col, row) {
			return (
				(col > 0 && this.at(col - 1, row).tile
				 && this.at(col - 1, row).tileLocked)
				|| (col < this.cols - 1 && this.at(col + 1, row).tile
					&& this.at(col + 1, row).tileLocked)
				|| (row > 0 && this.at(col, row - 1).tile
					&& this.at(col, row - 1).tileLocked)
				|| (row < this.rows - 1 && this.at(col, row + 1).tile
					&& this.at(col, row + 1).tileLocked));
		}

		/**
		 * Calculate score for all words that involve new tiles.
		 * This is used on the UI side, when the placement may be fragmented
		 * and difficult to analyse.
		 * @param {Move.wordSpec[]} words list to update
		 * @return {number} the total score
		 * @private
		 */
		scoreNewWords(words) {
			let totalScore = 0;
			let row, col;
			
			const taste = (dcol, drow) => {			
				let wordScore = 0;
				let letters = '';
				let wordMultiplier = 1;
				let isNewWord = false;
				while (col < this.cols
					   && row < this.rows
					   && this.at(col, row).tile) {
					const square = this.at(col, row);
					let letterScore = square.tile.score;
					isNewWord = isNewWord || !square.tileLocked;
					if (!square.tileLocked) {
						letterScore *= square.letterScoreMultiplier;
						wordMultiplier *= square.wordScoreMultiplier;
					}
					wordScore += letterScore;
					letters += square.tile.letter;
					col += dcol;
					row += drow;
				}
				if (isNewWord) {
					wordScore *= wordMultiplier;
					totalScore += wordScore;
					words.push({
						word: letters,
						score: wordScore
					});
				}
			};

			for (row = 0; row < this.rows; row++)
				for (col = 0; col < this.cols - 1; col++)
					if (this.at(col, row).tile && this.at(col + 1, row).tile)
						taste(1, 0);
			
			for (col = 0; col < this.cols; col++)
				for (row = 0; row < this.rows - 1; row++)
					if (this.at(col, row).tile && this.at(col, row + 1).tile)
						taste(0, 1);
			
			return totalScore;
		}

		/**
		 * Given a play at col, row, compute its score.
		 * @param {number} col the col of the LAST letter
		 * @param {number} row the row of the LAST letter
		 * @param {number} dcol 1 if the word being played across
		 * @param {number} drow 1 if the word is being played down
		 * @param {Tile[]} tiles a list of Tiles that have been newly placed
		 * @param {string[]} words optional list to be populated with
		 * words that have been created by the play
		 * @return {number} the score of the play.
		 */
		scorePlay(col, row, dcol, drow, tiles, words) {

			// Accumulator for the primary word being formed by the tiles
			let wordScore = 0;

			// Accumulator for crossing words scores.
			let crossWordsScore = 0;

			// Multipler for the main word
			let wordMultiplier = 1;

			// Number of tiles being placed, for calculating bonus
			let tilesPlaced = 0;

			for (let tile of tiles) {
				const c = tile.col;
				const r = tile.row;

				let letterScore = tile.score;
				const square = this.at(c, r);

				if (square.tileLocked) {
					wordScore += letterScore;
					continue; // pre-existing tile, no bonuses
				}

				// Letter is being placed, so letter multiplier applies to all
				// new words created, including cross words
				letterScore *= square.letterScoreMultiplier;

				tilesPlaced++;

				wordScore += letterScore;

				// Multiplier for any new words that cross this letter
				const crossWordMultiplier = square.wordScoreMultiplier;
				wordMultiplier *= crossWordMultiplier;

				// This is a new tile, need to analyse cross words and
				// apply bonuses
				let crossWord = '';
				let crossWordScore = 0;

				// Look left/up
				for (let cp = c - drow, rp = r - dcol;
					 cp >= 0 && rp >= 0 && this.at(cp, rp).tile;
					 cp -= drow, rp -= dcol) {
					const tile = this.at(cp, rp).tile;
					crossWord = tile.letter + crossWord;
					crossWordScore += tile.score;
				}

				crossWord += tile.letter;

				// Look right/down
				for (let cp = c + drow, rp = r + dcol;
					 cp < this.cols && rp < this.rows
					 && this.at(cp, rp).tile;
					 cp += drow, rp += dcol) {
					const tile = this.at(cp, rp).tile;
					crossWord += tile.letter;
					crossWordScore += tile.score
				}

				if (crossWordScore > 0) {
					// This tile (and bonuses) contribute to cross words
					crossWordScore += letterScore;
					crossWordScore *= crossWordMultiplier;
					if (words)
						words.push({ word: crossWord, score: crossWordScore });

					crossWordsScore += crossWordScore;
				}
			}

			wordScore *= wordMultiplier;

			if (words)
				words.push({
					word: tiles.map(tile => tile.letter).join(''),
					score: wordScore
				});

			// Add cross word values to the main word value
			wordScore += crossWordsScore;

			return wordScore + this.calculateBonus(tilesPlaced);
		}

		/**
		 * Calculate the bonus if tilesPlaced tiles are placed
		 * Really belongs in Edition, but here because Edition is
		 * not sent to the client.
		 * @param {number} tilesPlaced
		 */
		calculateBonus(tilesPlaced) {
			if (typeof this.bonuses[tilesPlaced] === 'number')
				return this.bonuses[tilesPlaced];
			return 0;
		}

		/**
		 * UI-side move calculation. Constructs a {@link Move}
		 * @return {(Move|string)} Move or a string if there is a problem
		 */
		analyseMove() {
			// Check that the start field is occupied

			if (!this.at(this.midcol, this.midrow).tile)
				return 'warn-centre-must-be-used';

			// Determine that the placement of the Tile(s) is legal

			// Find top-leftmost placed tile
			let topLeftX, topLeftY, tile;
			this.forEachTiledSquare((square, col, row) => {
				if (square.tileLocked)
					return false;
				tile = square.tile;
				topLeftX = col;
				topLeftY = row;
				return true;
			});
			if (!tile)
				// Move can't be made. Should never happen
				// Terminal, no point in translating
				throw Error('No new tile found');

			// Remember which newly placed tile positions are legal
			const legalPlacements = new Array(this.cols);
			for (let col = 0; col < this.cols; col++)
				legalPlacements[col] = new Array(this.rows);

			legalPlacements[topLeftX][topLeftY] = true;

			let isTouchingOld = this.touchingOld(topLeftX, topLeftY);
			let horizontal = false;
			for (let col = topLeftX + 1; col < this.cols; col++) {
				if (this.at(col, topLeftY).isEmpty())
					break;
				if (!this.at(col, topLeftY).tileLocked) {
					legalPlacements[col][topLeftY] = true;
					horizontal = true;
					isTouchingOld =
					isTouchingOld || this.touchingOld(col, topLeftY);
				}
			}

			if (!horizontal) {
				for (let row = topLeftY + 1; row < this.rows; row++) {
					if (!this.at(topLeftX, row).tile) {
						break;
					} else if (!this.at(topLeftX, row).tileLocked) {
						legalPlacements[topLeftX][row] = true;
						isTouchingOld =
						isTouchingOld || this.touchingOld(topLeftX, row);
					}
				}
			}

			if (!isTouchingOld && !legalPlacements[this.midcol][this.midrow])
				return 'warn-disconnected';

			// Check whether there are any unconnected placements
			let totalTiles = 0;
			let disco = false;
			this.forEachTiledSquare((square, col, row) => {
				totalTiles++;
				disco = disco || (!square.tileLocked && !legalPlacements[col][row]);
			});
			
			if (disco)
				return 'warn-disconnected';

			if (totalTiles < 2)
				return 'warn-at-least-two';

			const placements = [];
			this.forEachTiledSquare(square => {
				if (!square.tileLocked) {
					placements.push(square.tile);
				}
			});
	
			const bonus = this.calculateBonus(placements.length);
			const words = [];
			const score = this.scoreNewWords(words) + bonus;
			return new Move(
				{
					placements: placements,
					score: score,
					bonus: bonus,
					words: words
				});
		}

		/**
		 * Create the DOM representation
		 * @return {jQuery}
		 */
		createDOM() {
			const $table = $('<table></table>');
			for (let row = 0; row < this.rows; row++) {
				const $tr = $('<tr></tr>');
				for (let col = 0; col < this.cols; col++) {
					const square = this.at(col, row);
					const $td = square.createDOM('Board', col, row);			
					if (col == this.midcol && row == this.midrow)
						$td.addClass('StartField');
					else if (square.type != '_')
						$td.addClass('SpecialField'); // score multiplier
					$tr.append($td);
				}
				$table.append($tr);
			}
			return $table;
		}
	}

	return Board;
});
