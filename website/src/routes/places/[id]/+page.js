// Prerender all place pages
export const prerender = true;

// Generate all place IDs for static generation
export async function entries() {
	const placeIds = ['tokyo', 'fuji', 'hakone', 'kyoto', 'nara', 'osaka', 'hiroshima', 'kanazawa'];
	
	return placeIds.map(id => ({
		id
	}));
}