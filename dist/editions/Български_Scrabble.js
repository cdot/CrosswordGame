// Български
// @see https://en.wikipedia.org/wiki/Scrabble_letter_distributions#Bulgarian
define(["editions/_Scrabble"], Scrabble => {

  const scrabble = Scrabble();

  scrabble.bag = [
    { letter: "А", score: 1, count: 9 },
    { letter: "Б", score: 2, count: 3 },
    { letter: "В", score: 2, count: 4 },
    { letter: "Г", score: 3, count: 3 },
    { letter: "Д", score: 2, count: 4 },
    { letter: "Е", score: 1, count: 8 },
    { letter: "Ж", score: 4, count: 2 },
    { letter: "З", score: 4, count: 2 },
    { letter: "И", score: 1, count: 8 },
    { letter: "Й", score: 5, count: 1 },
    { letter: "К", score: 2, count: 3 },
    { letter: "Л", score: 2, count: 3 },
    { letter: "М", score: 2, count: 4 },
    { letter: "Н", score: 1, count: 4 },
    { letter: "О", score: 1, count: 9 },
    { letter: "П", score: 1, count: 4 },
    { letter: "Р", score: 1, count: 4 },
    { letter: "С", score: 1, count: 4 },
    { letter: "Т", score: 1, count: 5 },
    { letter: "У", score: 5, count: 3 },
    { letter: "Ф", score: 10, count: 1 },
    { letter: "Х", score: 5, count: 1 },
    { letter: "Ц", score: 8, count: 1 },
    { letter: "Ч", score: 5, count: 2 },
    { letter: "Ш", score: 8, count: 1 },
    { letter: "Щ", score: 10, count: 1 },
    { letter: "Ъ", score: 3, count: 2 },
    { letter: "Ь", score: 10, count: 1 },
    { letter: "Ю", score: 8, count: 1 },
    { letter: "Я", score: 5, count: 2 },
    { score: 0, count: 2 }
  ];

  return scrabble;
});
