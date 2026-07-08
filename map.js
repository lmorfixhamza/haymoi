// map.js
// Logic for Interactive Map and Nearby User Filtering

// Haversine formula to calculate distance between two lat/lng pairs in km
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radius of the earth in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
        Math.sin(dLon/2) * Math.sin(dLon/2); 
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
    return R * c; // Distance in km
}

function loadMapView() {
    const container = document.getElementById('interactive-map-container');
    if (!container) return;
    
    if (window.interactiveMap) {
        setTimeout(() => window.interactiveMap.invalidateSize(), 300);
        return;
    }

    // Default current user location (e.g. Casablanca)
    // In production, get from navigator.geolocation
    const currentUserLat = 33.5731;
    const currentUserLng = -7.5898;
    const RADIUS_LIMIT_KM = 50;
    
    setTimeout(() => {
        if (typeof L === 'undefined') {
            container.innerHTML = `
                <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; color:var(--text-muted); background:var(--bg-glass);">
                    <i class="fas fa-map-marked-alt" style="font-size: 48px; margin-bottom:16px; opacity:0.5;"></i>
                    <p>Veuillez inclure la bibliothèque Leaflet pour utiliser la carte interactive.</p>
                </div>
            `;
            return;
        }
        
        // Force container to be fixed and full-screen above the bottom nav
        container.style.position = 'fixed';
        container.style.top = '0';
        container.style.left = '0';
        container.style.right = '0';
        container.style.bottom = '70px'; // height of bottom nav
        container.style.width = '100%';
        container.style.height = 'auto';
        container.style.borderRadius = '0';
        container.style.zIndex = '50';
        
        window.interactiveMap = L.map('interactive-map-container', {zoomControl: false}).setView([currentUserLat, currentUserLng], 11);
        
        // Use standard OpenStreetMap tiles for a bright white/colorful look
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OSM contributors',
            maxZoom: 19
        }).addTo(window.interactiveMap);

        // Add a marker for the current user
        L.circleMarker([currentUserLat, currentUserLng], {
            radius: 8,
            fillColor: "#3b82f6",
            color: "#ffffff",
            weight: 2,
            opacity: 1,
            fillOpacity: 1
        }).addTo(window.interactiveMap).bindPopup("<b>Vous êtes ici</b>");
        
        // Draw the 50km radius circle
        L.circle([currentUserLat, currentUserLng], {
            radius: RADIUS_LIMIT_KM * 1000, // Leaflet circle radius is in meters
            color: '#3b82f6',
            fillColor: '#3b82f6',
            fillOpacity: 0.1,
            weight: 1
        }).addTo(window.interactiveMap);

        // Filter and add users within 50km
        const botsToUse = typeof MOCK_BOTS !== 'undefined' ? MOCK_BOTS : [];
        if (botsToUse.length > 0) {
            botsToUse.forEach(user => {
                // Generate a random location for mockup
                // 1 degree is approx 111km, so 0.5 is approx 55km spread
                const lat = 33.5731 + (Math.random() - 0.5) * 1.0;
                const lng = -7.5898 + (Math.random() - 0.5) * 1.0;

                const distance = calculateDistance(currentUserLat, currentUserLng, lat, lng);
                
                // Only show users strictly <= 50km
                if (distance <= RADIUS_LIMIT_KM) {
                    L.marker([lat, lng]).addTo(window.interactiveMap)
                        .bindPopup(`<b>${user.pseudo || user.name || 'Utilisateur'}</b><br>À ${Math.round(distance)} km d'ici`);
                }
            });
        }
    }, 100);
}
