let allEvents = [];
let selectedCategories = new Set();

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
    if (!Array.isArray(rawData)) return [];
    return rawData.map(event => {
        const date = event.StartDateTime ? new Date(event.StartDateTime.replace(' ', 'T')) : null;
        return {
            title: event.Title || 'Untitled Event',
            date: date,
            location: event.LocationName || event.field_event_location || 'TBD',
            description: event.Description || event.ShortDescription || 'No description available.',
            isFree: event.IsFree === "true" || event.IsFree === true || event.LowPrice === "0.0",
            price: event.PriceDescription || (event.LowPrice === "0.0" ? "Free" : event.LowPrice) || 'Free',
            url: event.FullUrl || '#',
            type: event.CategoryName || 'Other'
        };
    }).filter(event => event.date !== null);
}

function populateCategories() {
    const categories = [...new Set(allEvents.map(e => e.type))].sort();
    const container = document.getElementById('category-filters');
    if (!container) return;
    
    container.innerHTML = '';
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
        container.appendChild(chip);
    });
}

function renderEvents(eventsArray) {
    const appContainer = document.getElementById('app');
    const viewMode = document.getElementById('view-select').value;
    const groupMode = document.getElementById('group-select').value;
    
    appContainer.innerHTML = '';
    appContainer.className = `view-${viewMode}`;

    if (eventsArray.length === 0) {
        appContainer.innerHTML = '<p class="empty-state">No events match your criteria.</p>';
        return;
    }

    if (viewMode === 'table') {
        renderTableView(eventsArray, appContainer);
    } else if (viewMode === 'calendar') {
        renderCalendarView(eventsArray, appContainer);
    } else if (groupMode === 'none' || viewMode === 'list') {
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
        <thead>
            <tr>
                <th>Date</th>
                <th>Event</th>
                <th>Location</th>
                <th>Price</th>
                <th>Category</th>
            </tr>
        </thead>
        <tbody>
            ${events.map(event => `
                <tr onclick="window.open('${event.url}', '_blank')">
                    <td>${event.date.toLocaleDateString()} ${event.date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</td>
                    <td><strong>${event.title}</strong></td>
                    <td>${event.location}</td>
                    <td>${event.isFree ? 'Free' : event.price}</td>
                    <td>${event.type}</td>
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
    
    // Header Row: Day Names and Dates
    for (let i = 0; i < 7; i++) {
        const currentDay = new Date(today);
        currentDay.setDate(today.getDate() + i);
        
        const header = document.createElement('div');
        header.className = 'calendar-weekday';
        header.innerHTML = `<div>${weekdays[currentDay.getDay()]}</div><div style="font-size: 0.7rem; font-weight: normal;">${currentDay.getMonth() + 1}/${currentDay.getDate()}</div>`;
        container.appendChild(header);
    }

    // Event Row
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
            evDiv.style.whiteSpace = 'pre-wrap'; // Allow newlines
            
            const timeStr = e.date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', hour12: false});
            evDiv.textContent = `~${e.title}~\n${timeStr} ~${e.location}~`;
            
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
    
    const dateString = event.date.toLocaleDateString(undefined, { 
        weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });

    card.innerHTML = `
        ${event.isFree ? '<div class="free-tag">FREE</div>' : ''}
        <div class="card-content">
            <h2 class="event-title">${event.title}</h2>
            <p class="event-date">${dateString}</p>
            <p class="event-location">${event.location}</p>
            <div class="event-details">
                <div class="event-description">${event.description}</div>
                <p class="event-price">${event.isFree ? 'Free' : event.price}</p>
                <a href="${event.url}" target="_blank" class="event-link" onclick="event.stopPropagation()">View Details</a>
            </div>
        </div>
        <div class="expand-hint">Click to expand</div>
    `;

    card.addEventListener('click', () => {
        if (viewMode !== 'list') card.classList.toggle('expanded');
    });

    return card;
}

function updateUI() {
    const searchTerm = document.getElementById('search-input').value.toLowerCase();
    const freeOnly = document.getElementById('free-filter').checked;
    const sortValue = document.getElementById('sort-select').value;
    const groupValue = document.getElementById('group-select').value;
    const viewValue = document.getElementById('view-select').value;
    const dateStart = document.getElementById('date-start').value;
    const dateEnd = document.getElementById('date-end').value;

    // Save preferences
    setCookie('pref-search', searchTerm);
    setCookie('pref-free', freeOnly);
    setCookie('pref-sort', sortValue);
    setCookie('pref-group', groupValue);
    setCookie('pref-view', viewValue);
    setCookie('pref-categories', Array.from(selectedCategories).join(','));

    let filtered = allEvents.filter(event => {
        const matchesSearch = event.title.toLowerCase().includes(searchTerm) || 
                              event.description.toLowerCase().includes(searchTerm) ||
                              event.location.toLowerCase().includes(searchTerm);
        const matchesFree = !freeOnly || event.isFree;
        const matchesCategory = selectedCategories.size === 0 || selectedCategories.has(event.type);
        
        const eventTime = event.date.getTime();
        const matchesDateStart = !dateStart || eventTime >= new Date(dateStart).getTime();
        const matchesDateEnd = !dateEnd || eventTime <= (new Date(dateEnd).getTime() + 86400000);

        return matchesSearch && matchesFree && matchesCategory && matchesDateStart && matchesDateEnd;
    });

    filtered.sort((a, b) => {
        if (sortValue === 'date-asc') return a.date - b.date;
        if (sortValue === 'date-desc') return b.date - a.date;
        if (sortValue === 'location-asc') return a.location.localeCompare(b.location);
        return 0;
    });

    renderEvents(filtered);
}

function loadPreferences() {
    if (getCookie('pref-search')) document.getElementById('search-input').value = getCookie('pref-search');
    if (getCookie('pref-free')) document.getElementById('free-filter').checked = getCookie('pref-free') === 'true';
    if (getCookie('pref-sort')) document.getElementById('sort-select').value = getCookie('pref-sort');
    if (getCookie('pref-group')) document.getElementById('group-select').value = getCookie('pref-group');
    if (getCookie('pref-view')) document.getElementById('view-select').value = getCookie('pref-view');
    const savedCats = getCookie('pref-categories');
    if (savedCats) selectedCategories = new Set(savedCats.split(',').filter(c => c));
}

async function fetchEvents() {
    const today = new Date().toISOString().split('T')[0];
    const baseUrl = 'https://calendar.byu.edu/api/Events.json';
    const params = new URLSearchParams({
        'categories': 'all',
        'event[min][date]': today
    });
    const url = `${baseUrl}?${params.toString()}`;
    
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        allEvents = normalizeData(data);
        populateCategories();
        updateUI();
    } catch (error) {
        console.error(error);
        document.getElementById('app').innerHTML = `<p class="error-message">Failed to load events.</p>`;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    loadPreferences();
    fetchEvents();

    ['search-input', 'free-filter', 'sort-select', 'group-select', 'view-select', 'date-start', 'date-end'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            const eventType = (el.type === 'checkbox' || el.tagName === 'SELECT' || el.type === 'date') ? 'change' : 'input';
            el.addEventListener(eventType, updateUI);
        }
    });
});