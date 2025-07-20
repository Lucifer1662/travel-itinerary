<script>
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { base } from '$app/paths';

	let scheduleData = null;
	let destinationsData = null;
	let placesData = {};
	let map = null;
	let L = null;
	let currentLayer = null;
	let currentMarkers = [];
	let selectedDay = 1;
	let overviewData = null;

	onMount(async () => {
		// Load data
		const [scheduleResponse, destinationsResponse] = await Promise.all([
			fetch(`${base}/db/schedule.json`),
			fetch(`${base}/db/destinations.json`)
		]);
		
		scheduleData = await scheduleResponse.json();
		destinationsData = await destinationsResponse.json();

		// Calculate overview data
		overviewData = calculateOverview(scheduleData);

		// Load all place data for detailed activities
		const placeIds = ['tokyo', 'fuji', 'hakone', 'kyoto', 'nara', 'osaka', 'hiroshima', 'kanazawa'];
		const placePromises = placeIds.map(id => 
			fetch(`${base}/db/places/${id}.json`).then(r => r.json()).catch(() => null)
		);
		const placeResults = await Promise.all(placePromises);
		
		placeIds.forEach((id, index) => {
			if (placeResults[index]) {
				placesData[id] = placeResults[index];
			}
		});

		// Load Leaflet
		if (browser) {
			const leafletModule = await import('leaflet');
			L = leafletModule.default;
			
			// Import Leaflet CSS
			const link = document.createElement('link');
			link.rel = 'stylesheet';
			link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
			document.head.appendChild(link);
			
			// Initialize map after CSS loads
			setTimeout(initMap, 100);
		}
	});

	function initMap() {
		if (!L || !scheduleData) return;
		
		map = L.map('map').setView([36.2048, 138.2529], 6);
		
		L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
			attribution: '© OpenStreetMap contributors'
		}).addTo(map);

		// Add all destination markers as background
		Object.entries(scheduleData.destinations).forEach(([name, coords]) => {
			const marker = L.marker(coords, {
				icon: L.divIcon({
					className: 'destination-marker',
					html: `<div style="background: #2ecc71; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white; opacity: 0.7;"></div>`,
					iconSize: [12, 12],
					iconAnchor: [6, 6]
				})
			}).addTo(map);
			
			marker.bindTooltip(name.charAt(0).toUpperCase() + name.slice(1), {
				permanent: false,
				direction: 'top'
			});
		});

		// Initialize with overview
		setTimeout(() => showDay('overview'), 200);
	}

	function calculateOverview(schedule) {
		if (!schedule || !schedule.itinerary) return null;
		
		const locationSequence = [];
		let currentLocation = null;
		let currentCount = 0;

		// Count consecutive days in each location
		for (let day = 1; day <= 18; day++) {
			const dayData = schedule.itinerary[day];
			if (!dayData) continue;

			if (dayData.location !== currentLocation) {
				// Save previous location if it exists
				if (currentLocation && currentCount > 0) {
					locationSequence.push({
						location: currentLocation,
						days: currentCount,
						coordinates: schedule.destinations[currentLocation],
						order: locationSequence.length + 1
					});
				}
				// Start counting new location
				currentLocation = dayData.location;
				currentCount = 1;
			} else {
				currentCount++;
			}
		}

		// Don't forget the last location
		if (currentLocation && currentCount > 0) {
			locationSequence.push({
				location: currentLocation,
				days: currentCount,
				coordinates: schedule.destinations[currentLocation],
				order: locationSequence.length + 1
			});
		}

		return {
			sequence: locationSequence,
			totalDays: 18
		};
	}

	function showOverview() {
		if (!overviewData || !overviewData.sequence) {
			console.log('No overview data available');
			return;
		}

		console.log('Showing overview with data:', overviewData);

		// Add numbered markers for each destination with day counts
		overviewData.sequence.forEach((location, index) => {
			if (location.coordinates) {
				const marker = L.marker(location.coordinates, {
					icon: L.divIcon({
						className: 'overview-marker',
						html: `<div style="background: #e67e22; width: 36px; height: 36px; border-radius: 50%; border: 3px solid white; box-shadow: 0 3px 8px rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; color: white; font-size: 14px; font-weight: bold;">${location.order}</div>`,
						iconSize: [36, 36],
						iconAnchor: [18, 18]
					})
				}).addTo(map);

				marker.bindPopup(`
					<strong>${location.order}. ${location.location.charAt(0).toUpperCase() + location.location.slice(1)}</strong><br>
					${location.days} day${location.days > 1 ? 's' : ''}<br>
					<em>Stop ${location.order} of ${overviewData.sequence.length}</em>
				`);

				currentMarkers.push(marker);
			}
		});

		// Draw route lines between destinations in order
		drawOverviewRoutes(overviewData.sequence);

		// Fit map to show all destinations
		const allCoords = overviewData.sequence
			.filter(loc => loc.coordinates)
			.map(loc => loc.coordinates);

		if (allCoords.length > 1) {
			const group = new L.featureGroup();
			allCoords.forEach(coord => {
				group.addLayer(L.marker(coord));
			});
			map.fitBounds(group.getBounds().pad(0.1));
		} else if (allCoords.length === 1) {
			map.setView(allCoords[0], 6);
		}
	}

	function drawOverviewRoutes(sequence) {
		if (!L || sequence.length < 2) return;

		for (let i = 0; i < sequence.length - 1; i++) {
			const currentLocation = sequence[i];
			const nextLocation = sequence[i + 1];

			if (currentLocation.coordinates && nextLocation.coordinates) {
				// Draw route line
				const routeLine = L.polyline([currentLocation.coordinates, nextLocation.coordinates], {
					color: '#e67e22',
					weight: 4,
					opacity: 0.8,
					dashArray: '15, 10'
				}).addTo(map);

				// Add travel marker at midpoint
				const midpoint = [
					(currentLocation.coordinates[0] + nextLocation.coordinates[0]) / 2,
					(currentLocation.coordinates[1] + nextLocation.coordinates[1]) / 2
				];

				const travelMarker = L.marker(midpoint, {
					icon: L.divIcon({
						className: 'travel-marker',
						html: `<div style="background: #d35400; color: white; padding: 4px 8px; border-radius: 12px; font-size: 10px; font-weight: bold; border: 2px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.3); white-space: nowrap;">🚄 Travel</div>`,
						iconSize: [60, 20],
						iconAnchor: [30, 10]
					})
				}).addTo(map);

				travelMarker.bindPopup(`
					<strong>Travel Route</strong><br>
					From: ${currentLocation.location.charAt(0).toUpperCase() + currentLocation.location.slice(1)}<br>
					To: ${nextLocation.location.charAt(0).toUpperCase() + nextLocation.location.slice(1)}<br>
					<em>Leg ${i + 1} of ${sequence.length - 1}</em>
				`);

				currentMarkers.push(routeLine);
				currentMarkers.push(travelMarker);
			}
		}
	}

	function showDay(day) {
		if (!map || !scheduleData) {
			console.log('Cannot show day - map or scheduleData not ready');
			return;
		}
		
		console.log('Showing day:', day, 'Current selectedDay:', selectedDay);
		selectedDay = day;
		
		// Clear previous markers and routes
		currentMarkers.forEach(marker => map.removeLayer(marker));
		currentMarkers = [];
		if (currentLayer) {
			map.removeLayer(currentLayer);
		}

		// Handle overview mode
		if (day === 'overview') {
			showOverview();
			return;
		}

		const dayData = scheduleData.itinerary[day];
		if (!dayData) {
			console.log('No day data found for day:', day);
			return;
		}
		console.log('Day data for day', day, ':', dayData);

		// Handle day-specific activities vs old format
		if (dayData.activities && Array.isArray(dayData.activities)) {
			// New format: day-specific activities
			console.log('Using new format with day-specific activities');
			
			// Add accommodation marker(s) if available
			if (dayData.accommodation) {
				// Handle regular accommodation (single location)
				if (dayData.accommodation.coordinates) {
					const accommodationMarker = L.marker(dayData.accommodation.coordinates, {
						icon: L.divIcon({
							className: 'accommodation-marker',
							html: `<div style="background: #9b59b6; width: 24px; height: 24px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 5px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; font-size: 12px;">🏨</div>`,
							iconSize: [24, 24],
							iconAnchor: [12, 12]
						})
					}).addTo(map);
					
					accommodationMarker.bindPopup(`
						<strong>🏨 ${dayData.accommodation.name}</strong><br>
						Base accommodation for ${dayData.title}
					`);
					
					currentMarkers.push(accommodationMarker);
				}
				// Handle accommodation change (travel days)
				else if (dayData.accommodation.to_coordinates) {
					const newAccommodationMarker = L.marker(dayData.accommodation.to_coordinates, {
						icon: L.divIcon({
							className: 'accommodation-marker',
							html: `<div style="background: #9b59b6; width: 24px; height: 24px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 5px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; font-size: 12px;">🏨</div>`,
							iconSize: [24, 24],
							iconAnchor: [12, 12]
						})
					}).addTo(map);
					
					newAccommodationMarker.bindPopup(`
						<strong>🏨 ${dayData.accommodation.to}</strong><br>
						New accommodation for ${dayData.title}
					`);
					
					currentMarkers.push(newAccommodationMarker);
				}
			}

			// Add activity markers for this specific day
			dayData.activities.forEach((activity, index) => {
				if (activity.coordinates) {
					const activityMarker = L.marker(activity.coordinates, {
						icon: L.divIcon({
							className: 'activity-marker',
							html: `<div style="background: #2ecc71; width: 28px; height: 28px; border-radius: 50%; border: 3px solid white; box-shadow: 0 3px 8px rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; color: white; font-size: 12px; font-weight: bold;">${index + 1}</div>`,
							iconSize: [28, 28],
							iconAnchor: [14, 14]
						})
					}).addTo(map);

					activityMarker.bindPopup(`
						<strong>${activity.time} - ${activity.name}</strong><br>
						Duration: ${activity.duration}<br>
						Transport: ${activity.transport.method} (${activity.transport.time})
					`);
					
					currentMarkers.push(activityMarker);
				}
			});

			// Draw routes between activities and to/from accommodation
			drawDayActivityRoutes(dayData.activities, dayData.accommodation);

			// Set map view to fit all activities and accommodation
			const allCoords = dayData.activities
				.filter(a => a.coordinates)
				.map(a => a.coordinates);
			
			// Add accommodation coordinates if available
			const accommodationCoords = dayData.accommodation?.coordinates || dayData.accommodation?.to_coordinates;
			if (accommodationCoords) {
				allCoords.unshift(accommodationCoords);
			}

			if (allCoords.length > 1) {
				const group = new L.featureGroup();
				allCoords.forEach(coord => {
					group.addLayer(L.marker(coord));
				});
				map.fitBounds(group.getBounds().pad(0.15));
			} else if (allCoords.length === 1) {
				map.setView(allCoords[0], 14);
			}

		} else {
			// Old format: fallback to destination location
			console.log('Using old format - showing destination location');
			const location = scheduleData.destinations[dayData.location];
			if (location) {
				const marker = L.marker(location, {
					icon: L.divIcon({
						className: 'custom-marker',
						html: `<div style="background: #e74c3c; width: 24px; height: 24px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 5px rgba(0,0,0,0.3);"></div>`,
						iconSize: [24, 24],
						iconAnchor: [12, 12]
					})
				}).addTo(map);
				
				marker.bindPopup(`<strong>${dayData.title}</strong>`);
				currentMarkers.push(marker);
				map.setView(location, 12);
			}
		}

		// Add route lines for travel days
		if (day === 5) { // Tokyo to Fuji
			drawRoute([scheduleData.destinations.tokyo, scheduleData.destinations.fuji], '#3498db');
		} else if (day === 7) { // Fuji to Hakone
			drawRoute([scheduleData.destinations.fuji, scheduleData.destinations.hakone], '#3498db');
		} else if (day === 9) { // Hakone to Kyoto
			drawRoute([scheduleData.destinations.hakone, scheduleData.destinations.kyoto], '#3498db');
		} else if (day === 12) { // Kyoto to Nara
			drawRoute([scheduleData.destinations.kyoto, scheduleData.destinations.nara], '#2ecc71');
		} else if (day === 13) { // Kyoto to Osaka
			drawRoute([scheduleData.destinations.kyoto, scheduleData.destinations.osaka], '#3498db');
		} else if (day === 15) { // Osaka to Hiroshima
			drawRoute([scheduleData.destinations.osaka, scheduleData.destinations.hiroshima], '#3498db');
		} else if (day === 17) { // Hiroshima to Kanazawa
			drawRoute([scheduleData.destinations.hiroshima, scheduleData.destinations.kanazawa], '#3498db');
		} else if (day === 18) { // Kanazawa to Tokyo
			drawRoute([scheduleData.destinations.kanazawa, scheduleData.destinations.tokyo], '#3498db');
		}
	}

	function drawRoute(points, color) {
		if (!L) return;
		currentLayer = L.polyline(points, {
			color: color,
			weight: 4,
			opacity: 0.8
		}).addTo(map);
	}

	function drawDayActivityRoutes(activities, accommodation) {
		if (!L || !activities || activities.length === 0) return;

		const activitiesWithCoords = activities.filter(a => a.coordinates);
		if (activitiesWithCoords.length === 0) return;

		// Draw route from accommodation to first activity
		const accommodationCoords = accommodation?.coordinates || accommodation?.to_coordinates;
		if (accommodation && accommodationCoords && accommodation.toFirstActivity) {
			const firstActivity = activitiesWithCoords[0];
			if (firstActivity) {
				const accommodationName = accommodation.name || accommodation.to || "🏨 Accommodation";
				drawSingleRoute(
					accommodationCoords,
					firstActivity.coordinates,
					accommodation.toFirstActivity,
					accommodationName,
					firstActivity.name
				);
			}
		}

		// Draw routes between activities
		for (let i = 0; i < activitiesWithCoords.length - 1; i++) {
			const currentActivity = activitiesWithCoords[i];
			const nextActivity = activitiesWithCoords[i + 1];
			
			drawSingleRoute(
				currentActivity.coordinates,
				nextActivity.coordinates,
				nextActivity.transport,
				currentActivity.name,
				nextActivity.name
			);
		}

		// Draw route from last activity back to accommodation
		if (accommodation && accommodationCoords && accommodation.fromLastActivity) {
			const lastActivity = activitiesWithCoords[activitiesWithCoords.length - 1];
			if (lastActivity) {
				const accommodationName = accommodation.name || accommodation.to || "🏨 Accommodation";
				drawSingleRoute(
					lastActivity.coordinates,
					accommodationCoords,
					accommodation.fromLastActivity,
					lastActivity.name,
					accommodationName
				);
			}
		}
	}

	function drawSingleRoute(startCoords, endCoords, transport, fromName, toName) {
		const color = getTransportColor(transport.method);
		
		// Draw route line
		const routeLine = L.polyline([startCoords, endCoords], {
			color: color,
			weight: 3,
			opacity: 0.7,
			dashArray: '10, 5'
		}).addTo(map);

		// Add transport marker at midpoint
		const midpoint = [
			(startCoords[0] + endCoords[0]) / 2,
			(startCoords[1] + endCoords[1]) / 2
		];

		const transportMarker = L.marker(midpoint, {
			icon: L.divIcon({
				className: 'transport-marker',
				html: `<div style="background: ${color}; color: white; padding: 4px 8px; border-radius: 12px; font-size: 10px; font-weight: bold; border: 2px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.3); white-space: nowrap;">${transport.method.split(' ')[0]} ${transport.time}</div>`,
				iconSize: [80, 20],
				iconAnchor: [40, 10]
			})
		}).addTo(map);

		transportMarker.bindPopup(`
			<strong>${transport.method}</strong><br>
			Travel time: ${transport.time}<br>
			From: ${fromName}<br>
			To: ${toName}
		`);

		currentMarkers.push(routeLine);
		currentMarkers.push(transportMarker);
	}

	function getTransportColor(method) {
		if (method.includes('🚶')) return '#27ae60'; // Walking - green
		if (method.includes('🚇')) return '#3498db'; // Metro - blue
		if (method.includes('🚃')) return '#9b59b6'; // Train - purple
		if (method.includes('🚌')) return '#e67e22'; // Bus - orange
		if (method.includes('🛏️')) return '#95a5a6'; // Hotel - gray
		return '#34495e'; // Default - dark gray
	}

	function drawActivityRoutes(coords, activities) {
		if (!L || coords.length < 2) return;

		// Transport methods for different activities (this could be enhanced with real data)
		const getTransportInfo = (fromActivity, toActivity, distance) => {
			// Estimate based on activity types and typical distances
			if (distance < 0.005) { // Very close (< 500m)
				return { emoji: '🚶', method: 'Walking', time: '5 min', color: '#27ae60' };
			} else if (distance < 0.01) { // Close (< 1km)
				return { emoji: '🚶', method: 'Walking', time: '10 min', color: '#27ae60' };
			} else if (distance < 0.05) { // Medium distance (< 5km)
				return { emoji: '🚇', method: 'Metro/Bus', time: '15 min', color: '#3498db' };
			} else {
				return { emoji: '🚃', method: 'Train', time: '25 min', color: '#9b59b6' };
			}
		};

		for (let i = 0; i < coords.length - 1; i++) {
			const start = coords[i];
			const end = coords[i + 1];
			const distance = Math.sqrt(
				Math.pow(end[0] - start[0], 2) + Math.pow(end[1] - start[1], 2)
			);

			const transport = getTransportInfo(activities[i], activities[i + 1], distance);
			
			// Draw route line
			const routeLine = L.polyline([start, end], {
				color: transport.color,
				weight: 3,
				opacity: 0.7,
				dashArray: '10, 5'
			}).addTo(map);

			// Add transport marker at midpoint
			const midpoint = [
				(start[0] + end[0]) / 2,
				(start[1] + end[1]) / 2
			];

			const transportMarker = L.marker(midpoint, {
				icon: L.divIcon({
					className: 'transport-marker',
					html: `<div style="background: ${transport.color}; color: white; padding: 4px 8px; border-radius: 12px; font-size: 10px; font-weight: bold; border: 2px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.3); white-space: nowrap;">${transport.emoji} ${transport.time}</div>`,
					iconSize: [60, 20],
					iconAnchor: [30, 10]
				})
			}).addTo(map);

			transportMarker.bindPopup(`
				<strong>${transport.method}</strong><br>
				Estimated time: ${transport.time}<br>
				From: ${activities[i].name}<br>
				To: ${activities[i + 1].name}
			`);

			currentMarkers.push(routeLine);
			currentMarkers.push(transportMarker);
		}
	}

	// Remove the problematic reactive statement
</script>

<svelte:head>
	<title>Epic Japan Adventure: 18-Day Journey</title>
</svelte:head>

<div class="container">
	<header>
		<h1>🇯🇵 Epic Japan Adventure</h1>
		{#if scheduleData}
			<p class="subtitle">{scheduleData.trip.subtitle}</p>
			<div class="trip-stats">
				<div class="stat">
					<div class="stat-number">{scheduleData.trip.stats.days}</div>
					<div>Days</div>
				</div>
				<div class="stat">
					<div class="stat-number">{scheduleData.trip.stats.cities}</div>
					<div>Cities</div>
				</div>
				<div class="stat">
					<div class="stat-number">{scheduleData.trip.stats.michelinStars}</div>
					<div>Michelin Stars</div>
				</div>
				<div class="stat">
					<div class="stat-number">{scheduleData.trip.stats.memories}</div>
					<div>Memories</div>
				</div>
			</div>
		{/if}
	</header>

	<div class="main-content">
		<div class="map-section">
			<h2 class="section-title">📍 Interactive Route Map</h2>
			{#if scheduleData}
				<div class="day-selector">
					<button 
						class="day-btn overview-btn {selectedDay === 'overview' ? 'active' : ''}"
						on:click={() => showDay('overview')}
					>
						📍 Overview
					</button>
					{#each Array(18) as _, i}
						<button 
							class="day-btn {selectedDay === i + 1 ? 'active' : ''}"
							on:click={() => showDay(i + 1)}
						>
							Day {i + 1}
						</button>
					{/each}
				</div>
			{/if}
			<div id="map"></div>
			<div class="legend">
				{#if selectedDay === 'overview'}
					<div class="legend-item">
						<div class="legend-color" style="background: #e67e22; color: white; font-weight: bold;">1</div>
						<span>Destinations (with order)</span>
					</div>
					<div class="legend-item">
						<div class="legend-color" style="background: #d35400;">🚄</div>
						<span>Inter-city Travel</span>
					</div>
				{:else}
					<div class="legend-item">
						<div class="legend-color" style="background: #9b59b6;">🏨</div>
						<span>Accommodation</span>
					</div>
					<div class="legend-item">
						<div class="legend-color" style="background: #2ecc71;"></div>
						<span>Daily Activities</span>
					</div>
					<div class="legend-item">
						<div class="legend-color" style="background: #3498db;"></div>
						<span>Transportation Routes</span>
					</div>
				{/if}
			</div>
		</div>

		<div class="itinerary-section">
			<h2 class="section-title">🗓️ Daily Itinerary</h2>
			<div class="day-details">
				{#if selectedDay === 'overview' && overviewData}
					<div class="day-title">🗺️ Trip Overview</div>
					<div class="route-info">
						<strong>📊 Journey Summary:</strong><br>
						{overviewData.totalDays} days across {overviewData.sequence.length} destinations
					</div>
					<div>
						<strong>📍 Destination Sequence:</strong>
						<ul class="highlights">
							{#each overviewData.sequence as location}
								<li>
									<div class="highlight-timing">
										<span class="time">{location.order}.</span>
										<span class="activity">{location.location.charAt(0).toUpperCase() + location.location.slice(1)}</span>
										<span class="duration">{location.days} day{location.days > 1 ? 's' : ''}</span>
										<span class="transport">🏨 Accommodation</span>
									</div>
								</li>
							{/each}
						</ul>
					</div>
				{:else if scheduleData && scheduleData.itinerary[selectedDay]}
					{@const dayData = scheduleData.itinerary[selectedDay]}
					<div class="day-title">{dayData.title}</div>
					<div class="route-info">
						<strong>🚗 Transportation:</strong><br>
						{#each dayData.routes as route}
							{route.from} → {route.to} ({route.transport}, {route.duration})<br>
						{/each}
					</div>
					<div style="margin: 1rem 0;">
						{#each dayData.transportation as transport}
							<span class="transportation">{transport}</span>
						{/each}
					</div>
					<div>
						{#if dayData.activities && Array.isArray(dayData.activities)}
							<strong>📍 Day Activities:</strong>
							<ul class="highlights">
								{#each dayData.activities as activity}
									<li>
										<div class="highlight-timing">
											<span class="time">{activity.time}</span>
											<span class="activity">{activity.name}</span>
											<span class="duration">Duration: {activity.duration}</span>
											<span class="transport">{activity.transport.method} ({activity.transport.time})</span>
										</div>
									</li>
								{/each}
							</ul>
						{:else if dayData.highlights}
							<strong>📍 Highlights:</strong>
							<ul class="highlights">
								{#each dayData.highlights as highlight}
									<li>
										{#if typeof highlight === 'object'}
											<div class="highlight-timing">
												<span class="time">{highlight.time}</span>
												<span class="activity">{highlight.activity}</span>
												<span class="transport">{highlight.transport}</span>
											</div>
										{:else}
											{highlight}
										{/if}
									</li>
								{/each}
							</ul>
						{/if}
					</div>
				{:else}
					<p>Select a day to see detailed itinerary and route information.</p>
				{/if}
			</div>
		</div>
	</div>

	{#if destinationsData}
		<div class="destination-links">
			{#each destinationsData.destinations as destination}
				<a href="{base}/places/{destination.id}" class="destination-card">
					<div class="destination-icon">{destination.icon}</div>
					<div class="destination-name">{destination.name}</div>
					<div class="destination-desc">{destination.description}</div>
				</a>
			{/each}
		</div>
	{/if}
</div>

<style>
	:global(*) {
		margin: 0;
		padding: 0;
		box-sizing: border-box;
	}

	:global(body) {
		font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
		line-height: 1.6;
		color: #333;
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
	}

	.container {
		max-width: 1400px;
		margin: 0 auto;
		padding: 20px;
	}

	header {
		text-align: center;
		background: rgba(255, 255, 255, 0.95);
		padding: 2rem;
		border-radius: 15px;
		margin-bottom: 2rem;
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
	}

	h1 {
		color: #2c3e50;
		font-size: 2.5rem;
		margin-bottom: 0.5rem;
	}

	.subtitle {
		color: #7f8c8d;
		font-size: 1.2rem;
		margin-bottom: 1rem;
	}

	.trip-stats {
		display: flex;
		justify-content: center;
		gap: 2rem;
		flex-wrap: wrap;
		margin-top: 1rem;
	}

	.stat {
		text-align: center;
		padding: 1rem;
		background: #f8f9fa;
		border-radius: 10px;
		min-width: 120px;
	}

	.stat-number {
		font-size: 1.5rem;
		font-weight: bold;
		color: #e74c3c;
	}

	.main-content {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 2rem;
		margin-bottom: 2rem;
	}

	.map-section, .itinerary-section {
		background: rgba(255, 255, 255, 0.95);
		border-radius: 15px;
		padding: 1.5rem;
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
	}

	.section-title {
		color: #2c3e50;
		font-size: 1.5rem;
		margin-bottom: 1rem;
		border-bottom: 3px solid #3498db;
		padding-bottom: 0.5rem;
	}

	:global(#map) {
		height: 500px;
		border-radius: 10px;
		border: 2px solid #ddd;
	}

	.day-selector {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-bottom: 1rem;
	}

	.day-btn {
		background: #ecf0f1;
		border: none;
		padding: 0.5rem 1rem;
		border-radius: 25px;
		cursor: pointer;
		transition: all 0.3s ease;
		font-weight: 500;
	}

	.day-btn:hover {
		background: #3498db;
		color: white;
		transform: translateY(-2px);
	}

	.day-btn.active {
		background: #e74c3c;
		color: white;
	}

	.overview-btn {
		background: #34495e;
		color: white;
		font-weight: 600;
	}

	.overview-btn:hover {
		background: #2c3e50;
		transform: translateY(-2px);
	}

	.overview-btn.active {
		background: #e67e22;
		color: white;
	}

	.day-details {
		background: #f8f9fa;
		padding: 1.5rem;
		border-radius: 10px;
		margin-top: 1rem;
	}

	.day-title {
		color: #2c3e50;
		font-size: 1.3rem;
		margin-bottom: 1rem;
	}

	.route-info {
		background: #e8f4fd;
		padding: 1rem;
		border-radius: 8px;
		margin-bottom: 1rem;
		border-left: 4px solid #3498db;
	}

	.highlights {
		list-style: none;
	}

	.highlights li {
		padding: 0.5rem 0;
		border-bottom: 1px solid #eee;
	}

	.highlights li:before {
		content: "📍 ";
		margin-right: 0.5rem;
	}

	.highlight-timing {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}

	.highlight-timing .time {
		font-weight: bold;
		color: #e74c3c;
		font-size: 0.9rem;
	}

	.highlight-timing .activity {
		font-weight: 500;
		color: #2c3e50;
	}

	.highlight-timing .transport {
		font-size: 0.8rem;
		color: #7f8c8d;
		font-style: italic;
	}

	.highlight-timing .duration {
		font-size: 0.8rem;
		color: #e67e22;
		font-weight: 500;
	}

	.transportation {
		display: inline-block;
		background: #2ecc71;
		color: white;
		padding: 0.2rem 0.8rem;
		border-radius: 15px;
		font-size: 0.9rem;
		margin: 0.2rem;
	}

	.destination-links {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: 1rem;
		margin-top: 2rem;
	}

	.destination-card {
		background: rgba(255, 255, 255, 0.95);
		padding: 1.5rem;
		border-radius: 15px;
		text-align: center;
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
		transition: transform 0.3s ease;
		text-decoration: none;
		color: inherit;
	}

	.destination-card:hover {
		transform: translateY(-5px);
		text-decoration: none;
		color: inherit;
	}

	.destination-icon {
		font-size: 2rem;
		margin-bottom: 0.5rem;
	}

	.destination-name {
		font-weight: bold;
		color: #2c3e50;
		margin-bottom: 0.5rem;
	}

	.destination-desc {
		color: #7f8c8d;
		font-size: 0.9rem;
	}

	.legend {
		background: white;
		padding: 10px;
		border-radius: 5px;
		box-shadow: 0 2px 10px rgba(0,0,0,0.1);
		margin-top: 10px;
	}

	.legend-item {
		display: flex;
		align-items: center;
		margin: 5px 0;
	}

	.legend-color {
		width: 20px;
		height: 20px;
		border-radius: 50%;
		margin-right: 10px;
	}

	@media (max-width: 768px) {
		.main-content {
			grid-template-columns: 1fr;
		}
		
		.trip-stats {
			gap: 1rem;
		}
		
		h1 {
			font-size: 2rem;
		}
	}
</style>