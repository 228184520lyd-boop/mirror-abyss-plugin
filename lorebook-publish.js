import { TABLE_KEYS, TABLE_LABELS } from '../constants.js';
function rows(snapshot, key) {
    return snapshot[key] ?? [];
}
function uniq(values, limit = 32) {
    return [...new Set(values.map((item) => String(item || '').trim()).filter((item) => item.length >= 2))].slice(0, limit);
}
function titleKeywords(row) {
    return uniq([row.title, ...row.keywords], 20);
}
function lifecycleLines(lifecycle) {
    if (!lifecycle)
        return [];
    const lines = [
        `存在状态：${lifecycle.existence}`,
        `活跃状态：${lifecycle.activity}`,
        `记忆状态：${lifecycle.memory}`,
        `证据等级：${lifecycle.evidenceLevel}`,
    ];
    if (lifecycle.evidence)
        lines.push(`判断依据：${lifecycle.evidence}`);
    if (lifecycle.returnConditions.length)
        lines.push(`可能回流条件：${lifecycle.returnConditions.join('；')}`);
    if (lifecycle.returnBlockers.length)
        lines.push(`阻止回流条件：${lifecycle.returnBlockers.join('；')}`);
    return lines;
}
function rowContent(sectionName, row) {
    const lines = [`[${sectionName}：${row.title}]`];
    lines.push(...lifecycleLines(row.lifecycle));
    if (row.status)
        lines.push(`当前状态：${row.status}`);
    if (row.content)
        lines.push(`当前记录：${row.content}`);
    if (row.keywords.length)
        lines.push(`关键词：${row.keywords.join('、')}`);
    if (row.source === 'manual' || row.locked)
        lines.push('维护权限：玩家锁定；自动整理不得覆盖或删除。');
    lines.push(`更新时间：${row.updatedAt}`);
    return lines.join('\n');
}
function groupedContent(title, tableLabel, sourceRows) {
    const blocks = sourceRows.map((row) => rowContent(tableLabel, row));
    return `[${title}]\n${blocks.length ? blocks.join('\n\n') : '暂无可发布记录。'}`;
}
function isCurrentCharacter(row) {
    const activity = row.lifecycle?.activity;
    return activity === '当前在场' || activity === '当前相关';
}
function isGlobalRow(row) {
    const text = `${row.title} ${row.status} ${row.keywords.join(' ')}`;
    return /(全局|跨区域|公共|社会|制度|世界态势|global)/i.test(text);
}
function cleanPrefixedTitle(title, prefixes) {
    let output = String(title || '').trim();
    for (const prefix of prefixes) {
        const pattern = new RegExp(`^${prefix}[｜|:：\\s-]*`, 'i');
        output = output.replace(pattern, '').trim();
    }
    return output || title;
}
function eventKind(row) {
    const text = `${row.title} ${row.status} ${row.keywords.join(' ')}`;
    const process = /(^|[｜|])流程|手续|登记|申请|审批|调查程序|制度流程|process/i.test(text);
    return process
        ? { label: '流程', name: cleanPrefixedTitle(row.title, ['流程']) }
        : { label: '事件', name: cleanPrefixedTitle(row.title, ['事件']) };
}
function ownerEntry(row, kind) {
    const escaped = kind.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = row.title.match(new RegExp(`^(.*?)[｜|:：\\s-]*${escaped}$`));
    if (match?.[1]?.trim()) {
        const owner = match[1].trim();
        return { comment: `MA｜${kind}｜${owner}`, name: owner, label: kind };
    }
    return kind === '物品与资源'
        ? { comment: `MA｜物品｜${row.title}`, name: row.title, label: '物品' }
        : { comment: `MA｜技能与能力｜${row.title}`, name: row.title, label: '技能与能力' };
}
function makeDocument(key, comment, content, keywords, constant, vectorized, order, kind) {
    return {
        key,
        comment: `[MA11] ${comment}`,
        content,
        keywords: uniq(keywords),
        constant,
        vectorized: constant ? false : vectorized,
        order,
        kind,
    };
}
export function unconsumedSmallSummaries(small, large) {
    const consumed = new Set(large.flatMap((item) => item.sourceKeys));
    return small.filter((item) => !consumed.has(item.id));
}
function currentSmallSummaryContent(summaries) {
    const blocks = summaries.map((item) => {
        const notes = item.sedimentation?.notes?.length
            ? `\n沉降处理：${item.sedimentation.notes.join('；')}`
            : '';
        return `【${item.title}】\n${item.summary}${notes}`;
    });
    return `[小总结：当前周期]\n${blocks.join('\n\n')}`;
}
export function buildSemanticLorebookDocuments(snapshot, smallSummaries, largeSummaries, options) {
    const documents = [];
    if (snapshot) {
        const foundationRows = rows(snapshot, 'foundations');
        documents.push(makeDocument('semantic:foundations', 'MA｜基础设定', groupedContent('基础设定', TABLE_LABELS.foundations, foundationRows), ['基础设定', ...foundationRows.flatMap(titleKeywords)], true, false, 170, 'semantic:foundations'));
        const globalRows = [
            ...rows(snapshot, 'spacetime'),
            ...rows(snapshot, 'events').filter(isGlobalRow),
            ...rows(snapshot, 'regions').filter(isGlobalRow),
        ];
        documents.push(makeDocument('semantic:global', 'MA｜全局态势', groupedContent('全局态势', '当前态势', globalRows), ['全局态势', '当前时间', '当前地点', ...globalRows.flatMap(titleKeywords)], options.latestContinuityConstant, false, 165, 'semantic:global'));
        for (const row of rows(snapshot, 'focus')) {
            documents.push(makeDocument(`semantic:focus:${row.id}`, `MA｜焦点｜${row.title}`, rowContent('焦点', row), titleKeywords(row), options.latestContinuityConstant, false, 160, 'semantic:focus'));
        }
        for (const row of rows(snapshot, 'characters')) {
            documents.push(makeDocument(`semantic:character:${row.id}`, `MA｜人物｜${row.title}`, rowContent('人物', row), titleKeywords(row), options.latestContinuityConstant && isCurrentCharacter(row), options.vectorize, isCurrentCharacter(row) ? 155 : 125, 'semantic:character'));
        }
        const relationRows = rows(snapshot, 'relationships');
        if (relationRows.length) {
            documents.push(makeDocument('semantic:relationships', 'MA｜关系网络', groupedContent('关系网络', TABLE_LABELS.relationships, relationRows), ['关系网络', ...relationRows.flatMap(titleKeywords)], false, options.vectorize, 145, 'semantic:relationships'));
        }
        for (const row of rows(snapshot, 'regions')) {
            documents.push(makeDocument(`semantic:region:${row.id}`, `MA｜区域｜${row.title}`, rowContent('区域', row), titleKeywords(row), false, options.vectorize, 130, 'semantic:region'));
        }
        for (const row of rows(snapshot, 'events')) {
            const classified = eventKind(row);
            documents.push(makeDocument(`semantic:${classified.label === '流程' ? 'process' : 'event'}:${row.id}`, `MA｜${classified.label}｜${classified.name}`, rowContent(classified.label, row), titleKeywords(row), false, options.vectorize, 135, classified.label === '流程' ? 'semantic:process' : 'semantic:event'));
        }
        for (const row of rows(snapshot, 'items')) {
            const info = ownerEntry(row, '物品与资源');
            documents.push(makeDocument(`semantic:item:${row.id}`, info.comment, rowContent(info.label, row), titleKeywords(row), false, options.vectorize, 120, 'semantic:item'));
        }
        for (const row of rows(snapshot, 'skills')) {
            const info = ownerEntry(row, '技能与能力');
            documents.push(makeDocument(`semantic:skill:${row.id}`, info.comment, rowContent(info.label, row), titleKeywords(row), false, options.vectorize, 118, 'semantic:skill'));
        }
    }
    const pendingSmall = unconsumedSmallSummaries(smallSummaries, largeSummaries);
    if (pendingSmall.length) {
        documents.push(makeDocument('semantic:small:current', 'MA｜小总结｜当前周期', currentSmallSummaryContent(pendingSmall), ['小总结', '当前周期', ...pendingSmall.flatMap((item) => [item.title, ...item.keywords])], options.latestContinuityConstant, options.vectorize, 150, 'semantic:small'));
    }
    const latestLarge = largeSummaries.at(-1);
    if (latestLarge) {
        documents.push(makeDocument('semantic:large:current', 'MA｜大总结｜长期沉降', `[大总结：长期沉降]\n${latestLarge.summary}`, ['大总结', '长期沉降', latestLarge.title, ...latestLarge.keywords], options.latestContinuityConstant, options.vectorize, 148, 'semantic:large'));
    }
    return documents;
}
export function buildDetailedLorebookDocuments(snapshot, smallSummaries, largeSummaries, options) {
    const documents = [];
    if (snapshot) {
        for (const tableKey of TABLE_KEYS) {
            for (const row of rows(snapshot, tableKey)) {
                const constant = ['focus', 'spacetime', 'foundations'].includes(tableKey);
                documents.push(makeDocument(`state:${tableKey}:${row.id}`, `MA｜${TABLE_LABELS[tableKey]}｜${row.title}`, rowContent(TABLE_LABELS[tableKey], row), titleKeywords(row), constant, options.vectorize, constant ? 140 : 100, `state:${tableKey}`));
            }
        }
    }
    for (const item of smallSummaries) {
        documents.push(makeDocument(`small:${item.id}`, `MA｜小总结｜${item.title}`, item.summary, [item.title, ...item.keywords], false, options.vectorize, 110, 'small'));
    }
    for (const item of largeSummaries) {
        documents.push(makeDocument(`large:${item.id}`, `MA｜大总结｜${item.title}`, item.summary, [item.title, ...item.keywords], false, options.vectorize, 120, 'large'));
    }
    return documents;
}
export function buildLorebookDocuments(snapshot, smallSummaries, largeSummaries, options) {
    return options.layout === 'detailed'
        ? buildDetailedLorebookDocuments(snapshot, smallSummaries, largeSummaries, options)
        : buildSemanticLorebookDocuments(snapshot, smallSummaries, largeSummaries, options);
}
