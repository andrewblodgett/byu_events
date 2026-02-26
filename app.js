let allEvents = [];

// Cookie Helpers
function setCookie(name, value, days = 30) {
    try {
        const expires = new Date(Date.now() + days * 864e5).toUTCString();
        document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Strict`;
    } catch (e) {
        console.error('Error setting cookie:', e);
    }
}

function getCookie(name) {
    try {
        return document.cookie.split('; ').reduce((r, v) => {
            const parts = v.split('=');
            return parts[0] === name ? decodeURIComponent(parts[1]) : r;
        }, '');
    } catch (e) {
        console.error('Error getting cookie:', e);
        return '';
    }
}

function normalizeData(rawData) {
    if (!Array.isArray(rawData)) {
        console.warn('API did not return an array. Data:', rawData);
        return [];
    }
    
    return rawData.map(event => {
        const date = event.StartDateTime ? new Date(event.StartDateTime.replace(' ', 'T')) : null;
        // Check if date is valid
        const isValidDate = date instanceof Date && !isNaN(date);

        return {
            title: event.Title || 'Untitled Event',
            date: isValidDate ? date : null,
            location: event.LocationName || event.field_event_location || 'TBD',
            description: event.Description || event.ShortDescription || 'No description available.',
            isFree: event.IsFree === "true" || event.IsFree === true || event.LowPrice === "0.0",
            price: event.PriceDescription || (event.LowPrice === "0.0" ? "Free" : event.LowPrice) || 'Free',
            url: event.FullUrl || '#',
            type: event.CategoryName || 'Other'
        };
    }).filter(event => event.date !== null);
}

function renderEvents(eventsArray) {
    const appContainer = document.getElementById('app');
    const viewSelect = document.getElementById('view-select');
    const groupSelect = document.getElementById('group-select');

    if (!appContainer || !viewSelect || !groupSelect) {
        console.error('Required DOM elements missing in renderEvents');
        return;
    }

    const viewMode = viewSelect.value;
    const groupMode = groupSelect.value;
    
    appContainer.innerHTML = '';
    appContainer.className = viewMode === 'list' ? 'view-list' : '';

    if (eventsArray.length === 0) {
        appContainer.innerHTML = '<p class="empty-state">No events match your criteria.</p>';
        return;
    }

    if (groupMode === 'none') {
        eventsArray.forEach(event => appContainer.appendChild(createEventCard(event)));
    } else {
        const groups = groupEvents(eventsArray, groupMode);
        for (const [groupName, groupItems] of Object.entries(groups)) {
            const header = document.createElement('h2');
            header.className = 'group-header';
            header.textContent = groupName;
            appContainer.appendChild(header);
            groupItems.forEach(event => appContainer.appendChild(createEventCard(event)));
        }
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

function createEventCard(event) {
    const card = document.createElement('article');
    card.className = 'event-card';
    
    const dateString = event.date.toLocaleDateString(undefined, { 
        weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });

    card.innerHTML = `
        <div class="card-content">
            <h2 class="event-title">${event.title}</h2>
            <p class="event-date">${dateString}</p>
            <p class="event-location">${event.location}</p>
            <div class="event-details">
                <div class="event-description">${event.description}</div>
                <p class="event-price">${event.isFree ? 'Free' : event.price}</p>
                <a href="${event.url}" target="_blank" class="event-link">View Details</a>
            </div>
        </div>
        <div class="expand-hint">Click to expand</div>
    `;

    // Prevent link clicks from toggling expansion
    const link = card.querySelector('.event-link');
    if (link) {
        link.addEventListener('click', (e) => e.stopPropagation());
    }

    card.addEventListener('click', () => {
        card.classList.toggle('expanded');
    });

    return card;
}

function updateUI() {
    const searchInput = document.getElementById('search-input');
    const freeFilter = document.getElementById('free-filter');
    const sortSelect = document.getElementById('sort-select');
    const groupSelect = document.getElementById('group-select');
    const viewSelect = document.getElementById('view-select');

    if (!searchInput || !freeFilter || !sortSelect || !groupSelect || !viewSelect) {
        console.error('Required DOM elements missing in updateUI');
        return;
    }

    const searchTerm = searchInput.value.toLowerCase();
    const freeOnly = freeFilter.checked;
    const sortValue = sortSelect.value;
    const groupValue = groupSelect.value;
    const viewValue = viewSelect.value;

    // Save preferences
    setCookie('pref-search', searchTerm);
    setCookie('pref-free', freeOnly);
    setCookie('pref-sort', sortValue);
    setCookie('pref-group', groupValue);
    setCookie('pref-view', viewValue);

    let filtered = allEvents.filter(event => {
        const matchesSearch = event.title.toLowerCase().includes(searchTerm) || 
                              event.description.toLowerCase().includes(searchTerm) ||
                              event.location.toLowerCase().includes(searchTerm);
        return matchesSearch && (!freeOnly || event.isFree);
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
    try {
        const searchInput = document.getElementById('search-input');
        const freeFilter = document.getElementById('free-filter');
        const sortSelect = document.getElementById('sort-select');
        const groupSelect = document.getElementById('group-select');
        const viewSelect = document.getElementById('view-select');

        if (getCookie('pref-search') && searchInput) searchInput.value = getCookie('pref-search');
        if (getCookie('pref-free') && freeFilter) freeFilter.checked = getCookie('pref-free') === 'true';
        if (getCookie('pref-sort') && sortSelect) sortSelect.value = getCookie('pref-sort');
        if (getCookie('pref-group') && groupSelect) groupSelect.value = getCookie('pref-group');
        if (getCookie('pref-view') && viewSelect) viewSelect.value = getCookie('pref-view');
    } catch (e) {
        console.error('Error loading preferences:', e);
    }
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
        console.log('Fetching events from:', url);
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP Error: ${response.status} ${response.statusText}`);
        
        const data = await response.json();
        console.log('Received data:', data);
        
        allEvents = normalizeData(data);
        console.log('Normalized events:', allEvents);
        
        updateUI();
    } catch (error) {
        console.error('Fetch error:', error);
        const appContainer = document.getElementById('app');
        if (appContainer) {
            appContainer.innerHTML = `<p class="error-message">Failed to load events: ${error.message}</p>`;
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM Content Loaded');
    loadPreferences();
    fetchEvents();

    const controls = ['search-input', 'free-filter', 'sort-select', 'group-select', 'view-select'];
    controls.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            const eventType = (el.type === 'checkbox' || el.tagName === 'SELECT') ? 'change' : 'input';
            el.addEventListener(eventType, updateUI);
        } else {
            console.warn(`Control element not found: ${id}`);
        }
    });
});
