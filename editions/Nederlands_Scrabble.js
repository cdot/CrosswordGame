define(["editions/_Scrabble"], (Scrabble) => {

  const scrabble = Scrabble();
  
  scrabble.bag = [
    { score: 0, count: 2 },
    { letter: "A", score: 1, count: 6 },
    { letter: "B", score: 3, count: 2 },
    { letter: "C", score: 5, count: 2 },
    { letter: "D", score: 2, count: 5 },
    { letter: "E", score: 1, count: 18 },
    { letter: "F", score: 4, count: 2 },
    { letter: "G", score: 3, count: 3 },
    { letter: "H", score: 4, count: 2 },
    { letter: "I", score: 1, count: 4 },
    { letter: "J", score: 4, count: 2 },
    { letter: "K", score: 3, count: 3 },
    { letter: "L", score: 3, count: 3 },
    { letter: "M", score: 3, count: 3 },
    { letter: "N", score: 1, count: 10 },
    { letter: "O", score: 1, count: 6 },
    { letter: "P", score: 3, count: 2 },
    { letter: "Q", score: 10, count: 1 },
    { letter: "R", score: 2, count: 5 },
    { letter: "S", score: 2, count: 5 },
    { letter: "T", score: 2, count: 5 },
    { letter: "U", score: 4, count: 3 },
    { letter: "V", score: 4, count: 2 },
    { letter: "W", score: 5, count: 2 },
    { letter: "X", score: 8, count: 1 },
    { letter: "Y", score: 4, count: 2 },
    { letter: "Z", score: 4, count: 2 }
  ];

  return scrabble;
});
