(function () {
  'use strict';

  const CONFIG = {
    owner: 'perarasuwork',
    repo: 'qr-game',
    branch: 'main',
    folder: 'file'
  };

  const list = document.getElementById('file-list');
  const status = document.getElementById('status');
  const count = document.getElementById('count');
  const empty = document.getElementById('empty');
  const refresh = document.getElementById('refresh');
  const template = document.getElementById('file-row-template');

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return 'Unknown size';
    const units = ['B', 'KB', 'MB', 'GB'];
    let value = bytes;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
      value /= 1024;
      unit++;
    }
    return (unit === 0 ? value : value.toFixed(value >= 10 ? 1 : 2)) + ' ' + units[unit];
  }

  function extension(name) {
    const dot = name.lastIndexOf('.');
    if (dot < 0 || dot === name.length - 1) return 'file';
    return name.slice(dot + 1).slice(0, 5);
  }

  function fileHref(name) {
    return CONFIG.folder + '/' + name.split('/').map(encodeURIComponent).join('/');
  }

  function apiUrl() {
    return 'https://api.github.com/repos/' + CONFIG.owner + '/' + CONFIG.repo +
      '/contents/' + encodeURIComponent(CONFIG.folder) + '?ref=' + encodeURIComponent(CONFIG.branch);
  }

  function render(files) {
    list.innerHTML = '';
    empty.hidden = files.length > 0;
    count.textContent = String(files.length);

    files.forEach(file => {
      const row = template.content.firstElementChild.cloneNode(true);
      row.querySelector('.file-type').textContent = extension(file.name);
      row.querySelector('h3').textContent = file.name;
      row.querySelector('p').textContent = formatBytes(file.size);

      const link = row.querySelector('.download');
      link.href = fileHref(file.name);
      link.setAttribute('download', file.name);
      link.setAttribute('aria-label', 'Download ' + file.name);

      list.appendChild(row);
    });
  }

  function loadFiles() {
    document.body.classList.remove('is-error');
    status.textContent = 'Loading files...';
    refresh.disabled = true;

    fetch(apiUrl(), { headers: { Accept: 'application/vnd.github+json' } })
      .then(response => {
        if (!response.ok) throw new Error('Could not load the file folder');
        return response.json();
      })
      .then(data => {
        const files = Array.isArray(data)
          ? data.filter(item => item.type === 'file').sort((a, b) => a.name.localeCompare(b.name))
          : [];
        render(files);
        status.textContent = files.length ? 'Ready to download' : 'The file folder is empty';
      })
      .catch(error => {
        render([]);
        document.body.classList.add('is-error');
        status.textContent = error.message || 'Could not load files';
      })
      .finally(() => {
        refresh.disabled = false;
      });
  }

  refresh.addEventListener('click', loadFiles);
  loadFiles();
})();
