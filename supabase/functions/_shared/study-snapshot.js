(function () {
  const BANK = "jp-ibt-cbt-2";
  const validCycle = cycle => Array.isArray(cycle?.knownIds) && Array.isArray(cycle?.remainingIds);
  const banksOf = snapshot => snapshot?.version === 4 ? (snapshot.banks || {})
    : snapshot?.version === 3 ? { "jp-business-law": snapshot } : {};

  // A newer whole snapshot must not restore questions completed on another device.
  globalThis.mergeStudySnapshots = function (local, remote) {
    const newer = Number(local?.updatedAt || 0) >= Number(remote?.updatedAt || 0) ? local : remote;
    const older = newer === local ? remote : local;
    const banks = { ...banksOf(older), ...banksOf(newer) };
    const left = banksOf(local)[BANK];
    const right = banksOf(remote)[BANK];
    if (left && right) {
      let bank;
      if (Number(left.resetAt || 0) !== Number(right.resetAt || 0)) {
        bank = Number(left.resetAt || 0) > Number(right.resetAt || 0) ? left : right;
      } else {
        bank = { ...left, ...right, ...banks[BANK], progress: {} };
        const sources = [banksOf(older)[BANK], banksOf(newer)[BANK]];
        for (const [id, entry] of sources.flatMap(source => Object.entries(source.progress || {}))) {
          const previous = bank.progress[id];
          if (!previous || Number(entry.answeredAt || 0) >= Number(previous.answeredAt || 0)) bank.progress[id] = entry;
        }
        const history = new Map();
        for (const entry of sources.flatMap(source => source.history || [])) history.set(`${entry.id}:${entry.at}`, entry);
        bank.history = [...history.values()].sort((a, b) => a.at - b.at);
        const cycles = [left.randomCycle, right.randomCycle].filter(validCycle);
        if (cycles.length) {
          const round = Math.max(...cycles.map(cycle => cycle.round || 1));
          const current = cycles.filter(cycle => (cycle.round || 1) === round);
          const knownIds = [...new Set(current.flatMap(cycle => cycle.knownIds))];
          const completed = new Set(current.flatMap(cycle => {
            const remaining = new Set(cycle.remainingIds);
            return cycle.knownIds.filter(id => !remaining.has(id));
          }));
          const order = validCycle(banks[BANK].randomCycle) && (banks[BANK].randomCycle.round || 1) === round
            ? banks[BANK].randomCycle.remainingIds : current[0].remainingIds;
          const remainingIds = [...new Set([...order, ...current.flatMap(cycle => cycle.remainingIds)])]
            .filter(id => !completed.has(id) && (round !== 1 || !bank.progress[id]?.answeredAt));
          bank.randomCycle = { round, knownIds, remainingIds };
        }
      }
      banks[BANK] = bank;
    }
    return { ...newer, version: 4, updatedAt: Math.max(Number(local?.updatedAt || 0), Number(remote?.updatedAt || 0)), banks };
  };
})();
