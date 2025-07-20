<script>
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';

	let placeData = null;
	let map = null;
	let L = null;
	let loading = true;
	let error = null;

	$: placeId = $page.params.id;

	onMount(async () => {
		await loadPlaceData();
		if (browser && placeData) {
			await loadMap();
		}
	});

	async function loadPlaceData() {
		try {
			const response = await fetch(`/db/places/${placeId}.json`);
			if (!response.ok) {
				throw new Error('Place not found');
			}
			placeData = await response.json();
			loading = false;
		} catch (err) {
			error = err.message;
			loading = false;
		}
	}

	async function loadMap() {
		if (!browser || !placeData) return;
		
		const leafletModule = await import('leaflet');
		L = leafletModule.default;
		
		// Import Leaflet CSS
		const link = document.createElement('link');
		link.rel = 'stylesheet';
		link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
		document.head.appendChild(link);
		
		setTimeout(initMap, 100);
	}

	function initMap() {
		if (!L || !placeData) return;
		
		map = L.map('place-map').setView(placeData.coordinates, 12);
		
		L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
			attribution: '© OpenStreetMap contributors'
		}).addTo(map);

		// Add main place marker
		const mainMarker = L.marker(placeData.coordinates, {
			icon: L.divIcon({
				className: 'main-place-marker',
				html: `<div style="background: #e74c3c; width: 24px; height: 24px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 5px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; font-size: 14px;">${placeData.icon}</div>`,
				iconSize: [24, 24],
				iconAnchor: [12, 12]
			})
		}).addTo(map);

		mainMarker.bindPopup(`<strong>${placeData.name}</strong><br>${placeData.description}`);

		// Add activity markers
		placeData.thingsToDo.forEach((activity, index) => {
			if (activity.coordinates) {
				const activityMarker = L.marker(activity.coordinates, {
					icon: L.divIcon({
						className: 'activity-marker',
						html: `<div style="background: #3498db; width: 28px; height: 28px; border-radius: 50%; border: 3px solid white; box-shadow: 0 3px 8px rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; color: white; font-size: 12px; font-weight: bold;">${index + 1}</div>`,
						iconSize: [28, 28],
						iconAnchor: [14, 14]
					})
				}).addTo(map);

				activityMarker.bindPopup(`
					<strong>${activity.name}</strong><br>
					${activity.description}<br>
					<em>Cost: ${activity.cost} | Duration: ${activity.duration}</em>
				`);
			}
		});

		// Fit bounds to show all markers
		const group = new L.featureGroup();
		group.addLayer(mainMarker);
		placeData.thingsToDo.forEach((activity) => {
			if (activity.coordinates) {
				group.addLayer(L.marker(activity.coordinates));
			}
		});
		
		if (group.getLayers().length > 1) {
			map.fitBounds(group.getBounds().pad(0.1));
		}
	}
</script>

<svelte:head>
	<title>{placeData ? placeData.name : 'Loading...'} - Japan Holiday 2025</title>
</svelte:head>

<div class="place-container">
	{#if loading}
		<div class="loading">
			<h2>Loading place information...</h2>
		</div>
	{:else if error}
		<div class="error">
			<h2>Error: {error}</h2>
			<a href="/" class="back-link">← Return to main page</a>
		</div>
	{:else if placeData}
		<header class="place-header">
			<div class="header-content">
				<a href="/" class="back-link">← Back to Journey</a>
				<div class="place-title">
					<h1><span class="place-icon">{placeData.icon}</span> {placeData.name}</h1>
					<p class="place-description">{placeData.description}</p>
				</div>
			</div>
		</header>

		<div class="place-content">
			<div class="map-section">
				<h2 class="section-title">📍 Location & Activities</h2>
				<div id="place-map"></div>
				<div class="map-legend">
					<div class="legend-item">
						<div class="legend-marker main"></div>
						<span>Main Location</span>
					</div>
					<div class="legend-item">
						<div class="legend-marker activity"></div>
						<span>Activities & Attractions</span>
					</div>
				</div>
			</div>

			<div class="info-section">
				<h2 class="section-title">🎯 Things to Do</h2>
				<div class="activities-grid">
					{#each placeData.thingsToDo as activity, index}
						<div class="activity-card">
							<div class="activity-header">
								<h3>
									<span class="activity-number">{index + 1}</span>
									{activity.name}
								</h3>
								<div class="activity-meta">
									<span class="cost">💰 {activity.cost}</span>
									<span class="duration">⏳ {activity.duration}</span>
								</div>
							</div>
							<p class="activity-description">{activity.description}</p>
							
							{#if activity.bestPhotoSpots?.length > 0}
								<div class="photo-spots">
									<h4>📸 Best Photo Spots:</h4>
									<ul>
										{#each activity.bestPhotoSpots as spot}
											<li>
												<a href={spot.link} target="_blank" rel="noopener noreferrer">
													{spot.name} ↗
												</a>
											</li>
										{/each}
									</ul>
								</div>
							{/if}

							{#if activity.resources?.length > 0}
								<div class="resources">
									<h4>🔗 Resources:</h4>
									<div class="resource-links">
										{#each activity.resources as resource}
											<a href={resource.link} target="_blank" rel="noopener noreferrer" class="resource-link">
												{resource.name} ↗
											</a>
										{/each}
									</div>
								</div>
							{/if}
						</div>
					{/each}
				</div>
			</div>
		</div>

		{#if placeData.transportation?.length > 0}
			<div class="additional-info">
				<div class="info-card">
					<h3>🚇 Transportation</h3>
					<ul>
						{#each placeData.transportation as transport}
							<li>
								<strong>{transport.name}</strong>: {transport.description}
								<a href={transport.link} target="_blank" rel="noopener noreferrer">Learn more ↗</a>
							</li>
						{/each}
					</ul>
				</div>

				{#if placeData.bestTimeToVisit?.length > 0}
					<div class="info-card">
						<h3>📅 Best Time to Visit</h3>
						<ul>
							{#each placeData.bestTimeToVisit as period}
								<li>
									<strong>{period.season} ({period.months})</strong>: {period.description}
									{#if period.link}
										<a href={period.link} target="_blank" rel="noopener noreferrer">More info ↗</a>
									{/if}
								</li>
							{/each}
						</ul>
					</div>
				{/if}

				{#if placeData.safetyTips?.length > 0}
					<div class="info-card">
						<h3>⚠️ Safety Tips</h3>
						<ul>
							{#each placeData.safetyTips as tip}
								<li>{tip}</li>
							{/each}
						</ul>
					</div>
				{/if}
			</div>
		{/if}
	{/if}
</div>

<style>
	.place-container {
		min-height: 100vh;
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		padding: 20px;
	}

	.place-header {
		background: rgba(255, 255, 255, 0.95);
		padding: 2rem;
		border-radius: 15px;
		margin-bottom: 2rem;
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
	}

	.back-link {
		color: #3498db;
		text-decoration: none;
		font-weight: 500;
		margin-bottom: 1rem;
		display: inline-block;
	}

	.back-link:hover {
		text-decoration: underline;
	}

	.place-title h1 {
		color: #2c3e50;
		font-size: 2.5rem;
		margin-bottom: 0.5rem;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.place-icon {
		font-size: 2rem;
	}

	.place-description {
		color: #7f8c8d;
		font-size: 1.2rem;
	}

	.place-content {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 2rem;
		margin-bottom: 2rem;
		height: 600px;
	}

	.map-section {
		background: rgba(255, 255, 255, 0.95);
		border-radius: 15px;
		padding: 1.5rem;
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
	}

	.info-section {
		background: rgba(255, 255, 255, 0.95);
		border-radius: 15px;
		padding: 1.5rem;
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.section-title {
		color: #2c3e50;
		font-size: 1.5rem;
		margin-bottom: 1rem;
		border-bottom: 3px solid #3498db;
		padding-bottom: 0.5rem;
	}

	:global(#place-map) {
		height: 400px;
		border-radius: 10px;
		border: 2px solid #ddd;
		margin-bottom: 1rem;
	}

	.map-legend {
		display: flex;
		gap: 1rem;
		align-items: center;
	}

	.legend-item {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.legend-marker {
		width: 16px;
		height: 16px;
		border-radius: 50%;
		border: 2px solid white;
		box-shadow: 0 1px 3px rgba(0,0,0,0.3);
	}

	.legend-marker.main {
		background: #e74c3c;
	}

	.legend-marker.activity {
		background: #3498db;
	}

	.activities-grid {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
		overflow-y: auto;
		flex: 1;
		max-height: 450px;
		padding-right: 0.5rem;
	}

	.activities-grid::-webkit-scrollbar {
		width: 6px;
	}

	.activities-grid::-webkit-scrollbar-track {
		background: #f1f1f1;
		border-radius: 10px;
	}

	.activities-grid::-webkit-scrollbar-thumb {
		background: #888;
		border-radius: 10px;
	}

	.activities-grid::-webkit-scrollbar-thumb:hover {
		background: #555;
	}

	.activity-card {
		background: #f8f9fa;
		padding: 1.5rem;
		border-radius: 10px;
		border-left: 4px solid #3498db;
	}

	.activity-header {
		margin-bottom: 1rem;
	}

	.activity-header h3 {
		color: #2c3e50;
		margin-bottom: 0.5rem;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.activity-number {
		background: #3498db;
		color: white;
		border-radius: 50%;
		width: 24px;
		height: 24px;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 0.8rem;
		font-weight: bold;
	}

	.activity-meta {
		display: flex;
		gap: 1rem;
		font-size: 0.9rem;
		color: #666;
	}

	.activity-description {
		margin-bottom: 1rem;
		line-height: 1.6;
	}

	.photo-spots, .resources {
		margin-top: 1rem;
	}

	.photo-spots h4, .resources h4 {
		color: #2c3e50;
		font-size: 0.9rem;
		margin-bottom: 0.5rem;
	}

	.photo-spots ul {
		list-style: none;
		padding: 0;
	}

	.photo-spots li {
		margin: 0.3rem 0;
	}

	.photo-spots a, .resource-link {
		color: #3498db;
		text-decoration: none;
		font-size: 0.9rem;
	}

	.photo-spots a:hover, .resource-link:hover {
		text-decoration: underline;
	}

	.resource-links {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.resource-link {
		background: #3498db;
		color: white;
		padding: 0.3rem 0.8rem;
		border-radius: 15px;
		font-size: 0.8rem;
		transition: background 0.3s ease;
	}

	.resource-link:hover {
		background: #2980b9;
		text-decoration: none;
	}

	.additional-info {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
		gap: 1.5rem;
	}

	.info-card {
		background: rgba(255, 255, 255, 0.95);
		padding: 1.5rem;
		border-radius: 15px;
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
	}

	.info-card h3 {
		color: #2c3e50;
		margin-bottom: 1rem;
		border-bottom: 2px solid #3498db;
		padding-bottom: 0.5rem;
	}

	.info-card ul {
		list-style: none;
		padding: 0;
	}

	.info-card li {
		margin: 0.8rem 0;
		line-height: 1.5;
	}

	.info-card a {
		color: #3498db;
		text-decoration: none;
		margin-left: 0.5rem;
	}

	.info-card a:hover {
		text-decoration: underline;
	}

	.loading, .error {
		background: rgba(255, 255, 255, 0.95);
		padding: 3rem;
		border-radius: 15px;
		text-align: center;
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
	}

	@media (max-width: 768px) {
		.place-content {
			grid-template-columns: 1fr;
		}
		
		.place-title h1 {
			font-size: 2rem;
		}
		
		:global(#place-map) {
			height: 300px;
		}
	}
</style>