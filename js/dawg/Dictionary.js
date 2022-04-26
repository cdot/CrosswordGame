/* See README.md at the root of this distribution for copyright and
   license information */
/* eslint-env amd, node */

define('dawg/Dictionary', [ 'platform', 'dawg/LetterNode' ], (Platform, LetterNode) => {

	// Constants used in interpreting the integer encoding of the DAWG
	const END_OF_WORD_BIT_MASK = 0x1;
	const END_OF_LIST_BIT_MASK = 0x2;
	const CHILD_INDEX_SHIFT = 2;
	const CHILD_INDEX_BIT_MASK = 0x3FFFFFFF;

	// Cache of dictionaries
	const dictionaries = {};

	/**
	 * Dictionary using a Directed Acyclic Word Graph (DAWG) in the
	 * format generated by DAWG_Compressor.js
	 * 
	 * Note that the DAWG uses letter indices, and not actual characters, to
	 * represent code points. To use this dictionary you also need an
	 * alphabet of code points sorted in the same order as that used to
	 * generate the DAWG.
	 */
	class Dictionary {

		/**
		 * @param {string} name name of the dictionary
		 * @param {(Buffer|Array)} data the DAWG data.
		 * It's actually an array of little-endian 4-byte integers.
		 */
		constructor(name, data) {
			this.name = name;
			const dv = new DataView(data);
			let index = 0;
			const numberOfNodes = dv.getUint32(4 * index++);
			const nodes = [];
			for (let i = 0; i < numberOfNodes; i++) {
				const letter = dv.getUint32(4 * index++);
				const node = new LetterNode(String.fromCodePoint(letter));
				const numb = dv.getUint32(4 * index++);
				if ((numb & END_OF_WORD_BIT_MASK) != 0)
					node.isEndOfWord = true;
				if ((numb & END_OF_LIST_BIT_MASK) == 0)
					node.next = i + 1;
				if (((numb >> CHILD_INDEX_SHIFT) & CHILD_INDEX_BIT_MASK) > 0)
					node.child = ((numb >> CHILD_INDEX_SHIFT) & CHILD_INDEX_BIT_MASK);
				//console.log(`${nodes.length} `,node);
				nodes.push(node);
			}
			// Convert node indices to pointers
			for (let i = 0; i < nodes.length; i++) {
				const node = nodes[i];
				if (typeof node.next === 'number')
					node.next = nodes[node.next];
				if (typeof node.child === 'number')
					node.child = nodes[node.child];
			}
			this.root = nodes[0];
			// Build forward and back lists
			this.root.buildLists();
			// Sequence index will be created on demand
			this.sequenceRoots = null;
		}

		/**
		 * Promise to load a dictionary.
		 * @param {string} name name of the dictionary to load
		 * @return {Promise} Promise that resolves to a {@link Dictionary}
		 */
		static load(name) {
			if (dictionaries[name])
				return Promise.resolve(dictionaries[name]);

			return new Promise(resolve => {
				const root = requirejs.toUrl('');
				return Platform.getResource(
					`${root}/dictionaries/${name}.dict`)
				.then(buffer => {
					dictionaries[name] = new Dictionary(name, buffer.buffer);
					console.log(`Loaded dictionary ${name}`);
					resolve(dictionaries[name]);
				});
			});
		}

		/**
		 * @callback Dictionary~wordCallback
		 * @param {string} word Word found
		 * @param {LetterNode} node Node where word was terminated
		 */

		/**
		 * Apply the callback to each of the words represented in the DAWG
		 * (potentially huge!)
		 * @param {Dictionary~wordCallback} callback function
		 */
		eachWord(callback) {
			return this.root.eachWord('', callback);
		}

		/**
		 * Return the Node that matches the last character
		 * in chars, starting from the root
		 * @param {string} chars characters that may be the root of a word
		 * @return {LetterNode} node found, or undefined
		 */
		match(chars) {
			return this.root.match(chars, 0);
		}

		/**
		 * Check if a word is in the dictionary
		 * @param {string} chars a word to check
		 * @return {boolean} true if the word is found, false otherwise
		 */
		hasWord(chars) {
			const m = this.root.match(chars, 0);
			return m && m.isEndOfWord;
		}

		/**
		 * Find anagrams of a set of letters.
		 * @param {string} theChars the letters, ' ' for an any-letter wildcard
		 * @return {Object<string, string>} a map of actual words to the letter
		 * sequence (using ' ' for blanks) that matched
		 */
		findAnagrams(theChars) {
			theChars = theChars.toUpperCase();

			if (theChars.length < 2)
				return [ theChars ];

			// Sort the list of characters. Not strictly needed,
			// just easier to debug.
			const sortedChars = theChars.split('').sort();

			//console.log('Sorted chars', sortedChars);
			const foundWords = {};
			this.root.findAnagrams('', '', sortedChars, foundWords);
			return foundWords;
		}

		/**
		 * For each letter of the alphabet, establish a list of valid
		 * start points, such that at least one start point must match()
		 * for any sequence of chars, or there can't possibly be a word.
		 * @private
		 */
		createSequenceRoots() {
			this.sequenceRoots = {};
			this.root.eachNode(node => {
				if (!this.sequenceRoots[node.letter])
					this.sequenceRoots[node.letter] = [node];
				else
					this.sequenceRoots[node.letter].push(node);
				return true;
			});
			console.log(`Created sequence roots for dictionary '${this.name}'`);
		}

		/**
		 * Get a list of the sequence roots for ch. The sequence roots
		 * are all those nodes that represent the character in any word.
		 * From a sequence root we can follow post or pre to extend the
		 * word in either direction.
		 */
		getSequenceRoots(ch) {
			if (!this.sequenceRoots)
				this.createSequenceRoots();
			return this.sequenceRoots[ch] || [];
		}

		/**
		 * Find start node for the character sequence
		 * in the sequence index i.e. it forms a valid sub-part of a word
		 * in the dictionary. This way we can quickly eliminate sequences
		 * such as 'QX' which are never found in the dictionary. Note that
		 * we don't have any way to reproduce the words that the sequence
		 * is a valid part of; that's not the point, this is intended to help
		 * eliminate invalid sequences when extending a word backwards from
		 * a seed letter.
		 * @private
		 */
		findSequence(seq) {
			if (!this.sequenceRoots)
				this.createSequenceRoots();
			const roots = this.sequenceRoots[seq[0]];
			if (!roots || roots.length == 0) {
				console.log(`'${seq[0]}' has no roots`);
				return false;
			}
			for (let root of roots) {
				if (root.match(seq, 0))
					return root;
			}
			// Not found
			return null;
		}

		/**
		 * Return true if a start node for the character sequence is found
		 * in the sequence index i.e. it forms a valid sub-part of a word
		 * in the dictionary. This way we can quickly eliminate sequences
		 * such as 'QX' which are never found in the dictionary. Note that
		 * we don't have any way to reproduce the words that the sequence
		 * is a valid part of; that's not the point, this is intended to help
		 * eliminate invalid sequences when extending a word backwards from
		 * a seed letter.
		 * @param {string} seq letter sequence
		 * @return {boolean} if a start node exists
		 */
		hasSequence(seq) {
			return this.findSequence(seq) != null;
		}
	}
	return Dictionary;
});