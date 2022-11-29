// Esperanto
// @see https://www.liquisearch.com/scrabble_letter_distributions/esperanto
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
      { letter: "C", score: 4, count: 1 },
      { letter: "D", score: 2, count: 3 },
      { letter: "E", score: 1, count: 8 },
      { letter: "F", score: 3, count: 2 },
      { letter: "G", score: 3, count: 2 },
      { letter: "H", score: 8, count: 1 },
      { letter: "I", score: 1, count: 8 },
      { letter: "J", score: 2, count: 3 },
      { letter: "K", score: 2, count: 4 },
      { letter: "L", score: 1, count: 4 },
      { letter: "M", score: 2, count: 4 },
      { letter: "N", score: 1, count: 6 },
      { letter: "O", score: 1, count: 8 },
      { letter: "P", score: 2, count: 3 },
      { letter: "R", score: 1, count: 6 },
      { letter: "S", score: 1, count: 6 },
      { letter: "T", score: 1, count: 4 },
      { letter: "U", score: 1, count: 4 },
      { letter: "V", score: 3, count: 2 },
      { letter: "Z", score: 5, count: 1 },
      { letter: "Ĉ", score: 4, count: 2 },
      { letter: "Ĝ", score: 3, count: 2 },
      { letter: "Ĥ", score: 10, count: 1 },
      { letter: "Ĵ", score: 10, count: 1 },
      { letter: "Ŝ", score: 4, count: 1 },
      { letter: "Ŭ", score: 8, count: 1 },
      { score: 0, count: 2 }
    ]};

});
