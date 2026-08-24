const CHAPTERS = [
  ["chapter", "name"],
  ["ch00", "序章 ビジネス法務とは"],
  ["ch01", "第1章 企業取引・契約にかかわる法務"],
  ["ch02", "第2章 企業財産の管理と法務"],
  ["ch03", "第3章 企業間取引にかかわる法規制"],
  ["ch04", "第4章 消費者との取引にかかわる法規制"],
  ["ch05", "第5章 情報の管理と活用にかかわる法規制"],
  ["ch06", "第6章 デジタル社会と法律"],
  ["ch07", "第7章 広告・表示等に関する法規制"],
  ["ch08", "第8章 金融・証券業等に関する法規制"],
  ["ch09", "第9章 債権の担保"],
  ["ch10", "第10章 債権の回収"],
  ["ch11", "第11章 債務者の倒産への対応"],
  ["ch12", "第12章 法的紛争等の予防と対応"],
  ["ch13", "第13章 株式会社の組織と運営"],
  ["ch14", "第14章 企業と従業員の関係"],
  ["ch15", "第15章 企業活動と地域社会・行政等"],
  ["ch16", "第16章 国際法務（渉外法務）"]
];

const QUESTIONS = [
  ["id", "chapter", "title", "question", "options", "answer", "explanation", "law_refs", "tags", "confidence", "status"],
  ["demo-0001", "ch04", "動作確認", "カードをタップすると何が表示されますか？", "答えと解説\n章の一覧", "1", "これは画面の動作確認用データです。実際の問題データに差し替えてください。", "", "demo", "low", "ok"],
  ["demo-0002", "ch05", "動作確認", "復習の進捗はどこに保存されますか？", "この端末の localStorage\n公開された Google Sheets", "1", "進捗はこの端末に保存されます。月に一度データを書き出してください。", "", "demo", "low", "ok"],
  ["demo-0003", "ch06", "動作確認", "問題報告ボタンを使う前に必要な設定はどれですか？", "config.js の Google Form URL\nservice worker の削除", "1", "config.js にフォーム URL と question_id 欄の entry ID を設定します。", "", "demo", "low", "ok"]
];

function setupBijihou2() {
  const spreadsheet = SpreadsheetApp.create("ビジネス実務法務検定2級 題庫");
  const questionsSheet = spreadsheet.getSheets()[0];
  questionsSheet.setName("questions");
  questionsSheet.getRange(1, 1, QUESTIONS.length, QUESTIONS[0].length).setValues(QUESTIONS);
  questionsSheet.setFrozenRows(1);

  const chaptersSheet = spreadsheet.insertSheet("chapters");
  chaptersSheet.getRange(1, 1, CHAPTERS.length, CHAPTERS[0].length).setValues(CHAPTERS);
  chaptersSheet.setFrozenRows(1);

  const form = FormApp.create("ビジネス実務法務検定2級 問題報告");
  form.setDescription("気になった問題を報告してください。question_id は変更不要です。")
    .setConfirmationMessage("報告ありがとうございました。このタブを閉じて学習を続けてください。")
    .setAcceptingResponses(true)
    .setDestination(FormApp.DestinationType.SPREADSHEET, spreadsheet.getId());

  const questionIdItem = form.addTextItem().setTitle("question_id").setRequired(true);
  form.addMultipleChoiceItem()
    .setTitle("種類")
    .setChoiceValues([
      "答えが違うと思う",
      "解説がわかりにくい",
      "条文が違う / 見つからない",
      "誤字・脱字",
      "その他"
    ])
    .setRequired(true);
  form.addParagraphTextItem().setTitle("コメント").setRequired(false);

  DriveApp.getFileById(spreadsheet.getId()).setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  const prefilledUrl = form.createResponse()
    .withItemResponse(questionIdItem.createResponse("QUESTION_ID"))
    .toPrefilledUrl();
  const entryMatch = prefilledUrl.match(/[?&](entry\.\d+)=/);
  if (!entryMatch) throw new Error("question_id entry ID を取得できませんでした");

  const base = `https://docs.google.com/spreadsheets/d/${spreadsheet.getId()}/gviz/tq?tqx=out:csv&sheet=`;
  const result = {
    spreadsheetUrl: spreadsheet.getUrl(),
    formEditUrl: form.getEditUrl(),
    questionsCsvUrl: `${base}questions`,
    chaptersCsvUrl: `${base}chapters`,
    feedbackFormBaseUrl: form.getPublishedUrl(),
    feedbackQuestionEntry: entryMatch[1]
  };

  console.log(JSON.stringify(result, null, 2));
  return result;
}
