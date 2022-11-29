// Polski
// @see https://en.wikipedia.org/wiki/Scrabble_letter_distributions#Polish
define(["editions/_Scrabble"], Scrabble => {

  const scrabble = Scrabble();

  scrabble.bag = [
    { letter: "A", score: 1, count: 9 },
    { letter: "B", score: 3, count: 2 },
    { letter: "C", score: 2, count: 3 },
    { letter: "D", score: 2, count: 3 },
    { letter: "E", score: 1, count: 7 },
    { letter: "F", score: 5, count: 1 },
    { letter: "G", score: 3, count: 2 },
    { letter: "H", score: 3, count: 2 },
    { letter: "I", score: 1, count: 8 },
    { letter: "J", score: 3, count: 2 },
    { letter: "K", score: 2, count: 3 },
    { letter: "L", score: 2, count: 3 },
    { letter: "M", score: 2, count: 3 },
    { letter: "N", score: 1, count: 5 },
    { letter: "O", score: 1, count: 6 },
    { letter: "P", score: 2, count: 3 },
    { letter: "R", score: 1, count: 4 },
    { letter: "S", score: 1, count: 4 },
    { letter: "T", score: 2, count: 3 },
    { letter: "U", score: 3, count: 2 },
    { letter: "W", score: 1, count: 4 },
    { letter: "Y", score: 2, count: 4 },
    { letter: "Z", score: 1, count: 5 },
    { letter: "Ó", score: 5, count: 1 },
    { letter: "Ą", score: 5, count: 1 },
    { letter: "Ć", score: 6, count: 1 },
    { letter: "Ę", score: 5, count: 1 },
    { letter: "Ł", score: 3, count: 2 },
    { letter: "Ń", score: 7, count: 1 },
    { letter: "Ś", score: 5, count: 1 },
    { letter: "Ź", score: 9, count: 1 },
    { letter: "Ż", score: 5, count: 1 },
    { score: 0, count: 2 }
  ];

  return scrabble;
});
