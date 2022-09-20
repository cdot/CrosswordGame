// Latvian
// @see https://www.liquisearch.com/scrabble_letter_distributions/latvian
define(["editions/_Scrabble"], Scrabble => {

  const scrabble = Scrabble();

  scrabble.bag = [
    { letter: "A", score: 1, count: 11 },
    { letter: "B", score: 5, count: 1 },
    { letter: "C", score: 5, count: 1 },
    { letter: "D", score: 3, count: 3 },
    { letter: "E", score: 1, count: 6 },
    { letter: "F", score: 10, count: 1 },
    { letter: "G", score: 5, count: 1 },
    { letter: "H", score: 10, count: 1 },
    { letter: "I", score: 1, count: 9 },
    { letter: "J", score: 4, count: 2 },
    { letter: "K", score: 2, count: 4 },
    { letter: "L", score: 2, count: 3 },
    { letter: "M", score: 2, count: 4 },
    { letter: "N", score: 2, count: 4 },
    { letter: "O", score: 3, count: 3 },
    { letter: "P", score: 2, count: 3 },
    { letter: "R", score: 1, count: 5 },
    { letter: "S", score: 1, count: 8 },
    { letter: "T", score: 1, count: 6 },
    { letter: "U", score: 1, count: 5 },
    { letter: "V", score: 3, count: 3 },
    { letter: "Z", score: 3, count: 2 },
    { letter: "Ā", score: 2, count: 4 },
    { letter: "Č", score: 10, count: 1 },
    { letter: "Ē", score: 4, count: 2 },
    { letter: "Ģ", score: 10, count: 1 },
    { letter: "Ī", score: 4, count: 2 },
    { letter: "Ķ", score: 10, count: 1 },
    { letter: "Ļ", score: 8, count: 1 },
    { letter: "Ņ", score: 6, count: 1 },
    { letter: "Š", score: 6, count: 1 },
    { letter: "Ū", score: 6, count: 1 },
    { letter: "Ž", score: 8, count: 1 },
    { score: 0, count: 2 }
  ];

  return scrabble;
});
