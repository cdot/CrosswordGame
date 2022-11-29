// Español
// @see https://en.wikipedia.org/wiki/Scrabble_letter_distributions#Spanish
define(["editions/_Scrabble"], Scrabble => {

  const scrabble = Scrabble();

  scrabble.bag = [
    { letter: "A", score: 1, count: 12 },
    { letter: "B", score: 3, count: 2 },
    { letter: "C", score: 3, count: 4 },
    { letter: "CH", score: 5, count: 1 },
    { letter: "D", score: 2, count: 5 },
    { letter: "E", score: 1, count: 12 },
    { letter: "F", score: 4, count: 1 },
    { letter: "G", score: 2, count: 2 },
    { letter: "H", score: 4, count: 2 },
    { letter: "I", score: 1, count: 6 },
    { letter: "J", score: 8, count: 1 },
    { letter: "L", score: 1, count: 4 },
    { letter: "LL", score: 8, count: 1 },
    { letter: "M", score: 3, count: 2 },
    { letter: "N", score: 1, count: 5 },
    { letter: "O", score: 1, count: 9 },
    { letter: "P", score: 3, count: 2 },
    { letter: "Q", score: 5, count: 1 },
    { letter: "R", score: 1, count: 5 },
    { letter: "RR", score: 8, count: 1 },
    { letter: "S", score: 1, count: 6 },
    { letter: "T", score: 1, count: 4 },
    { letter: "U", score: 1, count: 5 },
    { letter: "V", score: 4, count: 1 },
    { letter: "X", score: 8, count: 1 },
    { letter: "Y", score: 4, count: 1 },
    { letter: "Z", score: 10, count: 1 },
    { letter: "Ñ", score: 8, count: 1 },
    { score: 0, count: 2 }
  ];

  return scrabble;
});
