// Hard-coded demo question bank for the mock game
export type DemoQ = {
  question: string;
  options: string[];     // A, B, C, D
  correctIndex: number;  // 0-based
};

// Mock gamePk for the demo
export const DEMO_GAMEPK = 111111;

// Adjust wording/options freely for your demo
export const DEMO_QUESTIONS: DemoQ[] = [
  {
    question: "What is Bryce Harper's career-high home runs in a single MLB season?",
    options: ["35", "39", "30", "36"],
    correctIndex: 1, // demo choice
  },
  {
    question: "What is Mick Abel's ERA this season?",
    options: ["6.05", "6.65", "6.23", "6.76"],
    correctIndex: 2,
  },
  {
    question: "What is WHIP?",
    options: [
      "Walks + Hits per Inning Pitched",
      "Wins per Inning Pitched",
      "Wild pitches per Inning",
      "Walks per 9 innings",
    ],
    correctIndex: 0,
  },
  {
    question: "What does ERA stand for?",
    options: [
      "Earned Run Average",
      "Eventual Runs Against",
      "Extra Runs Allowed",
      "Estimated Run Average",
    ],
    correctIndex: 0,
  },
  {
    question: "Bryce Harper's home runs in the 2021 season?",
    options: ["35", "39", "29", "42"],
    correctIndex: 1, // pick a demo answer
  },
  {
    question: "Bryce Harper's stolen bases in the 2023 season?",
    options: ["10", "8", "11", "6"],
    correctIndex: 3, // demo answer
  },
  {
    question: "Bryce Harper strikeouts last season?",
    options: ["118", "134", "101", "144"],
    correctIndex: 1, // demo answer
  },
];
