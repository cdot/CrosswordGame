// Lietuvos
// @see https://en.wikipedia.org/wiki/Scrabble_letter_distributions#Lithuanian
define(["editions/_Scrabble"], Scrabble => {

  const scrabble = Scrabble();

  scrabble.bag = [
    { letter: "A", score: 1, count: 9 },
    { letter: "B", score: 2, count: 2 },
    { letter: "C", score: 7, count: 1 },
    { letter: "D", score: 2, count: 3 },
    { letter: "E", score: 1, count: 6 },
    { letter: "F", score: 10, count: 1 },
    { letter: "G", score: 2, count: 2 },
    { letter: "H", score: 10, count: 1 },
    { letter: "I", score: 1, count: 11 },
    { letter: "J", score: 4, count: 2 },
    { letter: "K", score: 2, count: 4 },
    { letter: "L", score: 1, count: 6 },
    { letter: "M", score: 2, count: 3 },
    { letter: "N", score: 1, count: 4 },
    { letter: "O", score: 1, count: 5 },
    { letter: "P", score: 2, count: 3 },
    { letter: "R", score: 1, count: 9 },
    { letter: "S", score: 1, count: 6 },
    { letter: "T", score: 1, count: 5 },
    { letter: "U", score: 1, count: 5 },
    { letter: "V", score: 4, count: 1 },
    { letter: "Y", score: 6, count: 1 },
    { letter: "Z", score: 5, count: 1 },
    { letter: "Ą", score: 1, count: 1 },
    { letter: "Č", score: 7, count: 1 },
    { letter: "Ė", score: 3, count: 2 },
    { letter: "Ę", score: 2, count: 1 },
    { letter: "Į", score: 4, count: 1 },
    { letter: "Š", score: 3, count: 2 },
    { letter: "Ū", score: 5, count: 1 },
    { letter: "Ų", score: 3, count: 1 },
    { letter: "Ž", score: 4, count: 1 },
    { score: 0, count: 2 }
  ];

  return scrabble;
});