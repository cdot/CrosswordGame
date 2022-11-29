// Svenska
// @see https://en.wikipedia.org/wiki/Scrabble_letter_distributions#Swedish
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
      { letter: "A", score: 1, count: 8 },
      { letter: "B", score: 4, count: 2 },
      { letter: "C", score: 8, count: 1 },
      { letter: "D", score: 1, count: 5 },
      { letter: "E", score: 1, count: 7 },
      { letter: "F", score: 3, count: 2 },
      { letter: "G", score: 2, count: 3 },
      { letter: "H", score: 2, count: 2 },
      { letter: "I", score: 1, count: 5 },
      { letter: "J", score: 7, count: 1 },
      { letter: "K", score: 2, count: 3 },
      { letter: "L", score: 1, count: 5 },
      { letter: "M", score: 2, count: 3 },
      { letter: "N", score: 1, count: 6 },
      { letter: "O", score: 2, count: 5 },
      { letter: "P", score: 4, count: 2 },
      { letter: "R", score: 1, count: 8 },
      { letter: "S", score: 1, count: 8 },
      { letter: "T", score: 1, count: 8 },
      { letter: "U", score: 4, count: 3 },
      { letter: "V", score: 3, count: 2 },
      { letter: "X", score: 8, count: 1 },
      { letter: "Y", score: 7, count: 1 },
      { letter: "Z", score: 10, count: 1 },
      { letter: "Ä", score: 3, count: 2 },
      { letter: "Å", score: 4, count: 2 },
      { letter: "Ö", score: 4, count: 2 },
      { score: 0, count: 2 }
    ]};

});
