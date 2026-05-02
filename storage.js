// 存储工具函数，content.js 和 popup.js 共用

const Storage = {
  async getAll() {
    return new Promise(resolve => {
      chrome.storage.local.get(null, data => resolve(data || {}));
    });
  },

  async get(repoKey) {
    return new Promise(resolve => {
      chrome.storage.local.get(repoKey, data => resolve(data[repoKey] || null));
    });
  },

  async set(repoKey, value) {
    return new Promise(resolve => {
      chrome.storage.local.set({ [repoKey]: value }, resolve);
    });
  },

  async remove(repoKey) {
    return new Promise(resolve => {
      chrome.storage.local.remove(repoKey, resolve);
    });
  },

  // 导出全部数据为 JSON 文件
  async exportJSON() {
    const data = await this.getAll();
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `github-star-notes-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
};
