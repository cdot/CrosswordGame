// @see https://en.wikipedia.org/wiki/Scrabble_letter_distributions#Catalan
define(["editions/_Scrabble"], (Scrabble) => {
  const scrabble = Scrabble();
  scrabble.bag = [
    { letter:   "A", score:  1, count: 12 },
    { letter:   "B", score:  3, count:  2 },
    { letter:   "C", score:  3, count:  2 },
    { letter:   "Ç", score: 10, count:  1 },
    { letter:   "D", score:  2, count:  3 },
    { letter:   "E", score:  1, count: 13 },
    { letter:   "F", score:  4, count:  1 },
    { letter:   "G", score:  3, count:  2 },
    { letter:   "H", score:  8, count:  1 },
    { letter:   "I", score:  1, count:  8 },
    { letter:   "J", score:  8, count:  1 },
    { letter:   "L", score:  1, count:  4 },
    { letter: "L·L", score: 10, count:  1 },
    { letter:   "M", score:  2, count:  3 },
    { letter:   "N", score:  1, count:  6 },
    { letter:  "NY", score: 10, count:  1 },
    { letter:   "O", score:  1, count:  5 },
    { letter:   "P", score:  3, count:  2},
    { letter:  "QU", score:  8, count:  1 },
    { letter:   "R", score:  1, count:  8 },
    { letter:   "S", score:  1, count:  8 },
    { letter:   "T", score:  1, count:  5 },
    { letter:   "U", score:  1, count:  4 },
    { letter:   "V", score:  1, count:  1 },
    { letter:   "X", score: 10, count:  1 },
    { letter:   "Z", score: 10, count:  1 },
    {                score: 0, count: 2 }
  ];
  
  return scrabble;
});
