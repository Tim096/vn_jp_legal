/* Derived study diagnostics. No learner records are written by this module. */
window.StudyWeakness = (() => {
  const MIN_SAMPLE = 5;

  function summarize(taxonomy, snapshots, bankIds) {
    const rows = taxonomy.fields.map(field => ({ ...field, total: 0, answered: 0, correct: 0 }));
    let excluded = 0;
    for (const bank of bankIds) {
      const mapping = taxonomy.banks[bank] || {};
      const snapshot = snapshots[bank] || {};
      const latest = new Map();
      const latestHistory = new Map();
      const resetAt = Number(snapshot.resetAt) || 0;
      for (const entry of snapshot.history || []) {
        if (!(entry.at > resetAt)) continue;
        if (!latestHistory.has(entry.id) || entry.at >= latestHistory.get(entry.id).at) latestHistory.set(entry.id, entry);
        // Legacy synthetic history can turn an unknown result into false.
        // Old standard mocks also conflated unanswered and incorrect answers.
        const ambiguousMock = bank === 'jp-business-law' && entry.mode === 'mock' && !entry.correct && entry.answered !== true;
        if (typeof entry.correct !== 'boolean' || entry.mode === 'legacy' || entry.answered === false || ambiguousMock) continue;
        if (!latest.has(entry.id) || entry.at >= latest.get(entry.id).at) latest.set(entry.id, entry);
      }
      for (const [id, progress] of Object.entries(snapshot.progress || {})) {
        const history = latestHistory.get(id);
        const ambiguousMock = bank === 'jp-business-law' && history?.mode === 'mock' && !history.correct && history.answered !== true;
        const unknownOldWrong = bank === 'jp-business-law' && (!history || history.mode === 'legacy') && progress.correct === false && progress.answered !== true;
        if (typeof progress.correct !== 'boolean' || !(progress.answeredAt > resetAt) || progress.answered === false || unknownOldWrong ||
            (ambiguousMock && history.at >= progress.answeredAt)) continue;
        if (!latest.has(id) || progress.answeredAt >= latest.get(id).at) latest.set(id, { at: progress.answeredAt, correct: progress.correct });
      }
      for (const [id, field] of Object.entries(mapping)) {
        const row = rows[field];
        row.total++;
        const result = latest.get(id);
        if (result) { row.answered++; row.correct += Number(result.correct); }
        else if (latestHistory.has(id) || snapshot.progress?.[id]?.answeredAt > resetAt) excluded++;
      }
      // Orphan / AI-original records have no reviewed mapping and stay outside the chart.
      excluded += [...latest.keys()].filter(id => !Object.hasOwn(mapping, id)).length;
    }
    return { rows: rows.map(row => ({ ...row, rate: row.answered ? row.correct / row.answered * 100 : null })), excluded };
  }

  const node = (tag, text, className) => Object.assign(document.createElement(tag), { textContent: text || '', className: className || '' });
  function svgNode(tag, attributes = {}, text) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [key, value] of Object.entries(attributes)) el.setAttribute(key, String(value));
    if (text !== undefined) el.textContent = text;
    return el;
  }
  function radar(rows) {
    const svg = svgNode('svg', { viewBox: '0 0 420 340', role: 'img', 'aria-label': rows.map(r => `${r.name}: ${r.rate === null ? '未回答' : Math.round(r.rate) + '%'}`).join('、') });
    const point = (index, percent) => {
      const angle = -Math.PI / 2 + index * Math.PI / 3;
      return [210 + Math.cos(angle) * 112 * percent / 100, 170 + Math.sin(angle) * 112 * percent / 100];
    };
    for (const percent of [25, 50, 75, 100]) {
      svg.append(svgNode('polygon', { points: rows.map((_, i) => point(i, percent).join(',')).join(' '), class: 'radar-grid' }));
      svg.append(svgNode('text', { x: 214, y: 170 - 112 * percent / 100 + 12, class: 'radar-tick' }, `${percent}`));
    }
    rows.forEach((_, i) => {
      const [x, y] = point(i, 100);
      svg.append(svgNode('line', { x1: 210, y1: 170, x2: x, y2: y, class: 'radar-grid' }));
    });
    // Missing fields are gaps, never zero-valued vertices.
    if (rows.every(r => r.rate !== null)) svg.append(svgNode('polygon', {
      points: rows.map((r, i) => point(i, r.rate).join(',')).join(' '), class: 'radar-area'
    }));
    else rows.forEach((r, i) => {
      const next = (i + 1) % rows.length;
      if (r.rate === null || rows[next].rate === null) return;
      const [x1, y1] = point(i, r.rate), [x2, y2] = point(next, rows[next].rate);
      svg.append(svgNode('line', { x1, y1, x2, y2, class: 'radar-edge' }));
    });
    const labels = [[210,27], [331,100], [331,248], [210,316], [89,248], [89,100]];
    rows.forEach((r, i) => {
      if (r.rate !== null) {
        const [cx, cy] = point(i, r.rate);
        svg.append(svgNode('circle', { cx, cy, r: 4, class: r.answered < MIN_SAMPLE ? 'radar-point is-small-sample' : 'radar-point' }));
      }
      const [x, y] = labels[i];
      svg.append(svgNode('text', { x, y, 'text-anchor': 'middle', class: 'radar-label' }, r.name));
      svg.append(svgNode('text', { x, y: y + 18, 'text-anchor': 'middle', class: 'radar-value' }, r.rate === null ? '未回答' : `${Math.round(r.rate)}%${r.answered < MIN_SAMPLE ? ' *' : ''}`));
    });
    return svg;
  }

  function render(container, taxonomy, snapshots, bankIds) {
    const { rows, excluded } = summarize(taxonomy, snapshots, bankIds);
    const answered = rows.reduce((n, r) => n + r.answered, 0);
    const total = rows.reduce((n, r) => n + r.total, 0);
    const correct = rows.reduce((n, r) => n + r.correct, 0);
    const summary = node('p', answered ? `最新正答率 ${Math.round(correct / answered * 100)}% · 回答済み ${answered} / ${total}問` : `まだ診断できません · 対象 ${total}問`, 'weakness-summary');
    const chart = node('div', '', 'weakness-chart');
    chart.append(radar(rows));
    const weak = rows.filter(r => r.answered >= MIN_SAMPLE && r.rate < 100).sort((a, b) => a.rate - b.rate || b.answered - a.answered).slice(0, 2);
    const advice = node('p', weak.length ? `優先復習：${weak.map(r => `${r.name}（${Math.round(r.rate)}%）`).join('・')}` : '各分野を5問以上解くと、優先して復習する分野を表示します。', 'weakness-advice');
    if (!weak.length && rows.some(r => r.answered >= MIN_SAMPLE)) advice.textContent = '5問以上回答した分野はすべて正解。未回答の問題にも取り組みましょう。';
    const table = node('table', '', 'weakness-table');
    const head = node('thead');
    const header = node('tr');
    for (const title of ['分野', '正答率', '正解 / 回答', '回答 / 全問']) header.append(node('th', title));
    head.append(header);
    const body = node('tbody');
    rows.forEach(r => {
      const tr = node('tr');
      const name = node('th', r.name);
      name.scope = 'row';
      name.append(node('small', r.reference));
      const rate = node('td', r.rate === null ? '—' : `${Math.round(r.rate)}%`);
      rate.append(node('small', r.rate === null ? '資料不足' : r.answered < MIN_SAMPLE ? '参考値 *' : ''));
      tr.append(name, rate, node('td', `${r.correct} / ${r.answered}`), node('td', `${r.answered} / ${r.total}`));
      body.append(tr);
    });
    table.append(head, body);
    const note = node('p', '各問題の最新の有効な回答を1回だけ集計。正解数 ÷ 回答済み問題数（各問同じ重み）。未回答は0%にせず、* は5問未満の参考値です。公式試験の分野別得点率とは異なります。', 'weakness-note');
    const classification = node('p', '6分野は提示された成績表の章区分に対応。教材の章・解説参照を使用し、模擬問題1〜4は主題による学習用分類です。題庫間の類似問題は別問題として集計します。', 'weakness-note');
    container.replaceChildren(summary, chart, advice, table, note, classification);
    if (excluded) container.append(node('p', `集計対象外 ${excluded}問：正誤・未回答の区別が不明な旧記録、未回答の模試、または分類のない問題。`, 'weakness-note'));
  }
  return { summarize, radar, render };
})();
