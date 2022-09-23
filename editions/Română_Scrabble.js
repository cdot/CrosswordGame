// Română
// @see https://en.wikipedia.org/wiki/Scrabble_letter_distributions#Romanian
define(["editions/_Scrabble"], Scrabble => {

  const scrabble = Scrabble();

  scrabble.bag = [
    { letter: "A", score: 1, count: 11 },
    { letter: "B", score: 9, count: 2 },
    { letter: "C", score: 1, count: 5 },
    { letter: "D", score: 2, count: 4 },
    { letter: "E", score: 1, count: 9 },
    { letter: "F", score: 8, count: 2 },
    { letter: "G", score: 9, count: 2 },
    { letter: "H", score: 10, count: 1 },
    { letter: "I", score: 1, count: 10 },
    { letter: "J", score: 10, count: 1 },
    { letter: "L", score: 1, count: 4 },
    { letter: "M", score: 4, count: 3 },
    { letter: "N", score: 1, count: 6 },
    { letter: "O", score: 1, count: 5 },
    { letter: "P", score: 2, count: 4 },
    { letter: "R", score: 1, count: 7 },
    { letter: "S", score: 1, count: 5 },
    { letter: "T", score: 1, count: 7 },
    { letter: "U", score: 1, count: 6 },
    { letter: "V", score: 8, count: 2 },
    { letter: "X", score: 10, count: 1 },
    { letter: "Z", score: 10, count: 1 },
    { score: 0, count: 2 }
  ];

  return scrabble;
});
