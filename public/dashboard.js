async function apiFetch(url, options){
  try{ const res = await fetch(url, options); if(!res.ok){ const txt = await res.text(); throw new Error(txt || res.statusText); } return await res.json(); } catch (e){ throw e; }
}

async function loadItems(){
  const tbody = document.getElementById('items-body');
  const q = (document.getElementById('search-q') || {}).value || '';
  const sortBy = (document.getElementById('sort-by') || {}).value || '';
  try{
    const params = new URLSearchParams();
    if(q) params.set('q', q);
    if(sortBy) params.set('sortBy', sortBy);
    const items = await apiFetch('/api/exercises' + (params.toString() ? ('?' + params.toString()) : ''));
    if(!items || !items.length){ tbody.innerHTML = '<tr><td colspan="7" class="muted">No items</td></tr>'; return; }
    tbody.innerHTML = '';
    items.forEach(it =>{
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${it.id}</td><td>${escapeHtml(it.title)}</td><td>${escapeHtml(it.description)}</td><td>${escapeHtml(it.muscle||'')}</td><td>${escapeHtml(it.difficulty||'')}</td><td>${escapeHtml(it.durationMinutes||'')}</td><td class="actions"><button data-id="${it.id}" class="edit">Edit</button><button data-id="${it.id}" class="del">Delete</button></td>`;
      tbody.appendChild(tr);
    });
  }catch(e){ tbody.innerHTML = '<tr><td colspan="7" class="muted">Failed to load</td></tr>'; }
}

function escapeHtml(s){ return String(s).replace(/[&<>'"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\'':'&#39;','"':'&quot;'})[c]||c); }

// create
document.getElementById('create-form').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const title = document.getElementById('title').value.trim();
  const description = document.getElementById('description').value.trim();
  const muscle = document.getElementById('muscle').value.trim();
  const difficulty = document.getElementById('difficulty').value.trim();
  const duration = Number(document.getElementById('duration').value || 0);
  if(!title || !description){ alert('Title and description required'); return; }
  try{ await apiFetch('/api/exercises', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ title, description, muscle, difficulty, durationMinutes: duration }) }); document.getElementById('title').value=''; document.getElementById('description').value=''; document.getElementById('muscle').value=''; document.getElementById('difficulty').value=''; document.getElementById('duration').value=''; loadItems(); } catch(e){ if(e.message.includes('Unauthorized')){ alert('Please login to create'); window.location='/login'; } else alert('Create failed'); }
});

// delegate edit/delete
document.getElementById('items-body').addEventListener('click', async (e)=>{
  const id = e.target.getAttribute('data-id');
  if(e.target.classList.contains('del')){
    if(!confirm('Delete?')) return;
    try{ await apiFetch(`/api/exercises/${id}`, { method:'DELETE' }); loadItems(); } catch(e){ if(e.message.includes('Unauthorized')){ alert('Please login to delete'); window.location='/login'; } else alert('Delete failed'); }
  }
  if(e.target.classList.contains('edit')){
    try{ const item = await apiFetch(`/api/exercises/${id}`); document.getElementById('edit-id').value = item.id; document.getElementById('edit-title').value = item.title; document.getElementById('edit-description').value = item.description; document.getElementById('edit-muscle').value = item.muscle||''; document.getElementById('edit-difficulty').value = item.difficulty||''; document.getElementById('edit-duration').value = item.durationMinutes||''; window.scrollTo(0,0); } catch(e){ alert('Load failed'); }
  }
});

// update
document.getElementById('edit-form').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const id = document.getElementById('edit-id').value;
  const title = document.getElementById('edit-title').value.trim();
  const description = document.getElementById('edit-description').value.trim();
  const muscle = document.getElementById('edit-muscle').value.trim();
  const difficulty = document.getElementById('edit-difficulty').value.trim();
  const duration = Number(document.getElementById('edit-duration').value || 0);
  if(!id || !title || !description){ alert('All fields required'); return; }
  try{ await apiFetch(`/api/exercises/${id}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ title, description, muscle, difficulty, durationMinutes: duration }) }); document.getElementById('edit-id').value=''; document.getElementById('edit-title').value=''; document.getElementById('edit-description').value=''; document.getElementById('edit-muscle').value=''; document.getElementById('edit-difficulty').value=''; document.getElementById('edit-duration').value=''; loadItems(); } catch(e){ if(e.message.includes('Unauthorized')){ alert('Please login to update'); window.location='/login'; } else alert('Update failed'); }
});

// wire filters
const applyBtn = document.getElementById('apply-filters');
if(applyBtn) applyBtn.addEventListener('click', ()=> loadItems());
const searchInput = document.getElementById('search-q');
if(searchInput) searchInput.addEventListener('keydown', (e)=>{ if(e.key === 'Enter') loadItems(); });

loadItems();
