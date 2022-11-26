// Čeština
// @see https://en.wikipedia.org/wiki/Scrabble_letter_distributions#Czech
define(["editions/_Scrabble"], Scrabble => {

  const scrabble = Scrabble();

  scrabble.bag = [
    { letter: "A", score: 1, count: 5 },
    { letter: "B", score: 3, count: 2 },
    { letter: "C", score: 2, count: 3 },
    { letter: "D", score: 1, count: 3 },
    { letter: "E", score: 1, count: 5 },
    { letter: "F", score: 5, count: 1 },
    { letter: "G", score: 5, count: 1 },
    { letter: "H", score: 2, count: 3 },
    { letter: "I", score: 1, count: 4 },
    { letter: "J", score: 2, count: 2 },
    { letter: "K", score: 1, count: 3 },
    { letter: "L", score: 1, count: 3 },
    { letter: "M", score: 2, count: 3 },
    { letter: "N", score: 1, count: 5 },
    { letter: "O", score: 1, count: 6 },
    { letter: "P", score: 1, count: 3 },
    { letter: "R", score: 1, count: 3 },
    { letter: "S", score: 1, count: 4 },
    { letter: "T", score: 1, count: 4 },
    { letter: "U", score: 2, count: 3 },
    { letter: "V", score: 1, count: 4 },
    { letter: "X", score: 10, count: 1 },
    { letter: "Y", score: 2, count: 2 },
    { letter: "Z", score: 2, count: 2 },
    { letter: "Á", score: 2, count: 2 },
    { letter: "É", score: 3, count: 2 },
    { letter: "Í", score: 2, count: 3 },
    { letter: "Ó", score: 7, count: 1 },
    { letter: "Ú", score: 5, count: 1 },
    { letter: "Ý", score: 4, count: 2 },
    { letter: "Č", score: 4, count: 1 },
    { letter: "Ď", score: 8, count: 1 },
    { letter: "Ě", score: 3, count: 2 },
    { letter: "Ň", score: 6, count: 1 },
    { letter: "Ř", score: 4, count: 2 },
    { letter: "Š", score: 4, count: 2 },
    { letter: "Ť", score: 7, count: 1 },
    { letter: "Ů", score: 4, count: 1 },
    { letter: "Ž", score: 4, count: 1 },
    { score: 0, count: 2 }
  ];

  return scrabble;
});
