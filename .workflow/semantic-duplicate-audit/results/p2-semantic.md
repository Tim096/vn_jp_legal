# P2 semantic duplicate audit

範圍：`shikakumondai.json`（466 題）對 `shikaku-dojo.json`（300 題）。本輪以字元 n-gram 候選搜尋後人工核對，專抓改寫、正反極性，以及 dojo 題與 source1 複合題內單一敘述重合。這是高可信、非 exhaustive 的下一版清理清單；本輪不改產品資料。

判定原則：若兩題實際判斷的是同一法律命題，即使數字故意改錯、肯否定相反或一題只是複合題中的一個敘述，仍列 duplicate。僅同法條、同主題或共享慣用語則保留。若只能留一題，建議保留 `ch*`：題幹與解說通常較完整。

## 建議移除 dojo（高可信）

| source1 ID | dojo ID | 建議 | 日本語内容の根拠 |
|---|---|---|---|
| ch01-0047 | dojo-21071 | keep source1 / remove dojo | 「商人＝自己の名をもって商行為を業とする者」がほぼ同文。 |
| ch01-0050 | dojo-21072 | keep source1 / remove dojo | 支配人の「一切の裁判上・裁判外の行為」の権限が同一。 |
| ch01-0052 | dojo-21080 | keep source1 / remove dojo | 代理商が独立商人か使用人かという同じ定義を正反対から問う。 |
| ch13-0054 | dojo-21004 | keep source1 / remove dojo | 変態設立事項は定款記載がなければ効力を生じない、という同一命題。 |
| ch13-0057 | dojo-21011, dojo-21038 | keep source1 / remove dojo | 株主総会招集通知の「会日の2週間前」が同一。 |
| ch13-0074 | dojo-21012 | keep source1 / remove dojo | 特別決議の出席要件と3分の2要件を、dojo は普通決議型の数値へ置換した逆極性問題。 |
| ch13-0038 | dojo-21013 | keep source1 / remove dojo | 決議取消しの訴えは決議日から3箇月以内、がほぼ同文。 |
| ch13-0083 | dojo-21014, dojo-21045 | keep source1 / remove dojo | 取締役任期の原則2年と非公開会社での伸長上限を同じ数字違いで問う。 |
| ch13-0004 | dojo-21015, dojo-21040 | keep source1 / remove dojo | 取締役会設置会社の代表取締役は取締役会が選定する、という同一命題。 |
| ch13-0060 | dojo-21016 | keep source1 / remove dojo | 自己・第三者のための競業取引に承認が必要かを同じ正反対で問う。 |
| ch13-0061 | dojo-21017 | keep source1 / remove dojo | 取締役の利益相反取引に株主総会・取締役会承認が必要かという同一命題。 |
| ch13-0008 | dojo-21031, dojo-21059 | keep source1 / remove dojo | 公開会社の代表訴訟について6箇月継続保有と提訴請求後60日を重複して問う。 |
| ch13-0051 | dojo-21035 | keep source1 / remove dojo | 発起設立＝発起人が設立時株式全部を引き受ける方法、が同一。 |
| ch13-0032 | dojo-21036 | keep source1 / remove dojo | 株主平等は株式の内容・数に応じる、人数一律ではない、という同一命題。 |
| ch13-0058 | dojo-21057 | keep source1 / remove dojo | 事業全部・重要な一部の譲渡に株主総会承認が必要という同一命題。 |
| ch13-0082 | dojo-21060 | keep source1 / remove dojo | 取締役の法令・定款違反と著しい損害のおそれを要件とする差止めが同一。 |
| ch13-0073 | dojo-21066 | keep source1 / remove dojo | 普通決議の過半数出席・出席議決権過半数がほぼ同文。 |
| ch13-0010 | dojo-21070 | keep source1 / remove dojo | 善意・無重過失の役員責任を一定限度で免除できる命題が同一。 |
| ch01-0010 | dojo-20929 | keep source1 / remove dojo | 通謀虚偽表示の当事者間無効と善意第三者保護を、dojo が二重に逆転。 |
| ch01-0011 | dojo-20930 | keep source1 / remove dojo | 重要な錯誤による意思表示を取消せる、がほぼ同文。 |
| ch01-0012 | dojo-20931 | keep source1 / remove dojo | 詐欺取消しを善意無過失第三者に対抗できない命題の正反対。 |
| ch01-0072 | dojo-20932 | keep source1 / remove dojo | 代理の顕名と効果帰属という同一命題。 |
| ch01-0014 | dojo-20933 | keep source1 / remove dojo | 無権代理は本人の追認なしに効力を生じるか、がほぼ同文。 |
| ch10-0008 | dojo-20935 | keep source1 / remove dojo | 債権消滅時効の主観5年・客観10年を、dojo が10年・20年に変えた同一数字命題。 |
| ch02-0006 | dojo-20938 | keep source1 / remove dojo | 不動産物権変動で登記が効力発生要件か対抗要件かを同じ誤文で問う。 |
| ch02-0020 | dojo-20941 | keep source1 / remove dojo | 根抵当権の元本確定前に被担保債権範囲を変更できるか、の正反対。 |
| ch09-0013 | dojo-20944 | keep source1 / remove dojo | 保証契約の書面要式が同一（dojo は電磁的記録も明示）。 |
| ch10-0013 | dojo-20946 | keep source1 / remove dojo | 債権譲渡の第三者対抗要件として確定日付ある証書が必要か、の正反対。 |
| ch10-0004 | dojo-20947 | keep source1 / remove dojo | 相殺適状の同種目的・弁済期という同一要件群を問う。 |
| ch01-0019 | dojo-20949 | keep source1 / remove dojo | 双務契約の同時履行抗弁が相手方の履行提供まで使える、がほぼ同文。 |
| ch12-0007 | dojo-20954 | keep source1 / remove dojo | 工作物占有者の一次責任と所有者責任の切替えが同一。 |
| ch10-0021 | dojo-20970 | keep source1 / remove dojo | 個人根保証は極度額なしでは無効、という同一命題の正反対。 |
| ch01-0003 | dojo-20974 | keep source1 / remove dojo | 契約不適合を知った後の通知期間を、同じ構造で誤った年数に置換。 |
| ch12-0011 | dojo-20978 | keep source1 / remove dojo | 名誉毀損で謝罪広告等の原状回復処分が可能か、という同一命題。 |
| ch01-0066 | dojo-20990 | keep source1 / remove dojo | 双方無責の履行不能時に反対給付を拒める、が同一。 |
| ch01-0029 | dojo-20991 | keep source1 / remove dojo | 通常損耗・経年変化まで原状回復義務を負うか、がほぼ同文。 |
| ch05-0004 | dojo-21102 | keep source1 / remove dojo | 営業秘密の秘密管理性・有用性・非公知性という3要件が同一。 |
| ch04-0018 | dojo-21109 | keep source1 / remove dojo | 事業者の損害賠償責任を全部免除する条項は無効、がほぼ同文。 |
| ch04-0003 | dojo-21111 | keep source1 / remove dojo | 訪問販売のクーリングオフが法定書面受領から8日、という同一数字命題。 |
| ch04-0007 | dojo-21112 | keep source1 / remove dojo | 連鎖販売取引のクーリングオフ20日が同一。 |
| ch07-0004 | dojo-21118 | keep source1 / remove dojo | 品質・規格等を実際より著しく優良と示す「優良誤認」の定義が同一。 |
| ch05-0001 | dojo-21121 | keep source1 / remove dojo | 個人データ第三者提供は原則本人同意が必要、という同一命題。 |
| ch03-0001 | dojo-21122 | keep source1 / remove dojo | 不当な取引制限の典型である価格カルテルを同じ内容で問う。 |
| ch03-0006 | dojo-21125 | keep source1 / remove dojo | 旧下請法・取適法の代金支払期日上限60日が同一。 |
| ch16-0002 | dojo-21130 | keep source1 / remove dojo | 準拠法選択がない場合は最密接関係地法による、が同一。 |
| ch07-0005 | dojo-21142 | keep source1 / remove dojo | 景品類提供の最高額・総額を規制できるか、の正反対。 |
| ch15-0003 | dojo-21144 | keep source1 / remove dojo | 独禁法の課徴金減免制度の有無を正反対から問う。 |
| ch14-0001 | dojo-21147, dojo-21148, dojo-21186 | keep source1 / remove dojo | 30日前の解雇予告と、合理性・社会的相当性を欠く解雇無効が重複。 |
| ch14-0002 | dojo-21149, dojo-21203 | keep source1 / remove dojo | 無期転換は通算5年超＋申込み、を3年・自動転換へ変えた同一命題。 |
| ch14-0018 | dojo-21150, dojo-21202 | keep source1 / remove dojo | 法定労働時間の週40時間・日8時間が同一。 |
| ch14-0012 | dojo-21152, dojo-21185 | keep source1 / remove dojo | 年休の6箇月・8割・10日要件、および時季変更権を重複して問う。 |
| ch14-0005 | dojo-21153, dojo-21178, dojo-21188 | keep source1 / remove dojo | 組合活動を理由とする不利益取扱いと正当理由なき団交拒否が同一。 |
| ch11-0006 | dojo-21164, dojo-21193 | keep source1 / remove dojo | 破産管財人の否認権と債権者害意行為が同一。 |
| ch11-0004 | dojo-21167, dojo-21195 | keep source1 / remove dojo | 破産時の抵当権者は別除権を手続外で行使できる、の正反対を含む同一命題。 |
| ch16-0001 | dojo-21171, dojo-21213 | keep source1 / remove dojo | 当事者が契約準拠法を合意選択できる、という同一命題。 |
| ch16-0009 | dojo-21083, dojo-21181 | keep source1 / remove dojo | 仲裁判断の確定判決同等効と通常裁判で容易に覆せない点を逆極性で問う。 |
| ch14-0006 | dojo-21208 | keep source1 / remove dojo | 労働協約違反の個別契約部分は無効となり協約基準による、が同一。 |
| ch14-0019 | dojo-21220 | keep source1 / remove dojo | 常時10人以上で就業規則作成・届出義務、という同一命題。 |

## 近似したが削除しない

| source1 ID | dojo ID | 建議 | 日本語内容の根拠 |
|---|---|---|---|
| ch13-0013 | dojo-21009 | keep both | 同じ「分配可能額」でも、剰余金配当と自己株式取得は別の行為・要件。 |
| ch13-0013 | dojo-21024 | keep both | source1 は配当上限、dojo は1事業年度中の配当回数。命題が違う。 |
| ch13-0025 | dojo-21072 | keep both | 「一切の裁判上・裁判外の行為」は似るが、代表取締役と支配人で主体が違う。 |
| ch01-0047 | dojo-21129 | keep both | 商人の定義と仲立人の定義は別。語句一致だけでは duplicate でない。 |
| ch12-0002 | dojo-20953 | keep both | source1 は使用者から被用者への求償、dojo は被用者本人の対被害者責任。 |
| ch04-0011 | dojo-21140 | keep both | 包括信用購入あっせんの抗弁接続と、その取引自体の定義は別命題。 |
| ch14-0013 | dojo-21148 | keep both | 文言は近いが懲戒権濫用と解雇権濫用は対象行為が異なる。 |
| ch05-0008 | dojo-21143 | keep both | source1 敘述は委員会への報告、dojo は報告に加えて本人通知まで一体で問う。 |
| ch12-0001 | dojo-21133 | keep both | 一般不法行為責任と特許侵害の救済手段列挙は別命題。 |
| ch01-0056 | dojo-21080 | keep both | 「営業の部類に属する取引」は共通だが、支配人の競業避止と代理商の定義は別。 |

## 結論

完全重複 0 題という先前結論不成立。少なくとも上表の高可信群は、正規化完全一致では拾えない semantic duplicate。特に dojo の○×題與 source1 複合題單一敘述間，已確認多組近乎逐字或僅切換肯否定／數字。下一版可先按上表移除 dojo 側，再另做全 766 題 exhaustive review。
