// ========== 工具函数 ==========

async function storageGet(key) {
  return new Promise(resolve => {
    chrome.storage.local.get(key, data => resolve(data[key] || null));
  });
}

async function storageSet(key, value) {
  return new Promise(resolve => {
    chrome.storage.local.set({ [key]: value }, resolve);
  });
}

async function storageRemove(key) {
  return new Promise(resolve => {
    chrome.storage.local.remove(key, resolve);
  });
}

async function storageGetAll() {
  return new Promise(resolve => {
    chrome.storage.local.get(null, data => resolve(data || {}));
  });
}

// 从 URL 或元素中提取 owner/repo
function extractRepoKey(text) {
  const match = text.match(/([a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+)/);
  return match ? match[1] : null;
}

function getCurrentRepoKey() {
  const path = location.pathname;
  const match = path.match(/^\/([^/]+\/[^/]+)/);
  if (!match) return null;
  const key = match[1];
  // 排除非仓库页面
  const excluded = ['settings', 'orgs', 'stars', 'notifications', 'explore', 'marketplace'];
  if (excluded.includes(key.split('/')[0])) return null;
  return key;
}

// ========== 浮窗面板 ==========

let activePanel = null;

function createPanel(repoKey, anchorEl) {
  // 关闭已有面板
  closePanel();

  const panel = document.createElement('div');
  panel.className = 'gsn-panel';
  panel.innerHTML = `
    <div class="gsn-panel-header">
      <span class="gsn-panel-repo">${repoKey}</span>
      <button class="gsn-close-btn">✕</button>
    </div>
    <div class="gsn-panel-body">
      <div class="gsn-field">
        <label>标签 <span class="gsn-hint">回车添加</span></label>
        <div class="gsn-tags-input-wrap">
          <div class="gsn-tags-list"></div>
          <input class="gsn-tag-input" type="text" placeholder="添加标签..." maxlength="20" />
        </div>
      </div>
      <div class="gsn-field">
        <label>备注</label>
        <textarea class="gsn-note-input" placeholder="记录用途、使用心得..." rows="4"></textarea>
      </div>
      <div class="gsn-actions">
        <button class="gsn-save-btn">保存</button>
        <button class="gsn-delete-btn" style="display: none">删除</button>
        <span class="gsn-saved-tip">已保存 ✓</span>
      </div>
    </div>
  `;

  document.body.appendChild(panel);
  activePanel = panel;

  // 定位
  positionPanel(panel, anchorEl);

  // 加载已有数据
  let currentTags = [];
  storageGet(repoKey).then(data => {
    if (data) {
      currentTags = data.tags || [];
      panel.querySelector('.gsn-note-input').value = data.note || '';
      panel.querySelector('.gsn-delete-btn').style.display = '';
      renderTags();
    }
  });

  // 渲染标签列表
  function renderTags() {
    const list = panel.querySelector('.gsn-tags-list');
    list.innerHTML = '';
    currentTags.forEach((tag, i) => {
      const span = document.createElement('span');
      span.className = 'gsn-tag';
      span.appendChild(document.createTextNode(tag));
      const delBtn = document.createElement('button');
      delBtn.textContent = '×';
      delBtn.onclick = () => {
        currentTags.splice(i, 1);
        renderTags();
      };
      span.appendChild(delBtn);
      list.appendChild(span);
    });
  }

  // 输入标签
  const tagInput = panel.querySelector('.gsn-tag-input');
  tagInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const val = tagInput.value.trim().replace(/,/g, '');
      if (val && !currentTags.includes(val) && currentTags.length < 10) {
        currentTags.push(val);
        renderTags();
      }
      tagInput.value = '';
    }
    if (e.key === 'Backspace' && !tagInput.value && currentTags.length) {
      currentTags.pop();
      renderTags();
    }
  });

  // 保存
  panel.querySelector('.gsn-save-btn').onclick = async () => {
    const note = panel.querySelector('.gsn-note-input').value.trim();
    const data = {
      tags: currentTags,
      note,
      updatedAt: new Date().toISOString().slice(0, 10)
    };
    await storageSet(repoKey, data);
    const tip = panel.querySelector('.gsn-saved-tip');
    tip.classList.add('visible');
    setTimeout(() => tip.classList.remove('visible'), 1500);
    // 刷新页面上的角标
    refreshBadge(repoKey, data);
  };

  // 删除
  panel.querySelector('.gsn-delete-btn').onclick = async () => {
    if (!confirm(`确定删除 ${repoKey} 的备注和标签？`)) return;
    await storageRemove(repoKey);
    closePanel();
    refreshBadge(repoKey, null);
    anchorEl.classList.remove('has-data');
  };

  // 关闭
  panel.querySelector('.gsn-close-btn').onclick = closePanel;

  return panel;
}

function positionPanel(panel, anchor) {
  const rect = anchor.getBoundingClientRect();
  const scrollY = window.scrollY;
  let top = rect.bottom + scrollY + 6;
  let left = rect.left + window.scrollX;

  panel.style.top = top + 'px';
  panel.style.left = left + 'px';

  // 防止超出右边界
  requestAnimationFrame(() => {
    const pw = panel.offsetWidth;
    const vw = window.innerWidth;
    if (left + pw > vw - 12) {
      panel.style.left = (vw - pw - 12) + 'px';
    }
  });
}

function closePanel() {
  if (activePanel) {
    activePanel.remove();
    activePanel = null;
  }
}

// 点击空白关闭
document.addEventListener('click', e => {
  if (activePanel && !activePanel.contains(e.target) && !e.target.classList.contains('gsn-note-btn')) {
    closePanel();
  }
}, true);

// ========== 角标 ==========

function refreshBadge(repoKey, data) {
  // 更新列表页角标
  document.querySelectorAll(`[data-gsn-repo="${repoKey}"]`).forEach(el => {
    updateBadgeEl(el, data);
  });
}

function updateBadgeEl(badgeEl, data) {
  if (!data || (!data.note && !data.tags?.length)) {
    badgeEl.classList.remove('has-data');
    badgeEl.removeAttribute('data-gsn-tip');
    return;
  }
  badgeEl.classList.add('has-data');
  let tip = '';
  if (data.tags?.length) tip += data.tags.map(t => `#${t}`).join(' ') + '\n';
  if (data.note) tip += data.note.slice(0, 100) + (data.note.length > 100 ? '…' : '');
  badgeEl.setAttribute('data-gsn-tip', tip.trim());
}

// ========== 详情页注入 ==========

async function injectRepoPage() {
  const repoKey = getCurrentRepoKey();
  if (!repoKey) return;

  // 找 Star 按钮区域（多种 GitHub 布局）
  const targets = [
    document.querySelector('div[data-view-component="true"].d-flex.gap-2'),
    document.querySelector('.starring-container'),
    document.querySelector('#repository-details-container'),
  ].filter(Boolean);

  if (!targets.length) return;
  if (document.querySelector('.gsn-note-btn-repo')) return;

  const btn = document.createElement('button');
  btn.className = 'gsn-note-btn gsn-note-btn-repo';
  btn.title = '添加备注 / 标签';
  btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M11.013 1.427a1.75 1.75 0 0 1 2.474 0l1.086 1.086a1.75 1.75 0 0 1 0 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 0 1-.927-.928l.929-3.25c.081-.286.235-.547.445-.758l8.61-8.61Zm1.414 1.06a.25.25 0 0 0-.354 0L10.811 3.75l1.439 1.44 1.263-1.263a.25.25 0 0 0 0-.354l-1.086-1.086ZM11.189 6.25 9.75 4.81l-6.286 6.287a.25.25 0 0 0-.064.108l-.558 1.953 1.953-.558a.25.25 0 0 0 .108-.064Z"/></svg>`;

  // 插入到第一个目标后
  targets[0].appendChild(btn);

  // 加载数据显示状态
  const data = await storageGet(repoKey);
  if (data?.note || data?.tags?.length) {
    btn.classList.add('has-data');
  }

  btn.addEventListener('click', e => {
    e.stopPropagation();
    if (activePanel) { closePanel(); return; }
    createPanel(repoKey, btn);
  });
}

// ========== 列表页注入 ==========

async function injectStarsPage() {
  // 同时支持列表视图和网格视图
  // 列表视图: li[data-starred-repo] 或 .col-12.d-block
  // 网格视图: .d-flex.flex-wrap 内的卡片

  const allData = await storageGetAll();

  // 找所有仓库条目
  const repoItems = findStarListItems();

  repoItems.forEach(item => {
    const linkEl = item.querySelector('a[href*="/"]');
    if (!linkEl) return;

    const href = linkEl.getAttribute('href') || '';
    const repoKey = href.replace(/^\//, '').split('/').slice(0, 2).join('/');
    if (!repoKey || !repoKey.includes('/')) return;
    if (item.querySelector('.gsn-badge')) return; // 已注入

    // 创建角标按钮
    const badge = document.createElement('button');
    badge.className = 'gsn-badge gsn-note-btn';
    badge.setAttribute('data-gsn-repo', repoKey);
    badge.title = '查看/编辑备注';
    badge.innerHTML = `<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M11.013 1.427a1.75 1.75 0 0 1 2.474 0l1.086 1.086a1.75 1.75 0 0 1 0 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 0 1-.927-.928l.929-3.25c.081-.286.235-.547.445-.758l8.61-8.61Zm1.414 1.06a.25.25 0 0 0-.354 0L10.811 3.75l1.439 1.44 1.263-1.263a.25.25 0 0 0 0-.354l-1.086-1.086ZM11.189 6.25 9.75 4.81l-6.286 6.287a.25.25 0 0 0-.064.108l-.558 1.953 1.953-.558a.25.25 0 0 0 .108-.064Z"/></svg>`;

    // 找仓库标题行（h3/h4），把 badge 插在标题文字旁边
    const titleEl = item.querySelector('h3, h4');
    if (titleEl) {
      titleEl.style.display = 'inline-flex';
      titleEl.style.alignItems = 'center';
      titleEl.style.gap = '6px';
      titleEl.appendChild(badge);
    } else {
      // 回退：插到条目末尾
      item.appendChild(badge);
    }

    // 初始化角标状态
    if (allData[repoKey]) {
      updateBadgeEl(badge, allData[repoKey]);
    }

    badge.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      if (activePanel) { closePanel(); return; }
      createPanel(repoKey, badge);
    });
  });
}

function findStarListItems() {
  const seen = new Set();
  const items = [];

  // 最可靠：直接找所有 owner/repo 格式的链接，向上找行容器
  // 这覆盖所有布局（列表、网格、tab 内嵌）
  document.querySelectorAll('a[href]').forEach(link => {
    const href = link.getAttribute('href') || '';
    // 严格匹配 /owner/repo 格式，排除子路径
    if (!/^\/[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(href)) return;
    // 排除非仓库类链接
    const excluded = ['settings', 'orgs', 'notifications', 'explore', 'marketplace', 'login', 'about'];
    const owner = href.split('/')[1];
    if (excluded.includes(owner)) return;

    // 向上找行容器，优先找有一定高度的块级容器
    const row = link.closest(
      'li, article, .Box-row, [data-view-component="true"].border-bottom, ' +
      '.col-12.py-4, .col-12.border-bottom, .d-flex.flex-column'
    ) || link.closest('li, div[class*="col-"]');

    if (row && !seen.has(row)) {
      seen.add(row);
      items.push(row);
    }
  });

  return items;
}

// ========== 初始化 & MutationObserver ==========

function isStarsPage() {
  // GitHub Stars 有几种路由形式：
  // 1. /stars （全局 stars 页）
  // 2. /yunfeng008/stars （个人主页 stars tab，独立路由）
  // 3. /yunfeng008?tab=stars 或 /?tab=stars （个人主页 tab 切换）
  // 4. 页面上有 [data-tab-item="stars"] 处于激活状态
  const p = location.pathname;
  const q = location.search;

  if (p === '/stars') return true;
  if (p.endsWith('/stars')) return true;
  if (q.includes('tab=stars')) return true;

  // 检查页面上是否有 stars tab 处于激活状态（应对 SPA tab 切换）
  const activeTab = document.querySelector(
    '[data-tab-item="stars"][aria-current="page"], ' +
    '[data-tab-item="stars"].selected, ' +
    'a[href$="?tab=stars"][aria-current="page"], ' +
    'a[href$="/stars"][aria-current="page"]'
  );
  return !!activeTab;
}

function init() {
  if (isStarsPage()) {
    injectStarsPage();
  } else {
    const repoKey = getCurrentRepoKey();
    if (repoKey) injectRepoPage();
  }
}

// 监听 GitHub SPA 路由变化
let lastUrl = location.href;
const observer = new MutationObserver(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    setTimeout(init, 800);
  } else {
    // DOM 变化时重新扫描（应对懒加载）
    if (isStarsPage()) {
      injectStarsPage();
    }
  }
});

observer.observe(document.body, { childList: true, subtree: true });

// 初次加载
setTimeout(() => {
  console.log('[GSN] init, isStarsPage =', isStarsPage(), 'path =', location.pathname, 'search =', location.search);
  init();
}, 800);
