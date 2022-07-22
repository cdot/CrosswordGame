/*Copyright (C) 2019-2022 The Xanado Project https://github.com/cdot/Xanado
  License MIT. See README.md at the root of this distribution for full copyright
  and license information. Author Crawford Currie http://c-dot.co.uk*/
/* eslint-env amd, jquery */

define("game/Square", [
  "platform"
], Platform => {

	// Map the characters in the board template to CSS classes
	const CSS_CLASS =  {
		M: /*i18n*/"square-M",
		Q: /*i18n*/"square-Q",
		q: /*i18n*/"square-q",
		T: /*i18n*/"square-T",
		t: /*i18n*/"square-t",
		D: /*i18n*/"square-D",
		d: /*i18n*/"square-d",
		_: /*i18n*/"square-_"
	};

	/**
	 * A square on the game board or rack. A Tile holder with some
	 * underlying attributes; a position, an owner type, and a type that
	 * dictates the score multipliers that apply. The owner will be a
	 * subclass of {@linkcode Surface} (a {@linkcode Rack} or a {@linkcode Board})
	 */
	class Square {

		/**
     * @param {object} spec Specification
		 * @param {string} spec.type /^[QqTtSs_]$/ see {@linkcode Board}
		 * @param {string} spec.base base of #tag e.g. "Board_"
		 * @param {number} spec.col 0-based column where the square is
		 * @param {number?} spec.row 0-based row where the square is
		 * (undefined on a rack)
		 */
		constructor(spec) {
      /**
		   * /^[QqTtSs_]$/ see {@linkcode Board}
		   * @member {string}
		   */
			this.type = spec.type;

		  /**
		   * 0-based column where the square is.
		   * @member {number}
		   */
			this.col = spec.col;

		  /**
		   * Unique id for this square
		   * @member {string}
		   */
			this.id = `${spec.base}_${this.col}`;

			if (typeof spec.row !== "undefined") {
		    /**
		     * 0-based row where the square is (undefined on a 1D surface).
		     * @member {number?}
		     */
				this.row = spec.row;
				this.id += `x${this.row}`;
		    /**
		     * Flag indicating if this square is at a 2D position and
         * therefore on the game board.
		     * @member {boolean?}
		     */
        this.isOnBoard = true;
      }

      if (spec.tile) {
		    /**
		     * Tile placed on this square
		     * @member {Tile?}
		     */
		    this.tile = spec.tile;

		    if (spec.tileLocked)
		      /**
		       * True if the placed tile cannot be moved i.e. it was
		       * placed in a prior move. Locked tiles don't gather
		       * bonuses.
		       * @member {boolean}
           * @private
		       */
          this.tileLocked = true;
      }

		  if (spec.underlay)
        /**
		     * Underlay character to put in the background of the square when
		     * there is no tile present.
		     * @member {string}
		     */
		    this.underlay = spec.underlay;

			// Determine score multipliers from type
			switch (this.type) {
			case "d":
		    /**
		     * Multiplier for letters using this square. Defaults to 1 if undefined.
		     * @member {number}
		     */
        this.letterScoreMultiplier = 2;
        break;
			case "t": this.letterScoreMultiplier = 3; break;
			case "q": this.letterScoreMultiplier = 4; break;
			case "M":
			case "D":
		    /**
		     * Multiplier for words using this square. Defaults to 1 if undefined.
		     * @member {number}
		     */
        this.wordScoreMultiplier = 2;
        break;
			case "T": this.wordScoreMultiplier = 3; break;
			case "Q": this.wordScoreMultiplier = 4; break;
			}
		}

		/**
		 * @return true if the square doesn't have a tile placed on it
		 */
		isEmpty() {
			return !this.tile;
		}

    /**
     * @return {boolean} true if a tile is placed and it is locked
     */
    isLocked() {
      return this.tile && this.tileLocked;
    }

		/**
		 * Place a tile on this square. Tiles are locked when a play is
		 * committed to a Board.
		 * @param {Tile} tile the tile to place
		 * @param {boolean} [lock] whether the tile is to be locked to
		 * the square (fixed on the board).
     * @return {Tile?} tile unplaced from the square, if any
		 */
		placeTile(tile, lock) {
      if (this.tile)
        debugger;
			Platform.assert(!this.tile || tile !== this.tile,
				              `Square already occupied: ${this.stringify()} placing ${tile.stringify()}`);

      const oldTile = this.tile;
			tile.col = this.col;
			if (typeof this.row !== "undefined")
				tile.row = this.row;
			this.tile = tile;

      if (lock)
        this.tileLocked = true;

			// Used in the UI to update the square
			Platform.trigger("SquareChanged", [ this ]);

      return oldTile;
		}

		/**
		 * Remove the tile placed on this square.
     * @return {Tile?} tile unplaced from the square, if any
		 */
    unplaceTile() {
			// Note that a locked tile might be unplaced as
			// part of undoing a challenged play. Only then should
      // the tile letter be reset.
      const unplaced = this.tile;
			if (unplaced) {
        if (this.tileLocked) {
					unplaced.reset(); // clear letter
          delete this.tileLocked;
        }
        delete unplaced.col;
        delete unplaced.row;
				delete this.tile;

			  Platform.trigger("SquareChanged", [ this ]);
        return unplaced;
      }
      return undefined;
    }

		/**
		 * Create the jquery representation
		 * @param {string} base for id='s
		 */
		$ui() {
			const $td = $(`<td></td>`);
			$td.addClass(`square-${this.type}`);
			const $div = $(`<div id="${this.id}"><a></a></div>`);
			// Associate the square with the div for dragging
			$div.data("square", this);
			$td.append($div);
			return $td;
		}

		$refresh() {
			const $div = $(`#${this.id}`);

			/* istanbul ignore if */
			if ($div.length === 0)
				// No visual representation for this square - for
				// example, might be a square in another player's rack
				return;

			$div.removeClass("selected")
			.removeClass("temporary")
			.off("click");

			if (this.tile)
				this.refreshOccupied($div);
			else
				this.refreshEmpty($div);
		}

		/**
		 * Set the underlay; UI
		 * @param {boolean} sel 
		 */
		setUnderlay(ch) {
			this.underlay = ch;
		}

		/**
		 * Set the square as (un)selected; UI
		 * @param {boolean} sel 
		 */
		setSelected(sel) {
			/* istanbul ignore if */
			if (sel && this.tile) {
				Platform.assert(!this.tileLocked, "Attempt to select locked tile");
				$(`#${this.id}`).addClass("selected");
			} else
				$(`#${this.id}`).removeClass("selected");
		}

		/**
		 * Update a square that has a Tile dropped on it
		 * @param {jQuery} $div the <div> for the square
     * @private
		 */
		refreshOccupied($div) {
			if ($div.hasClass("ui-droppable"))
				/* istanbul ignore next */
				$div.droppable("destroy");

			$div
			.removeClass("empty-square")
			.addClass("tiled-square");

			if (this.tile.isBlank)
				$div.addClass("blank-letter");
			else
				$div.removeClass("blank-letter");

			if (this.tileLocked) {
				$div.addClass("Locked");
				if ($div.hasClass("ui-draggable"))
					/* istanbul ignore next */
					$div.draggable("destroy");
			} else {
				// tile isn't locked, valid drag source
				$div.removeClass("Locked");
				/* istanbul ignore next */
				$div
				.addClass("temporary")
				.on("click", () => Platform.trigger("SelectSquare", [ this ]));

				/* istanbul ignore next */
				$div.draggable({
					revert: "invalid",
					opacity: 1,
					helper: "clone",

					start: (event, jui) => {
						$div.css({ opacity: 0.5 });
						// Clear selection
						Platform.trigger("SelectSquare");
						// Configure drag helper
						$(jui.helper)
						.animate({"font-size" : "120%"}, 300)
						.addClass("drag-border");
					},

					drag: (event, jui) => $(jui.helper).addClass("drag-border"),

					stop: () => $div.css({ opacity: 1 })
				});
			}

			const letter = this.tile.letter;
			const score = this.tile.score;
			const $a = $("<a></a>");
			$a.append(`<span class="letter">${letter}</span>`);
			$a.append(`<span class="score">${score}</span>`);
			$div.empty().append($a);
		}

		/**
		 * Update a square that doesn't have a Tile dropped on it
		 * @param {jQuery} $div the <div> for the square
     * @private
		 */
		refreshEmpty($div) {

			// Not draggable
			if ($div.hasClass("ui-draggable"))
				/* istanbul ignore next */
				$div.draggable("destroy");

			// no tile on the square, valid drop target
			$div
			.removeClass("tiled-square")
			.removeClass("blank-letter")
			.removeClass("Locked")
			.addClass("empty-square");

			/* istanbul ignore next */
			$div.on("click", () => Platform.trigger("SelectSquare", [ this ]))
			// Handle something dropping on us
			.droppable({
				hoverClass: "drop-active",
				drop: (event, jui) => {
					const source = $(jui.draggable).data("square");
					// Tell the main UI about it
					Platform.trigger("DropSquare", [ source, this ]);
				}
			});

			const text = Platform.i18n(`square-${this.type}`);
			$div.empty().append($("<a></a>").text(text));

			if (typeof this.underlay !== "undefined")
				$div.append(`<div class="underlay">${this.underlay}</div>`);
		}

    /* istanbul ignore next */
    /**
     * Generate debug representation
     */
		stringify() {
			// All squares have a col
			let string = `${this.type} square @ ${this.col}`;
			// Squares on the board have a row too
			if (this.row >= 0)
				string += "," + this.row;

			if (this.tile) {
				string += ` => ${this.tile}`;
				if (this.tileLocked)
					string += " (Locked)";
			}
			return string;
		}
	}		

	return Square;
});
