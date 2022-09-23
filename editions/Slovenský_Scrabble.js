// Slovenský
// @see https://en.wikipedia.org/wiki/Scrabble_letter_distributions#Slovak
define(["editions/_Scrabble"], Scrabble => {

  const scrabble = Scrabble();

  scrabble.bag = [
    { letter: "A", score: 1, count: 9 },
    { letter: "B", score: 4, count: 2 },
    { letter: "C", score: 4, count: 1 },
    { letter: "D", score: 2, count: 3 },
    { letter: "E", score: 1, count: 8 },
    { letter: "F", score: 8, count: 1 },
    { letter: "G", score: 8, count: 1 },
    { letter: "H", score: 4, count: 1 },
    { letter: "I", score: 1, count: 5 },
    { letter: "J", score: 3, count: 2 },
    { letter: "K", score: 2, count: 3 },
    { letter: "L", score: 2, count: 3 },
    { letter: "M", score: 2, count: 4 },
    { letter: "N", score: 1, count: 5 },
    { letter: "O", score: 1, count: 9 },
    { letter: "P", score: 2, count: 3 },
    { letter: "R", score: 1, count: 4 },
    { letter: "S", score: 1, count: 4 },
    { letter: "T", score: 1, count: 4 },
    { letter: "U", score: 3, count: 2 },
    { letter: "V", score: 1, count: 4 },
    { letter: "X", score: 10, count: 1 },
    { letter: "Y", score: 4, count: 1 },
    { letter: "Z", score: 4, count: 1 },
    { letter: "Á", score: 4, count: 1 },
    { letter: "Ä", score: 10, count: 1 },
    { letter: "É", score: 7, count: 1 },
    { letter: "Í", score: 5, count: 1 },
    { letter: "Ó", score: 10, count: 1 },
    { letter: "Ô", score: 8, count: 1 },
    { letter: "Ú", score: 7, count: 1 },
    { letter: "Ý", score: 5, count: 1 },
    { letter: "Č", score: 5, count: 1 },
    { letter: "Ď", score: 8, count: 1 },
    { letter: "Ĺ", score: 10, count: 1 },
    { letter: "Ľ", score: 7, count: 1 },
    { letter: "Ň", score: 8, count: 1 },
    { letter: "Ŕ", score: 10, count: 1 },
    { letter: "Š", score: 5, count: 1 },
    { letter: "Ť", score: 7, count: 1 },
    { letter: "Ž", score: 5, count: 1 },
    { score: 0, count: 2 }
  ];

  return scrabble;
});
