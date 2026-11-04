let allData = {};
let searchQuery = '';

async function loadData() {
  return new Promise(resolve => {
    chrome.storage.local.get(null, data => resolve(data || {}));
  });
}

function exportJSON(data) {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `github-star-notes-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// 校验并合并导入数据：本地没有的新增，两边都有的取 updatedAt 更新的（相同则导入的赢）
function mergeImported(existingData, imported) {
  const toSet = {};
  let added = 0, updated = 0, skipped = 0;

  for (const [key, val] of Object.entries(imported)) {
    if (!/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(key) ||
        typeof val !== 'object' || val === null || Array.isArray(val)) {
      skipped++;
      continue;
    }
    const clean = {
      tags: Array.isArray(val.tags) ? val.tags.filter(t => typeof t === 'string').slice(0, 10) : [],
      note: typeof val.note === 'string' ? val.note : '',
      updatedAt: typeof val.updatedAt === 'string' ? val.updatedAt : ''
    };
    const existing = existingData[key];
    if (!existing) {
      toSet[key] = clean;
      added++;
    } else if ((clean.updatedAt || '') >= (existing.updatedAt || '')) {
      toSet[key] = clean;
      updated++;
    } else {
      skipped++;
    }
  }

  return { toSet, added, updated, skipped };
}

function renderList(data, query) {
  const list = document.getElementById('list');
  const countEl = document.getElementById('count');

  const entries = Object.entries(data).sort((a, b) => {
    return (b[1].updatedAt || '').localeCompare(a[1].updatedAt || '');
  });

  countEl.textContent = `${entries.length} 条`;

  // 过滤
  const q = query.trim().toLowerCase();
  const filtered = q
    ? entries.filter(([key, val]) => {
        return (
          key.toLowerCase().includes(q) ||
          (val.note || '').toLowerCase().includes(q) ||
          (val.tags || []).some(t => t.toLowerCase().includes(q))
        );
      })
    : entries;

  list.innerHTML = '';

  if (entries.length === 0) {
    list.innerHTML = `
      <div class="empty">
        <div class="empty-icon">✦</div>
        <div class="empty-text">还没有备注<br>去 GitHub 仓库页面点击编辑按钮开始记录吧</div>
      </div>`;
    return;
  }

  if (filtered.length === 0) {
    list.innerHTML = `<div class="no-result">没有匹配的结果</div>`;
    return;
  }

  filtered.forEach(([repoKey, val]) => {
    const item = document.createElement('div');
    item.className = 'item';

    const tagsHtml = (val.tags || []).map(t => `<span class="tag">#${escapeHtml(t)}</span>`).join('');

    item.innerHTML = `
      <div class="item-top">
        <a class="item-repo" href="https://github.com/${escapeHtml(repoKey)}" target="_blank">${escapeHtml(repoKey)}</a>
        <span class="item-right">
          <span class="item-date">${escapeHtml(val.updatedAt || '')}</span>
          <button class="item-del" title="删除这条备注">×</button>
        </span>
      </div>
      ${tagsHtml ? `<div class="item-tags">${tagsHtml}</div>` : ''}
      ${val.note ? `<div class="item-note">${escapeHtml(val.note)}</div>` : ''}
    `;

    item.querySelector('.item-del').addEventListener('click', e => {
      e.stopPropagation();
      if (!confirm(`确定删除 ${repoKey} 的备注？`)) return;
      chrome.storage.local.remove(repoKey, () => {
        delete allData[repoKey];
        renderList(allData, searchQuery);
      });
    });

    list.appendChild(item);
  });
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// 初始化
loadData().then(data => {
  allData = data;
  renderList(data, '');
});

// 搜索
document.getElementById('searchInput').addEventListener('input', e => {
  searchQuery = e.target.value;
  renderList(allData, searchQuery);
});

// 导出
document.getElementById('exportBtn').addEventListener('click', () => {
  loadData().then(data => exportJSON(data));
});

// 导入
document.getElementById('importBtn').addEventListener('click', () => {
  document.getElementById('importFile').click();
});

document.getElementById('importFile').addEventListener('change', e => {
  const file = e.target.files[0];
  e.target.value = ''; // 允许再次选择同一文件
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    let imported;
    try {
      imported = JSON.parse(reader.result);
    } catch (err) {
      alert('导入失败：不是有效的 JSON 文件');
      return;
    }
    if (typeof imported !== 'object' || imported === null || Array.isArray(imported)) {
      alert('导入失败：文件格式不正确（应为导出的 JSON 格式）');
      return;
    }

    const { toSet, added, updated, skipped } = mergeImported(allData, imported);
    const keys = Object.keys(toSet);
    if (!keys.length) {
      alert(`没有需要导入的数据（本地已是最新）${skipped ? `，跳过 ${skipped} 条` : ''}`);
      return;
    }
    chrome.storage.local.set(toSet, () => {
      Object.assign(allData, toSet);
      renderList(allData, searchQuery);
      alert(`导入完成：新增 ${added} 条，更新 ${updated} 条${skipped ? `，跳过 ${skipped} 条（本地较新或格式无效）` : ''}`);
    });
  };
  reader.readAsText(file);
});
