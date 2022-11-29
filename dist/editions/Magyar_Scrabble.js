// Magyar
// @see https://en.wikipedia.org/wiki/Scrabble_letter_distributions#Hungarian
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
      { letter: "A", score: 1, count: 6 },
      { letter: "B", score: 2, count: 3 },
      { letter: "C", score: 5, count: 1 },
      { letter: "CS", score: 7, count: 1 },
      { letter: "D", score: 2, count: 3 },
      { letter: "E", score: 1, count: 6 },
      { letter: "F", score: 4, count: 2 },
      { letter: "G", score: 2, count: 3 },
      { letter: "GY", score: 4, count: 2 },
      { letter: "H", score: 3, count: 2 },
      { letter: "I", score: 1, count: 3 },
      { letter: "J", score: 4, count: 2 },
      { letter: "K", score: 1, count: 6 },
      { letter: "L", score: 1, count: 4 },
      { letter: "LY", score: 8, count: 1 },
      { letter: "M", score: 1, count: 3 },
      { letter: "N", score: 1, count: 4 },
      { letter: "NY", score: 5, count: 1 },
      { letter: "O", score: 1, count: 3 },
      { letter: "P", score: 4, count: 2 },
      { letter: "R", score: 1, count: 4 },
      { letter: "S", score: 1, count: 3 },
      { letter: "SZ", score: 3, count: 2 },
      { letter: "T", score: 1, count: 5 },
      { letter: "TY", score: 10, count: 1 },
      { letter: "U", score: 4, count: 2 },
      { letter: "V", score: 3, count: 2 },
      { letter: "Z", score: 4, count: 2 },
      { letter: "ZS", score: 8, count: 1 },
      { letter: "Á", score: 1, count: 4 },
      { letter: "É", score: 3, count: 3 },
      { letter: "Í", score: 5, count: 1 },
      { letter: "Ó", score: 2, count: 3 },
      { letter: "Ö", score: 4, count: 2 },
      { letter: "Ú", score: 7, count: 1 },
      { letter: "Ü", score: 4, count: 2 },
      { letter: "Ő", score: 7, count: 1 },
      { letter: "Ű", score: 7, count: 1 },
      { score: 0, count: 2 }
    ]};

});
