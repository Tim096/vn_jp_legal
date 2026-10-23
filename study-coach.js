/* Selection rules are deterministic apart from the caller's shuffle. No storage writes. */
window.StudyCoach = (() => {
  function complexity(question) {
    const text = question.question || '';
    const multi = question.answer?.length > 1;
    const combination = /組み合わせ|組合せ|組合|ア[．.、]|イ[．.、]|下線部|個数/.test(text);
    const caseStudy = /[Ａ-ＺA-Z][社はがとのに]|事例|場合/.test(text) && text.length >= 160;
    return Number(multi) * 3 + Number(combination) * 3 + Number(caseStudy) * 2;
  }
  function diagnosticPool(questions, snapshot, mapping) {
    const attempted = new Set(Object.entries(snapshot.progress || {}).filter(([, p]) => p?.answeredAt).map(([id]) => id));
    for (const h of snapshot.history || []) attempted.add(h.id);
    return questions.filter(q => !attempted.has(q.id) && !q.allCredit && q.options.length >= 4 && mapping[q.id] !== undefined);
  }
  function diagnostic(questions, snapshot, mapping, shuffle) {
    const pool = diagnosticPool(questions, snapshot, mapping);
    const groups = Array.from({ length: 6 }, (_, field) => shuffle(pool.filter(q => mapping[q.id] === field))
      .sort((a, b) => complexity(b) - complexity(a)));
    const missing = groups.map((g,i) => g.length < 4 ? i : -1).filter(i => i >= 0);
    if (pool.length < 40 || missing.length) return { questions: [], available: pool.length, missing };
    // Minimum four per field, then evenly rotate. Practice allocation, not official exam weighting.
    const selected = groups.flatMap(g => g.splice(0, 4));
    while (selected.length < 40) for (const group of groups) {
      if (group.length && selected.length < 40) selected.push(group.shift());
    }
    return { questions: shuffle(selected), available: pool.length, missing: [], complex: selected.filter(q => complexity(q) > 0).length };
  }
  function latestResults(snapshot) {
    const latest = new Map(), history = new Map(), resetAt = Number(snapshot.resetAt) || 0;
    for (const h of snapshot.history || []) {
      if (!(h.at > resetAt)) continue;
      if (!history.has(h.id) || h.at >= history.get(h.id).at) history.set(h.id,h);
      if (typeof h.correct !== 'boolean' || h.mode === 'legacy' || h.answered === false || h.mode === 'mock' && !h.correct && h.answered !== true) continue;
      if (!latest.has(h.id) || h.at >= latest.get(h.id).at) latest.set(h.id,h);
    }
    for (const [id,p] of Object.entries(snapshot.progress || {})) {
      const h = history.get(id);
      const uncertain = p.correct === false && p.answered !== true && (!h || h.mode === 'legacy' || h.mode === 'mock' && h.answered !== true && h.at >= p.answeredAt);
      if (typeof p.correct !== 'boolean' || p.answered === false || !(p.answeredAt > resetAt) || uncertain) continue;
      if (!latest.has(id) || p.answeredAt >= latest.get(id).at) latest.set(id,{at:p.answeredAt,correct:p.correct});
    }
    return latest;
  }
  function topicStats(questions, snapshot, metadata) {
    const latest = latestResults(snapshot);
    const groups = new Map();
    for (const q of questions) for (const id of metadata[q.id]?.topicIds || []) {
      if (!groups.has(id)) groups.set(id, { id, total:0, answered:0, correct:0, weak:0 });
      const group = groups.get(id), p = snapshot.progress?.[q.id];
      group.total++;
      if (latest.has(q.id)) {
        group.answered++; group.correct += Number(latest.get(q.id).correct); group.weak += Number(p?.weak === true);
      }
    }
    return [...groups.values()].sort((a,b) => b.weak-a.weak || a.id.localeCompare(b.id));
  }
  function adaptive(questions, snapshot, metadata, now = Date.now(), count = 10) {
    const today = new Date(now).toDateString();
    const done = new Set((snapshot.history || []).filter(h => new Date(h.at).toDateString() === today && h.answered !== false).map(h => h.id));
    for (const [id,p] of Object.entries(snapshot.progress || {})) if (p.answered !== false && p.answeredAt && new Date(p.answeredAt).toDateString() === today) done.add(id);
    const pool = questions.filter(q => !q.allCredit && !done.has(q.id));
    const weakTopics = weakTopicIds(snapshot, metadata);
    const priority = q => (metadata[q.id]?.topicIds || []).filter(id=>weakTopics.has(id)).length;
    const ranked = [...pool].sort((a,b)=>priority(b)-priority(a) || complexity(b)-complexity(a) || a.id.localeCompare(b.id));
    const progress = snapshot.progress || {};
    const due = ranked.filter(q=>progress[q.id]?.due <= now).sort((a,b)=>progress[a.id].due-progress[b.id].due);
    const weak = ranked.filter(q=>progress[q.id]?.weak);
    const fresh = ranked.filter(q=>!progress[q.id]?.answeredAt);
    const chosen = [], ids = new Set();
    const take = (list, n) => { for (const q of list) if (!ids.has(q.id) && n > 0 && chosen.length < count) { ids.add(q.id); chosen.push(q); n--; } };
    take(due,4); take(weak,4); take(fresh,2); take([...due,...weak,...fresh],count);
    return chosen;
  }
  function weakTopicIds(snapshot, metadata) {
    const latest = latestResults(snapshot);
    return new Set(Object.entries(snapshot.progress || {}).filter(([id,p])=>p?.weak && latest.has(id))
      .flatMap(([id])=>metadata[id]?.topicIds || []));
  }
  return { complexity, diagnosticPool, diagnostic, topicStats, adaptive, weakTopicIds };
})();
