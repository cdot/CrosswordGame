// Norsk
// @see https://en.wikipedia.org/wiki/Scrabble_letter_distributions#Norwegian
define(["editions/_Scrabble"], Scrabble => {

  const scrabble = Scrabble();

  scrabble.bag = [
    { letter: "A", score: 1, count: 7 },
    { letter: "B", score: 4, count: 3 },
    { letter: "C", score: 10, count: 1 },
    { letter: "D", score: 1, count: 5 },
    { letter: "E", score: 1, count: 9 },
    { letter: "F", score: 2, count: 4 },
    { letter: "G", score: 2, count: 4 },
    { letter: "H", score: 3, count: 3 },
    { letter: "I", score: 1, count: 5 },
    { letter: "J", score: 4, count: 2 },
    { letter: "K", score: 2, count: 4 },
    { letter: "L", score: 1, count: 5 },
    { letter: "M", score: 2, count: 3 },
    { letter: "N", score: 1, count: 6 },
    { letter: "O", score: 2, count: 4 },
    { letter: "P", score: 4, count: 2 },
    { letter: "R", score: 1, count: 6 },
    { letter: "S", score: 1, count: 6 },
    { letter: "T", score: 1, count: 6 },
    { letter: "U", score: 4, count: 3 },
    { letter: "V", score: 4, count: 3 },
    { letter: "W", score: 8, count: 1 },
    { letter: "Y", score: 6, count: 1 },
    { letter: "Å", score: 4, count: 2 },
    { letter: "Æ", score: 6, count: 1 },
    { letter: "Ø", score: 5, count: 2 },
    { score: 0, count: 2 }
  ];

  return scrabble;
});
