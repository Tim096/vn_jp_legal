window.APP_CONFIG = {
  defaultBank: "jp-business-law",
  banks: {
    "jp-business-law": {
      label: "日本ビジネス法務",
      shortLabel: "日本法務",
      language: "ja",
      questionsCsvUrl: "./data/questions.csv",
      chaptersCsvUrl: "./data/chapters.csv",
      aiMocksUrl: "./data/ai-mocks-2026.json",
      useLocalCsvCache: true
    },
    "jp-ibt-cbt-2": {
      label: "IBT・CBT 模擬問題",
      shortLabel: "模擬問題",
      language: "ja",
      questionsCsvUrl: "./data/ibt-cbt-2-questions.csv",
      chaptersCsvUrl: "./data/ibt-cbt-2-chapters.csv",
      aiMocksUrl: "",
      useLocalCsvCache: false,
      defaultStudyMode: "random",
      mockFromRandomCycle: true
    },
    "jp-ibt-cbt-4": {
      label: "IBT・CBT 模擬問題４",
      shortLabel: "模擬問題４",
      language: "ja",
      questionsCsvUrl: "./data/ibt-cbt-4-questions.csv",
      chaptersCsvUrl: "./data/ibt-cbt-4-chapters.csv",
      aiMocksUrl: "",
      useLocalCsvCache: false,
      defaultStudyMode: "random",
      mockFromRandomCycle: true
    },
    "jp-whr-field-2026": {
      label: "分野別演習 2026",
      shortLabel: "分野別演習",
      language: "ja",
      questionsCsvUrl: "./data/whr-field-2026-questions.csv",
      chaptersCsvUrl: "./data/whr-field-2026-chapters.csv",
      aiMocksUrl: "",
      useLocalCsvCache: false,
      defaultStudyMode: "random",
      mockFromRandomCycle: true
    },
    "jp-whr-qa-2026": {
      label: "一問一答 2026",
      shortLabel: "一問一答",
      language: "ja",
      questionsCsvUrl: "./data/whr-qa-2026-questions.csv",
      chaptersCsvUrl: "./data/whr-qa-2026-chapters.csv",
      aiMocksUrl: "",
      useLocalCsvCache: false,
      defaultStudyMode: "random",
      mockFromRandomCycle: true
    },
    "tw-bar-first": {
      label: "台灣司律一試",
      shortLabel: "台灣司律",
      language: "zh-Hant",
      questionsCsvUrl: "./data/taiwan-bar-questions.csv",
      chaptersCsvUrl: "./data/taiwan-bar-chapters.csv",
      aiMocksUrl: "",
      useLocalCsvCache: false
    }
  },
  questionsCsvUrl: "./data/questions.csv",
  chaptersCsvUrl: "./data/chapters.csv",
  aiMocksUrl: "./data/ai-mocks-2026.json",
  analyticsMeasurementId: "",
  supabaseUrl: "https://dhqbpkhkzfubyequpfus.supabase.co",
  supabasePublishableKey: "sb_publishable_3v9WPYWaBYVK_IMZX2Abng_RwWWV1qg"
};
