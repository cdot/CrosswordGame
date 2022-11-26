// Klingon
// @see http://klingon.wiki/En/Scrabble
define(["editions/_Scrabble"], Scrabble => {

  const scrabble = Scrabble();

  scrabble.bag = [
    { letter: "'", score: 1, count: 10 },
    { letter: "D", score: 2, count: 4 },
    { letter: "H", score: 1, count: 5 },
    { letter: "I", score: 1, count: 8 },
    { letter: "Q", score: 6, count: 1 },
    { letter: "S", score: 3, count: 2 },
    { letter: "a", score: 1, count: 10 },
    { letter: "b", score: 3, count: 2 },
    { letter: "ch", score: 3, count: 2 },
    { letter: "e", score: 1, count: 8 },
    { letter: "gh", score: 3, count: 2 },
    { letter: "j", score: 2, count: 5 },
    { letter: "l", score: 3, count: 3 },
    { letter: "m", score: 2, count: 5 },
    { letter: "n", score: 3, count: 2 },
    { letter: "ng", score: 10, count: 1 },
    { letter: "o", score: 1, count: 6 },
    { letter: "p", score: 4, count: 2 },
    { letter: "q", score: 3, count: 2 },
    { letter: "r", score: 6, count: 1 },
    { letter: "t", score: 4, count: 2 },
    { letter: "tlh", score: 8, count: 1 },
    { letter: "u", score: 1, count: 6 },
    { letter: "v", score: 2, count: 4 },
    { letter: "w", score: 5, count: 2 },
    { letter: "y", score: 5, count: 2 },
    { score: 0, count: 2 }
  ];

  return scrabble;
});
