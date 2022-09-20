// Danish
// @see https://www.liquisearch.com/scrabble_letter_distributions/danish
define(["editions/_Scrabble"], Scrabble => {

  const scrabble = Scrabble();

  scrabble.bag = [
    { letter: "A", score: 1, count: 7 },
    { letter: "B", score: 3, count: 4 },
    { letter: "C", score: 8, count: 2 },
    { letter: "D", score: 2, count: 5 },
    { letter: "E", score: 1, count: 9 },
    { letter: "F", score: 3, count: 3 },
    { letter: "G", score: 3, count: 3 },
    { letter: "H", score: 4, count: 2 },
    { letter: "I", score: 3, count: 4 },
    { letter: "J", score: 4, count: 2 },
    { letter: "K", score: 3, count: 4 },
    { letter: "L", score: 2, count: 5 },
    { letter: "M", score: 3, count: 3 },
    { letter: "N", score: 1, count: 6 },
    { letter: "O", score: 2, count: 5 },
    { letter: "P", score: 4, count: 2 },
    { letter: "R", score: 1, count: 6 },
    { letter: "S", score: 2, count: 5 },
    { letter: "T", score: 2, count: 5 },
    { letter: "U", score: 3, count: 3 },
    { letter: "V", score: 3, count: 3 },
    { letter: "X", score: 8, count: 1 },
    { letter: "Y", score: 4, count: 2 },
    { letter: "Z", score: 8, count: 1 },
    { letter: "Å", score: 4, count: 2 },
    { letter: "Æ", score: 4, count: 2 },
    { letter: "Ø", score: 4, count: 2 },
    { score: 0, count: 2 }
  ];

  return scrabble;
});
