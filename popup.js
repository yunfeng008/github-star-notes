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

    const tagsHtml = (val.tags || []).map(t => `<span class="tag">#${t}</span>`).join('');

    item.innerHTML = `
      <div class="item-top">
        <a class="item-repo" href="https://github.com/${repoKey}" target="_blank">${repoKey}</a>
        <span class="item-date">${val.updatedAt || ''}</span>
      </div>
      ${tagsHtml ? `<div class="item-tags">${tagsHtml}</div>` : ''}
      ${val.note ? `<div class="item-note">${escapeHtml(val.note)}</div>` : ''}
    `;

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
