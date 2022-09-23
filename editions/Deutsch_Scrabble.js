// Deutsch
// @see https://en.wikipedia.org/wiki/Scrabble_letter_distributions#German
define(["editions/_Scrabble"], Scrabble => {

  const scrabble = Scrabble();

  scrabble.bag = [
    { letter: "A", score: 1, count: 5 },
    { letter: "B", score: 3, count: 2 },
    { letter: "C", score: 4, count: 2 },
    { letter: "D", score: 1, count: 4 },
    { letter: "E", score: 1, count: 15 },
    { letter: "F", score: 4, count: 2 },
    { letter: "G", score: 2, count: 3 },
    { letter: "H", score: 2, count: 4 },
    { letter: "I", score: 1, count: 6 },
    { letter: "J", score: 6, count: 1 },
    { letter: "K", score: 4, count: 2 },
    { letter: "L", score: 2, count: 3 },
    { letter: "M", score: 3, count: 4 },
    { letter: "N", score: 1, count: 9 },
    { letter: "O", score: 2, count: 3 },
    { letter: "P", score: 4, count: 1 },
    { letter: "Q", score: 10, count: 1 },
    { letter: "R", score: 1, count: 6 },
    { letter: "S", score: 1, count: 7 },
    { letter: "T", score: 1, count: 6 },
    { letter: "U", score: 1, count: 6 },
    { letter: "V", score: 6, count: 1 },
    { letter: "W", score: 3, count: 1 },
    { letter: "X", score: 8, count: 1 },
    { letter: "Y", score: 10, count: 1 },
    { letter: "Z", score: 3, count: 1 },
    { letter: "Ä", score: 6, count: 1 },
    { letter: "Ö", score: 8, count: 1 },
    { letter: "Ü", score: 6, count: 1 },
    { score: 0, count: 2 }
  ];

  return scrabble;
});
