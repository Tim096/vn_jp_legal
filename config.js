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
  cacheHours: 24,
  analyticsMeasurementId: "",
  supabaseUrl: "https://dhqbpkhkzfubyequpfus.supabase.co",
  supabasePublishableKey: "sb_publishable_3v9WPYWaBYVK_IMZX2Abng_RwWWV1qg"
};
