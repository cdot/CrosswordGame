// Indonesian
// @see https://en.wikipedia.org/wiki/Scrabble_letter_distributions#Indonesian
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
      { letter: "A", score: 1, count: 19 },
      { letter: "B", score: 5, count: 4 },
      { letter: "C", score: 8, count: 3 },
      { letter: "D", score: 3, count: 4 },
      { letter: "E", score: 1, count: 8 },
      { letter: "F", score: 5, count: 1 },
      { letter: "G", score: 3, count: 3 },
      { letter: "H", score: 4, count: 2 },
      { letter: "I", score: 1, count: 8 },
      { letter: "J", score: 10, count: 1 },
      { letter: "K", score: 2, count: 3 },
      { letter: "L", score: 4, count: 3 },
      { letter: "M", score: 2, count: 3 },
      { letter: "N", score: 1, count: 9 },
      { letter: "O", score: 1, count: 3 },
      { letter: "P", score: 4, count: 2 },
      { letter: "R", score: 1, count: 4 },
      { letter: "S", score: 1, count: 3 },
      { letter: "T", score: 1, count: 5 },
      { letter: "U", score: 1, count: 5 },
      { letter: "V", score: 5, count: 1 },
      { letter: "W", score: 8, count: 1 },
      { letter: "Y", score: 5, count: 2 },
      { letter: "Z", score: 10, count: 1 },
      { score: 0, count: 2 }
    ]};

});
