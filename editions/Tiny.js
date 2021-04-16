// Test edition
// 11x11 board with all tile values
// English letters, used with Custom_English.dict
define("editions/Tiny", () => {

	const BOARD = [
		"M_____",
		"_d____",
		"__t___",
		"___T__",
		"____q_",
		"_____Q",
	];

	const BAG = [
		{ score: 0, count: 1 },
		{ letter: "A", score: 1, count: 5 },
		{ letter: "B", score: 3, count: 1 },
		{ letter: "C", score: 3, count: 1 },
		{ letter: "D", score: 2, count: 2 },
		{ letter: "E", score: 1, count: 5 },
		{ letter: "G", score: 2, count: 1 },
		{ letter: "I", score: 1, count: 4 },
		{ letter: "L", score: 1, count: 3 },
		{ letter: "M", score: 3, count: 1 },
		{ letter: "N", score: 1, count: 3 },
		{ letter: "O", score: 1, count: 4 },
		{ letter: "P", score: 3, count: 1 },
		{ letter: "R", score: 1, count: 5 },
		{ letter: "S", score: 1, count: 5 },
		{ letter: "T", score: 1, count: 4 },
		{ letter: "U", score: 1, count: 4 }
	];

	return {
		layout: BOARD,
		bag: BAG,
		rackCount: 5,
		swapCount: 3,
		bonuses: { 3: 10, 4: 15, 5: 20 }
	};
});
