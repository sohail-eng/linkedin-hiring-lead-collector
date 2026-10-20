// Hiring Lead Collector - Data Viewer
// Parses and displays CSV/JSON exports from the Chrome extension

const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const browseBtn = document.getElementById('browseBtn');
const statsSection = document.getElementById('statsSection');
const filtersSection = document.getElementById('filtersSection');
const tableSection = document.getElementById('tableSection');
const detailSection = document.getElementById('detailSection');
const closeDetail = document.getElementById('closeDetail');

const searchInput = document.getElementById('searchInput');
const emailFilter = document.getElementById('emailFilter');
const linkFilter = document.getElementById('linkFilter');
const companyFilter = document.getElementById('companyFilter');
const sortSelect = document.getElementById('sortSelect');

const leadsBody = document.getElementById('leadsBody');
const detailContent = document.getElementById('detailContent');
const pagination = document.getElementById('pagination');
const pageInfo = document.getElementById('pageInfo');
const prevPage = document.getElementById('prevPage');
const nextPage = document.getElementById('nextPage');

// Description modal elements
const descModal = document.getElementById('descModal');
const descModalContent = document.getElementById('descModalContent');
const closeDescModal = document.getElementById('closeDescModal');

const statElements = {
  totalLeads: document.getElementById('totalLeads'),
  withEmail: document.getElementById('withEmail'),
  withLink: document.getElementById('withLink'),
  withCompany: document.getElementById('withCompany')
};

let allLeads = [];
let filteredLeads = [];
let currentPage = 1;
const leadsPerPage = 25;
let companies = new Set();

// Event Listeners
uploadArea.addEventListener('click', () => fileInput.click());
uploadArea.addEventListener('dragover', handleDragOver);
uploadArea.addEventListener('dragleave', handleDragLeave);
uploadArea.addEventListener('drop', handleDrop);
fileInput.addEventListener('change', handleFileSelect);
browseBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  fileInput.click();
});

searchInput.addEventListener('input', debounce(applyFilters, 200));
emailFilter.addEventListener('change', applyFilters);
linkFilter.addEventListener('change', applyFilters);
companyFilter.addEventListener('change', applyFilters);
sortSelect.addEventListener('change', applyFilters);

prevPage.addEventListener('click', () => changePage(-1));
nextPage.addEventListener('click', () => changePage(1));
closeDetail.addEventListener('click', closeDetailPanel);

// Description modal events
closeDescModal.addEventListener('click', closeDescModalFn);
descModal.addEventListener('click', (e) => {
  if (e.target === descModal) closeDescModalFn();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (descModal.classList.contains('visible')) closeDescModalFn();
    if (detailSection.classList.contains('visible')) closeDetailPanel();
  }
});

// Drag & Drop handlers
function handleDragOver(e) {
  e.preventDefault();
  uploadArea.classList.add('dragover');
}

function handleDragLeave(e) {
  e.preventDefault();
  uploadArea.classList.remove('dragover');
}

function handleDrop(e) {
  e.preventDefault();
  uploadArea.classList.remove('dragover');
  const file = e.dataTransfer.files[0];
  if (file) processFile(file);
}

function handleFileSelect(e) {
  const file = e.target.files[0];
  if (file) processFile(file);
}

// Process uploaded file
function processFile(file) {
  const validTypes = ['text/csv', 'application/json', 'text/plain'];
  const validExt = ['.csv', '.json'];
  const ext = '.' + file.name.split('.').pop().toLowerCase();
  
  if (!validTypes.includes(file.type) && !validExt.includes(ext)) {
    alert('Please upload a .csv or .json file');
    return;
  }

  showLoading(true);
  uploadArea.querySelector('h3').textContent = 'Processing...';
  uploadArea.querySelector('p').textContent = `Reading ${file.name}...`;

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      let leads = [];
      if (ext === '.json' || file.type === 'application/json') {
        leads = parseJSON(e.target.result);
      } else {
        leads = parseCSV(e.target.result);
      }
      
      if (leads.length === 0) {
        alert('No valid leads found in file');
        resetUploadArea();
        return;
      }
      
      allLeads = normalizeLeads(leads);
      buildCompanyList();
      applyFilters();
      showDataSections();
      showLoading(false);
    } catch (err) {
      console.error('Parse error:', err);
      alert('Error parsing file: ' + err.message);
      resetUploadArea();
      showLoading(false);
    }
  };
  reader.onerror = () => {
    alert('Error reading file');
    resetUploadArea();
    showLoading(false);
  };
  reader.readAsText(file);
}

function showLoading(loading) {
  if (loading) {
    uploadArea.classList.add('loading');
    browseBtn.disabled = true;
    browseBtn.innerHTML = '<span class="loading"></span> Loading...';
  } else {
    uploadArea.classList.remove('loading');
    browseBtn.disabled = false;
    browseBtn.textContent = 'Browse Files';
  }
}

function resetUploadArea() {
  uploadArea.querySelector('h3').textContent = 'Drag & Drop or Click to Upload';
  uploadArea.querySelector('p').textContent = 'Supports .csv and .json files exported from the extension';
  fileInput.value = '';
  showLoading(false);
}

function showDataSections() {
  statsSection.classList.remove('hidden');
  filtersSection.classList.remove('hidden');
  tableSection.classList.remove('hidden');
  uploadArea.style.display = 'none';
}

// Parse CSV
function parseCSV(text) {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];
  
  const headers = parseCSVLine(lines[0]);
  const leads = [];
  
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length === headers.length) {
      const lead = {};
      headers.forEach((h, idx) => lead[h] = values[idx]);
      leads.push(lead);
    }
  }
  return leads;
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result.map(v => v.trim());
}

// Parse JSON
function parseJSON(text) {
  const data = JSON.parse(text);
  if (Array.isArray(data)) return data;
  if (data.leads && Array.isArray(data.leads)) return data.leads;
  if (data.records && Array.isArray(data.records)) return data.records;
  return [];
}

// Normalize lead data from different export formats
function normalizeLeads(leads) {
  return leads.map(lead => ({
    post_date: lead.post_date || lead.date || '',
    description: lead.description || lead.text || lead.content || '',
    emails: parseArrayField(lead.emails),
    application_links: parseArrayField(lead.application_links),
    author_name: lead.author_name || lead.author || lead.name || '',
    company: lead.company || '',
    post_url: lead.post_url || lead.url || lead.link || '',
    search_keyword: lead.search_keyword || lead.keywords || '',
    collected_at: lead.collected_at || lead.collectedAt || '',
    relevance: lead.relevance || 'Needs review',
    relevance_reason: lead.relevance_reason || '',
    ollama_decision: lead.ollama_decision || '',
    guard_decision: lead.guard_decision || '',
    guard_confidence: lead.guard_confidence ?? '',
    guard_reason: lead.guard_reason || '',
    classification_source: lead.classification_source || '',
    application_status: lead.application_status || lead.status || 'New',
    original_date_label: lead.original_date_label || lead.dateLabel || ''
  }));
}

function parseArrayField(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    // Handle semicolon-separated (CSV export format)
    return value.split(/[;,]\s*/).filter(v => v.trim());
  }
  return [];
}

function buildCompanyList() {
  companies.clear();
  allLeads.forEach(lead => {
    if (lead.company) companies.add(lead.company);
  });
  
  // Update company filter dropdown
  const currentValue = companyFilter.value;
  companyFilter.innerHTML = '<option value="">All Companies</option>';
  [...companies].sort().forEach(company => {
    const opt = document.createElement('option');
    opt.value = company;
    opt.textContent = company;
    companyFilter.appendChild(opt);
  });
  companyFilter.value = currentValue;
}

function applyFilters() {
  const search = searchInput.value.toLowerCase().trim();
  const emailVal = emailFilter.value;
  const linkVal = linkFilter.value;
  const companyVal = companyFilter.value;
  const sortVal = sortSelect.value;
  
  filteredLeads = allLeads.filter(lead => {
    // Search filter
    if (search) {
      const searchable = [
        lead.author_name,
        lead.company,
        lead.description,
        lead.emails.join(' '),
        lead.application_links.join(' ')
      ].join(' ').toLowerCase();
      if (!searchable.includes(search)) return false;
    }
    
    // Email filter
    if (emailVal === 'has-email' && lead.emails.length === 0) return false;
    if (emailVal === 'no-email' && lead.emails.length > 0) return false;
    
    // Link filter
    if (linkVal === 'has-link' && lead.application_links.length === 0) return false;
    if (linkVal === 'no-link' && lead.application_links.length > 0) return false;
    
    // Company filter
    if (companyVal && lead.company !== companyVal) return false;
    
    return true;
  });
  
  // Sort
  filteredLeads.sort((a, b) => {
    switch (sortVal) {
      case 'date-asc': return compareDates(a.post_date, b.post_date);
      case 'date-desc': return compareDates(b.post_date, a.post_date);
      case 'author-asc': return a.author_name.localeCompare(b.author_name);
      case 'author-desc': return b.author_name.localeCompare(a.author_name);
      default: return 0;
    }
  });
  
  currentPage = 1;
  renderTable();
  updateStats();
}

function compareDates(a, b) {
  const da = a ? new Date(a).getTime() : 0;
  const db = b ? new Date(b).getTime() : 0;
  return da - db;
}

function updateStats() {
  statElements.totalLeads.textContent = allLeads.length;
  statElements.withEmail.textContent = allLeads.filter(l => l.emails.length > 0).length;
  statElements.withLink.textContent = allLeads.filter(l => l.application_links.length > 0).length;
  statElements.withCompany.textContent = allLeads.filter(l => l.company).length;
}

function renderTable() {
  const start = (currentPage - 1) * leadsPerPage;
  const end = start + leadsPerPage;
  const pageLeads = filteredLeads.slice(start, end);
  
  if (pageLeads.length === 0) {
    leadsBody.innerHTML = `
      <tr>
        <td colspan="8" class="empty-state">
          <div class="empty-state-icon">📭</div>
          <p>No leads match your filters</p>
        </td>
      </tr>
    `;
  } else {
    leadsBody.innerHTML = pageLeads.map((lead, idx) => `
      <tr data-index="${start + idx}">
        <td>${formatDate(lead.post_date)}</td>
        <td>${escapeHtml(lead.author_name || '—')}</td>
        <td>${escapeHtml(lead.company || '—')}</td>
        <td class="description-cell" data-desc-index="${start + idx}">${truncate(escapeHtml(lead.description), 120)}</td>
        <td>${renderEmails(lead.emails)}</td>
        <td>${renderLinks(lead.application_links)}</td>
        <td>${renderPostUrl(lead.post_url)}</td>
        <td><span class="relevance-badge ${lead.relevance === 'Likely hiring' ? 'hiring' : 'review'}">${escapeHtml(lead.relevance)}</span></td>
      </tr>
    `).join('');
  }
  
  // Pagination
  const totalPages = Math.ceil(filteredLeads.length / leadsPerPage);
  pageInfo.textContent = `Page ${currentPage} of ${totalPages || 1}`;
  prevPage.disabled = currentPage <= 1;
  nextPage.disabled = currentPage >= totalPages;

  // Attach event listeners after render
  attachTableListeners();
}

function attachTableListeners() {
  // Row click for detail panel
  leadsBody.querySelectorAll('tr[data-index]').forEach(row => {
    row.addEventListener('click', (e) => {
      // Don't open detail if clicking on description cell or links
      if (e.target.closest('.description-cell') || e.target.closest('a')) return;
      const index = parseInt(row.dataset.index, 10);
      openDetail(index);
    });
  });

  // Description cell click for modal
  leadsBody.querySelectorAll('.description-cell[data-desc-index]').forEach(cell => {
    cell.addEventListener('click', (e) => {
      e.stopPropagation();
      const index = parseInt(cell.dataset.descIndex, 10);
      openDescModal(index);
    });
  });
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return dateStr;
  }
}

function truncate(text, maxLen) {
  if (!text) return '—';
  return text.length > maxLen ? text.slice(0, maxLen) + '…' : text;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function renderEmails(emails) {
  if (!emails || emails.length === 0) return '<span style="color: var(--text-muted)">—</span>';
  return emails.map(e => `<a href="mailto:${escapeHtml(e)}">${escapeHtml(e)}</a>`).join('<br>');
}

function renderLinks(links) {
  if (!links || links.length === 0) return '<span style="color: var(--text-muted)">—</span>';
  return links.map(l => `<a href="${escapeHtml(l)}" target="_blank" rel="noopener">${truncate(escapeHtml(l), 35)}</a>`).join('<br>');
}

function renderPostUrl(url) {
  if (!url) return '<span style="color: var(--text-muted)">—</span>';
  return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">View Post</a>`;
}

function changePage(delta) {
  const totalPages = Math.ceil(filteredLeads.length / leadsPerPage);
  const newPage = currentPage + delta;
  if (newPage >= 1 && newPage <= totalPages) {
    currentPage = newPage;
    renderTable();
  }
}

function openDetail(index) {
  const lead = filteredLeads[index];
  if (!lead) return;
  
  detailContent.innerHTML = `
    <div class="detail-field">
      <div class="detail-label">Author</div>
      <div class="detail-value">${escapeHtml(lead.author_name || '—')}</div>
    </div>
    <div class="detail-field">
      <div class="detail-label">Company</div>
      <div class="detail-value">${escapeHtml(lead.company || '—')}</div>
    </div>
    <div class="detail-field">
      <div class="detail-label">Post Date</div>
      <div class="detail-value">${formatDate(lead.post_date)}</div>
    </div>
    <div class="detail-field">
      <div class="detail-label">Original Date Label</div>
      <div class="detail-value">${escapeHtml(lead.original_date_label || '—')}</div>
    </div>
    <div class="detail-field">
      <div class="detail-label">Collected At</div>
      <div class="detail-value">${formatDate(lead.collected_at)}</div>
    </div>
    <div class="detail-field">
      <div class="detail-label">Relevance</div>
      <div class="detail-value"><span class="relevance-badge ${lead.relevance === 'Likely hiring' ? 'hiring' : 'review'}">${escapeHtml(lead.relevance)}</span></div>
    </div>
    <div class="detail-field">
      <div class="detail-label">JavaScript Guard Decision</div>
      <div class="detail-value">${escapeHtml(lead.guard_decision || '—')}</div>
    </div>
    ${lead.guard_confidence !== '' ? `
      <div class="detail-field">
        <div class="detail-label">Guard Confidence (heuristic)</div>
        <div class="detail-value">${escapeHtml(String(lead.guard_confidence))}</div>
      </div>
    ` : ''}
    ${lead.guard_reason ? `
      <div class="detail-field">
        <div class="detail-label">Guard Reason</div>
        <div class="detail-value">${escapeHtml(lead.guard_reason)}</div>
      </div>
    ` : ''}
    ${lead.ollama_decision ? `
      <div class="detail-field">
        <div class="detail-label">Ollama Decision</div>
        <div class="detail-value">${escapeHtml(lead.ollama_decision)}</div>
      </div>
    ` : ''}
    ${lead.classification_source ? `
      <div class="detail-field">
        <div class="detail-label">Classification Source</div>
        <div class="detail-value">${escapeHtml(lead.classification_source)}</div>
      </div>
    ` : ''}
    ${lead.relevance_reason ? `
      <div class="detail-field">
        <div class="detail-label">AI Relevance Reason</div>
        <div class="detail-value">${escapeHtml(lead.relevance_reason)}</div>
      </div>
    ` : ''}
    <div class="detail-field">
      <div class="detail-label">Application Status</div>
      <div class="detail-value">${escapeHtml(lead.application_status)}</div>
    </div>
    <div class="detail-field">
      <div class="detail-label">Search Keywords</div>
      <div class="detail-value">${escapeHtml(lead.search_keyword || '—')}</div>
    </div>
    <div class="detail-field">
      <div class="detail-label">Emails (${lead.emails?.length || 0})</div>
      <div class="detail-value detail-links">
        ${lead.emails?.length ? lead.emails.map(e => `<a class="detail-link" href="mailto:${escapeHtml(e)}">${escapeHtml(e)}</a>`).join('') : '<span style="color: var(--text-muted)">—</span>'}
      </div>
    </div>
    <div class="detail-field">
      <div class="detail-label">Apply Links (${lead.application_links?.length || 0})</div>
      <div class="detail-value detail-links">
        ${lead.application_links?.length ? lead.application_links.map(l => `<a class="detail-link" href="${escapeHtml(l)}" target="_blank" rel="noopener">${truncate(escapeHtml(l), 50)}</a>`).join('') : '<span style="color: var(--text-muted)">—</span>'}
      </div>
    </div>
    <div class="detail-field">
      <div class="detail-label">Post URL</div>
      <div class="detail-value">
        ${lead.post_url ? `<a class="detail-link" href="${escapeHtml(lead.post_url)}" target="_blank" rel="noopener">Open on LinkedIn</a>` : '<span style="color: var(--text-muted)">—</span>'}
      </div>
    </div>
    <div class="detail-field">
      <div class="detail-label">Description</div>
      <div class="detail-value" style="white-space: pre-wrap; max-height: 300px; overflow-y: auto;">${escapeHtml(lead.description || '—')}</div>
    </div>
  `;
  
  detailSection.classList.add('visible');
  document.body.style.overflow = 'hidden';
}

function closeDetailPanel() {
  detailSection.classList.remove('visible');
  document.body.style.overflow = '';
}

function openDescModal(index) {
  const lead = filteredLeads[index];
  if (!lead) return;
  
  descModalContent.textContent = lead.description || '—';
  descModal.classList.add('visible');
  document.body.style.overflow = 'hidden';
}

function closeDescModalFn() {
  descModal.classList.remove('visible');
  document.body.style.overflow = '';
}

function debounce(fn, delay) {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn.apply(this, args), delay);
  };
}

// Make functions globally accessible
window.openDetail = openDetail;
window.openDescModal = openDescModal;

// Main tabs: Data Viewer / Auto-Apply
(function initTabs() {
  const buttons = document.querySelectorAll('.tab-btn');
  const panels = {
    viewer: document.getElementById('panelViewer'),
    apply: document.getElementById('panelApply')
  };

  buttons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      buttons.forEach((b) => {
        const active = b === btn;
        b.classList.toggle('active', active);
        b.setAttribute('aria-selected', active ? 'true' : 'false');
      });
      Object.entries(panels).forEach(([name, panel]) => {
        if (!panel) return;
        const active = name === tab;
        panel.classList.toggle('active', active);
        panel.hidden = !active;
      });
    });
  });

  const copyBtn = document.getElementById('copyCvPromptBtn');
  const promptEl = document.getElementById('cvCompressPrompt');
  if (copyBtn && promptEl) {
    copyBtn.addEventListener('click', async () => {
      const text = promptEl.textContent || '';
      try {
        await navigator.clipboard.writeText(text);
        const previous = copyBtn.textContent;
        copyBtn.textContent = 'Copied';
        setTimeout(() => {
          copyBtn.textContent = previous;
        }, 1500);
      } catch (_) {
        copyBtn.textContent = 'Copy failed';
      }
    });
  }
})();