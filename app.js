let allEvents = [];
let selectedCategories = new Set();
let selectedDepts = new Set();
let currentOffset = 0;
const BATCH_SIZE = 500;
let isFetching = false;

// Cookie Helpers
function setCookie(name, value, days = 30) {
    try {
        const expires = new Date(Date.now() + days * 864e5).toUTCString();
        document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Strict`;
    } catch (e) { console.error(e); }
}

function getCookie(name) {
    try {
        return document.cookie.split('; ').reduce((r, v) => {
            const parts = v.split('=');
            return parts[0] === name ? decodeURIComponent(parts[1]) : r;
        }, '');
    } catch (e) { return ''; }
}

function normalizeData(rawData) {
    // Some API responses are wrapped in a 'value' property
    const events = Array.isArray(rawData) ? rawData : (rawData.value || []);
    
    return events.map(event => {
        const startDate = event.StartDateTime ? new Date(event.StartDateTime.replace(' ', 'T')) : null;
        const endDate = event.EndDateTime ? new Date(event.EndDateTime.replace(' ', 'T')) : null;
        const tags = event.TagsNames ? event.TagsNames.split(',').map(t => t.trim()).filter(t => t) : [];
        const depts = event.DeptNames ? event.DeptNames.split(',').map(d => d.trim()).filter(d => d) : [];

        return {
            id: event.OccurrenceId || event.EventId || Math.random().toString(36).substr(2, 9),
            title: event.Title || 'Untitled Event',
            date: startDate,
            endDate: endDate,
            location: event.LocationName || event.field_event_location || 'TBD',
            description: (event.Description || event.ShortDescription || 'No description available.').replace(/<[^>]*>?/gm, ''),
            isFree: event.IsFree === "true" || event.IsFree === true || event.LowPrice === "0.0" || !event.LowPrice,
            price: event.PriceDescription || (event.LowPrice === "0.0" ? "Free" : event.LowPrice) || 'Free',
            url: event.FullUrl || '#',
            type: event.CategoryName || (event.DeptNames === "Academic Calendar" ? "Academic" : "Other"),
            imgUrl: event.ImgUrl || null,
            imgAlt: event.ImgAlt || '',
            tags: tags,
            depts: depts
        };
    }).filter(event => event.date !== null);
}

function populateFilters() {
    const categories = [...new Set(allEvents.map(e => e.type))].sort();
    const depts = [...new Set(allEvents.flatMap(e => e.depts))].sort();
    
    const catContainer = document.getElementById('category-filters');
    if (catContainer) {
        catContainer.innerHTML = '';
        categories.forEach(cat => {
            const chip = document.createElement('span');
            chip.className = `category-chip ${selectedCategories.has(cat) ? 'active' : ''}`;
            chip.textContent = cat;
            chip.onclick = () => {
                if (selectedCategories.has(cat)) selectedCategories.delete(cat);
                else selectedCategories.add(cat);
                chip.classList.toggle('active');
                updateUI();
            };
            catContainer.appendChild(chip);
        });
    }

    const deptSelect = document.getElementById('dept-select');
    if (deptSelect) {
        const currentVal = deptSelect.value;
        deptSelect.innerHTML = '<option value="all">All Departments</option>';
        depts.forEach(dept => {
            const opt = document.createElement('option');
            opt.value = dept;
            opt.textContent = dept;
            deptSelect.appendChild(opt);
        });
        deptSelect.value = currentVal;
    }
}

function renderEvents(eventsArray) {
    const appContainer = document.getElementById('app');
    const viewMode = document.getElementById('view-select').value;
    const groupMode = document.getElementById('group-select').value;
    
    appContainer.innerHTML = '';
    appContainer.className = `view-${viewMode}`;

    document.getElementById('event-count').textContent = `Showing ${eventsArray.length} event${eventsArray.length === 1 ? '' : 's'}`;

    if (eventsArray.length === 0) {
        appContainer.innerHTML = '<p class="empty-state">No events match your criteria.</p>';
        return;
    }

    if (viewMode === 'table') {
        renderTableView(eventsArray, appContainer);
    } else if (viewMode === 'calendar') {
        renderCalendarView(eventsArray, appContainer);
    } else if (groupMode === 'none') {
        eventsArray.forEach(event => appContainer.appendChild(createEventCard(event, viewMode)));
    } else {
        const groups = groupEvents(eventsArray, groupMode);
        for (const [groupName, groupItems] of Object.entries(groups)) {
            const header = document.createElement('h2');
            header.className = 'group-header';
            header.textContent = groupName;
            appContainer.appendChild(header);
            groupItems.forEach(event => appContainer.appendChild(createEventCard(event, viewMode)));
        }
    }
}

function renderTableView(events, container) {
    const table = document.createElement('table');
    table.className = 'events-table';
    table.innerHTML = `
        <thead><tr><th>Date/Time</th><th>Event</th><th>Location</th><th>Price</th></tr></thead>
        <tbody>
            ${events.map(event => `
                <tr onclick="window.open('${event.url}', '_blank')">
                    <td>${event.date.toLocaleDateString()} ${event.date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</td>
                    <td><strong>${event.title}</strong></td>
                    <td>${event.location}</td>
                    <td>${event.isFree ? 'Free' : 'Paid'}</td>
                </tr>
            `).join('')}
        </tbody>
    `;
    container.appendChild(table);
}

function renderCalendarView(events, container) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    for (let i = 0; i < 7; i++) {
        const currentDay = new Date(today);
        currentDay.setDate(today.getDate() + i);
        const header = document.createElement('div');
        header.className = 'calendar-weekday';
        header.innerHTML = `<div>${weekdays[currentDay.getDay()]}</div><div style="font-size: 0.7rem; opacity: 0.7">${currentDay.getMonth() + 1}/${currentDay.getDate()}</div>`;
        container.appendChild(header);
    }
    for (let i = 0; i < 7; i++) {
        const currentDay = new Date(today);
        currentDay.setDate(today.getDate() + i);
        const dayDiv = document.createElement('div');
        dayDiv.className = 'calendar-day';
        const dayEvents = events.filter(e => {
            const eDate = new Date(e.date);
            eDate.setHours(0,0,0,0);
            return eDate.getTime() === currentDay.getTime();
        });
        dayEvents.forEach(e => {
            const evDiv = document.createElement('div');
            evDiv.className = 'calendar-event';
            const timeStr = e.date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', hour12: false});
            evDiv.textContent = `${e.title}\n${timeStr} ${e.location}`;
            evDiv.onclick = () => window.open(e.url, '_blank');
            dayDiv.appendChild(evDiv);
        });
        container.appendChild(dayDiv);
    }
}

function groupEvents(events, criteria) {
    return events.reduce((groups, event) => {
        let key = 'Other';
        if (criteria === 'type') key = event.type;
        if (criteria === 'date') key = event.date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
        if (!groups[key]) groups[key] = [];
        groups[key].push(event);
        return groups;
    }, {});
}

function createEventCard(event, viewMode) {
    const card = document.createElement('article');
    card.className = 'event-card';
    const dateString = event.date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    card.innerHTML = `
        ${event.isFree ? '<div class="free-tag">FREE</div>' : ''}
        ${event.imgUrl ? `<div class="event-image-container"><img src="${event.imgUrl}" alt="${event.imgAlt}" class="event-image" loading="lazy"></div>` : ''}
        <div class="card-content">
            <h2 class="event-title">${event.title}</h2>
            <p class="event-date">${dateString}</p>
            <p class="event-location">${event.location}</p>
            <div class="event-tags">${event.tags.map(tag => `<span class="tag-badge">${tag}</span>`).join('')}</div>
            <div class="event-details">
                <div class="event-description">${event.description}</div>
                <div class="event-actions">
                    <a href="${event.url}" target="_blank" class="event-link" onclick="event.stopPropagation()">Details</a>
                    <div class="calendar-links" onclick="event.stopPropagation()">
                        <a href="https://www.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(event.title)}&dates=${event.date.toISOString().replace(/-|:|\.\d+/g, '')}/${(event.endDate || new Date(event.date.getTime() + 3600000)).toISOString().replace(/-|:|\.\d+/g, '')}&details=${encodeURIComponent(event.description)}&location=${encodeURIComponent(event.location)}" target="_blank">GCal</a>
                    </div>
                </div>
            </div>
        </div>
        <div class="expand-hint">Click to expand</div>
    `;
    card.addEventListener('click', () => { if (viewMode !== 'list') card.classList.toggle('expanded'); });
    return card;
}

let updateTimeout;
function updateUI() {
    clearTimeout(updateTimeout);
    updateTimeout = setTimeout(() => {
        const searchTerm = document.getElementById('search-input').value.toLowerCase();
        const sortValue = document.getElementById('sort-select').value;
        const groupValue = document.getElementById('group-select').value;
        const viewValue = document.getElementById('view-select').value;
        const dateStart = document.getElementById('date-start').value;
        const dateEnd = document.getElementById('date-end').value;
        const timeFilter = document.getElementById('time-filter').value;
        const priceFilter = document.getElementById('price-filter').value;
        const deptFilter = document.getElementById('dept-select').value;

        // Save preferences
        setCookie('pref-search', searchTerm);
        setCookie('pref-sort', sortValue);
        setCookie('pref-group', groupValue);
        setCookie('pref-view', viewValue);
        setCookie('pref-time', timeFilter);
        setCookie('pref-price', priceFilter);
        setCookie('pref-dept', deptFilter);
        setCookie('pref-categories', Array.from(selectedCategories).join(','));

        let filtered = allEvents.filter(event => {
            const matchesSearch = event.title.toLowerCase().includes(searchTerm) || event.location.toLowerCase().includes(searchTerm) || event.tags.some(tag => tag.toLowerCase().includes(searchTerm));
            const matchesCategory = selectedCategories.size === 0 || selectedCategories.has(event.type);
            const matchesPrice = priceFilter === 'any' || (priceFilter === 'free' && event.isFree) || (priceFilter === 'paid' && !event.isFree);
            const matchesDept = deptFilter === 'all' || event.depts.includes(deptFilter);
            
            const hours = event.date.getHours();
            const matchesTime = timeFilter === 'any' || (timeFilter === 'morning' && hours < 12) || (timeFilter === 'afternoon' && hours >= 12 && hours < 17) || (timeFilter === 'evening' && hours >= 17);

            const eventTime = event.date.getTime();
            const matchesDateStart = !dateStart || eventTime >= new Date(dateStart).getTime();
            const matchesDateEnd = !dateEnd || eventTime <= (new Date(dateEnd).getTime() + 86400000);

            return matchesSearch && matchesCategory && matchesPrice && matchesTime && matchesDateStart && matchesDateEnd && matchesDept;
        });

        filtered.sort((a, b) => {
            if (sortValue === 'date-asc') return a.date - b.date;
            if (sortValue === 'date-desc') return b.date - a.date;
            if (sortValue === 'location-asc') return a.location.localeCompare(b.location);
            if (sortValue === 'title-asc') return a.title.localeCompare(b.title);
            return 0;
        });

        renderEvents(filtered);
    }, 150);
}

function resetFilters() {
    document.getElementById('search-input').value = '';
    document.getElementById('date-start').value = '';
    document.getElementById('date-end').value = '';
    document.getElementById('time-filter').value = 'any';
    document.getElementById('price-filter').value = 'any';
    document.getElementById('dept-select').value = 'all';
    document.getElementById('sort-select').value = 'date-asc';
    document.getElementById('group-select').value = 'none';
    selectedCategories.clear();
    updateUI();
}

async function fetchEvents() {
    if (isFetching) return;
    isFetching = true;
    
    allEvents = [];
    currentOffset = 0;
    const app = document.getElementById('app');
    if (app) app.innerHTML = '<div class="loading-indicator">Loading all events...</div>';

    const today = new Date().toISOString().split('T')[0];
    const baseUrls = [
        'https://calendar.byu.edu/api/Events.json',
        'https://academiccalendar.byu.edu/api/Events.json'
    ];

    try {
        // Fetch from multiple sources in parallel
        const fetchPromises = baseUrls.map(async (baseUrl) => {
            const params = new URLSearchParams({ 
                'categories': 'all',
                'event[min][date]': today,
                'limit': '1000'
            });
            const response = await fetch(`${baseUrl}?${params.toString()}`);
            if (!response.ok) return [];
            const data = await response.json();
            return normalizeData(data);
        });

        const results = await Promise.all(fetchPromises);
        
        // Merge and remove duplicates
        const idSet = new Set();
        results.flat().forEach(e => {
            if (!idSet.has(e.id)) {
                allEvents.push(e);
                idSet.add(e.id);
            }
        });

        populateFilters();
        const savedCats = getCookie('pref-categories');
        if (savedCats) selectedCategories = new Set(savedCats.split(',').filter(c => c));
        
        updateUI();
    } catch (error) {
        console.error('Fetch error:', error);
        if (app) app.innerHTML = `<p class="error-message">Failed to load events. Please check your connection.</p>`;
    } finally {
        isFetching = false;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    if (getCookie('pref-search')) document.getElementById('search-input').value = getCookie('pref-search');
    if (getCookie('pref-sort')) document.getElementById('sort-select').value = getCookie('pref-sort');
    if (getCookie('pref-group')) document.getElementById('group-select').value = getCookie('pref-group');
    if (getCookie('pref-view')) document.getElementById('view-select').value = getCookie('pref-view');
    if (getCookie('pref-time')) document.getElementById('time-filter').value = getCookie('pref-time');
    if (getCookie('pref-price')) document.getElementById('price-filter').value = getCookie('pref-price');
    if (getCookie('pref-dept')) document.getElementById('dept-select').value = getCookie('pref-dept');

    fetchEvents();

    const ids = ['search-input', 'sort-select', 'group-select', 'view-select', 'date-start', 'date-end', 'time-filter', 'price-filter', 'dept-select'];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener(el.tagName === 'SELECT' || el.type === 'date' ? 'change' : 'input', updateUI);
    });

    document.getElementById('toggle-filters').onclick = () => {
        document.getElementById('advanced-filters').classList.toggle('hidden');
    };
    document.getElementById('reset-filters').onclick = resetFilters;
});