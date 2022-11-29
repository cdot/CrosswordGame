// Latin
// @see https://en.wikipedia.org/wiki/Scrabble_letter_distributions#Latin
define(() => {

  return {
    // Layout of lower-right quadrant, including middle row/col
    layout: [
      "M___d__T",
      "_d___d__",
      "__t___t_",
      "___D____",
      "d___D__d",
      "_d___D__",
      "__t___D_",
      "T___d__T",
    ],
    swapCount: 7,      // tiles on rack
    rackCount: 7,      // tiles swappable in a move
    bonuses: { 7: 50 }, bag: [
      { letter: "A", score: 1, count: 9 },
      { letter: "B", score: 4, count: 2 },
      { letter: "C", score: 2, count: 4 },
      { letter: "D", score: 2, count: 3 },
      { letter: "E", score: 1, count: 12 },
      { letter: "F", score: 8, count: 1 },
      { letter: "G", score: 4, count: 2 },
      { letter: "H", score: 8, count: 1 },
      { letter: "I", score: 1, count: 9 },
      { letter: "L", score: 2, count: 3 },
      { letter: "M", score: 2, count: 4 },
      { letter: "N", score: 2, count: 4 },
      { letter: "O", score: 1, count: 5 },
      { letter: "P", score: 4, count: 2 },
      { letter: "Q", score: 3, count: 3 },
      { letter: "R", score: 1, count: 7 },
      { letter: "S", score: 1, count: 8 },
      { letter: "T", score: 1, count: 8 },
      { letter: "V", score: 1, count: 9 },
      { letter: "X", score: 4, count: 2 },
      { score: 0, count: 2 }
    ]};

});
