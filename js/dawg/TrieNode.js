/* See README.md at the root of this distribution for copyright and
   license information */
/* eslint-env amd, node */

/**
 * A Trie/DAWG node.
 * Represents a letter in a set of words. The node may prepresent the end.
 * It has pointers to a child list representing the next letters that can
 * follow this letter, and a next pointer to the next alternative to this
 * letter in the child list of it's parent node.
 * Note this is only used while generating a DAWG from a Lexicon. TrieNodes
 * are serialised using the above structure but are then rebuilt using
 * LetterNodes at the sharp end.
 */
define('dawg/TrieNode', () => {

	// Second integer of node tuple is encoded
	const END_OF_WORD_BIT_MASK = 0x1;
	const END_OF_LIST_BIT_MASK = 0x2;
	const CHILD_INDEX_SHIFT = 2;

	let nodeIds = 0;

	class TrieNode {
		/**
		 * @param letter codepoint
		 * @param next next node pointer
		 * @param isWordEnding true if this is an end-of-word node
		 * @param starterDepth The maximum depth below this node before the
		 * end-of-word is reached, for the first word added
		 * @param isFirstChild is the first child of the parent node
		 */
		constructor(letter, next, isWordEnding, starterDepth, isFirstChild) {
			this.letter = letter; 
			this.next = next;
			this.isEndOfWord = isWordEnding;
			this.maxChildDepth = starterDepth;
			this.isFirstChild = isFirstChild;

			// first child node
			this.child = null;

			// optimisation for comparison
			this.numberOfChildren = 0;
			// will be set true if the node is to be pruned
			this.isPruned = false;
			// not assigned yet
			this.index = -1;

			this.id = nodeIds++;
		}

		toString() {
			let simpler = `{${this.id} ${this.letter}`;

			if (this.isEndOfWord)
				simpler += '.';
			if (this.child)
				simpler += '+';
			if (this.next)
				simpler += '-';

			return `${simpler}}`;
		}

		/**
		 * Mark a node as pruned, and recursively mark every node
		 * under and after it as well
		 * @return the total number of nodes pruned as a result
		 */
		prune() {
			if (this.isPruned)
				return 0;
			//console.log(`Prune ${this}`);
			this.isPruned = true;

			let result = 0;
			if (this.next)
				result += this.next.prune();
			if (this.child)
				result += this.child.prune();

			return result + 1;
		}

		/**
		 * Depth-first tree walk. Will visit ends of words in
		 * sorted order. Caution; this is NOT the same as dawg/Node.eachWord.
		 * @param nodes list of nodes visited to create the word
		 * @param cb callback function, takes list of nodes on the path
		 * from the root to the end of the word
		 */
		eachWord(nodes, cb) {

			nodes.push(this);

			if (this.isEndOfWord)
				cb(nodes);

			if (this.child)
				this.child.eachWord(nodes, cb);

			nodes.pop();

			if (this.next)
				this.next.eachWord(nodes, cb);
		}

		/**
		 * Search along this's child next chain for a node with the 
		 * given letter.
		 * @param thisLetter letter to look for
		 * @return the node found, or null
		 */
		findChild(thisLetter) {
			let result = this.child;
			while (result) {
				if (result.letter === thisLetter)
					return result;
				if (result.letter > thisLetter)
					break;
				result = result.next;
			}
			return null;
		}

		/**
		 * Insert a letter in the child list of this node. The child
		 * list is sorted on letter
		 * @param thisLetter letter to add
		 * @param wordEnder true if this is the end of a word
		 * @param startDepth
		 */
		insertChild(thisLetter, wordEnder, startDepth) {
			this.numberOfChildren++;

			if (!this.child) {
				// child list does not exist yet
				this.child = new TrieNode(
					thisLetter, null, wordEnder, startDepth, true);
				return;
			}

			if (this.child.letter > thisLetter) {
				// thisLetter should be the first in the child list
				this.child.isFirstChild = false;
				this.child = new TrieNode(
					thisLetter, this.child, wordEnder, startDepth, true);
				return;
			}

			// thisLetter is not the first in the list
			let child = this.child;
			while (child.next) {
				if (child.next.letter > thisLetter)
					break;
				child = child.next;
			}
			child.next = new TrieNode(
				thisLetter, child.next, wordEnder, startDepth, false);
		}

		/**
		 * Determine if this and other are the parent nodes
		 * of equal Trie branches.
		 */
		sameSubtrie(other) {
			if (other === this) // identity
				return true;

			if (other === null
				|| other.letter !== this.letter
				|| other.maxChildDepth !== this.maxChildDepth
				|| other.numberOfChildren !== this.numberOfChildren
				|| other.isEndOfWord !== this.isEndOfWord
				|| this.child === null && other.child !== null
				|| this.child !== null && other.child === null
				|| this.next === null && other.next !== null
				|| this.next !== null && other.next === null)
				return false;

			if (this.child != null && !this.child.sameSubtrie(other.child))
				return false;

			if (this.next != null && !this.next.sameSubtrie(other.next))
				return false;

			return true;
		}

		/**
		 * Returns the first node in the red[maxChildDepth], that is
		 * identical to 'this'. If the function returns 'this'
		 * then it is the first of its kind in the
		 * Trie.
		 */
		findSameSubtrie(red) {
			//return red[this.maxChildDepth].find(n => this.sameSubtrie(n));
			let x;
			for (x = 0; x < red[this.maxChildDepth].length; x++)
				if (this.sameSubtrie(red[this.maxChildDepth][x]))
					break;
			if (red[this.maxChildDepth][x].isPruned)
				throw Error('Same subtrie equivalent is pruned!');
			return red[this.maxChildDepth][x];
		}

		/**
		 * Recursively replaces all redundant nodes in a trie with their
		 * first equivalent.
		 * @param red reduction structure
		 */
		replaceRedundantNodes(red) {

			if (!this.next && !this.child)
				// Leaf node
				return 0;

			let trimmed = 0;
			if (this.child) {
				if (this.child.isPruned) {
					//console.log(`Trimming ${this.child}`);
					// we have found a node that has been tagged for
					// as pruned, so let us replace it with its first
					// equivalent which isn't tagged.
					this.child = this.child.findSameSubtrie(red);
					if (this.child === null)
						throw Error('Something horrible');
					trimmed++;
				} else
					trimmed += this.child.replaceRedundantNodes(red);
			}

			// Traverse the rest of the 'Trie', but a 'TrieNode' that is
			// not a direct child will never be directly replaced.
			// This will allow the resulting 'Dawg' to fit into a
			// contiguous array of node lists.
			if (this.next)
				trimmed += this.next.replaceRedundantNodes(red);

			return trimmed;
		}

		/**
		 * Encode the node in a pair of integers. Requires node indices to have
		 * been established.
		 */
		encode(array) {
			array.push(this.letter.codePointAt(0));
			let numb = 0;
			if (this.child)
				numb |= (this.child.index << CHILD_INDEX_SHIFT);
			if (this.isEndOfWord)
				numb |= END_OF_WORD_BIT_MASK;
			if (!this.next)
				numb |= END_OF_LIST_BIT_MASK;
			array.push(numb);
		}
	}

	return TrieNode;
});
