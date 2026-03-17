import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { generateSitrep } from '$lib/server/sitrep.js';

export const GET: RequestHandler = async () => {
	const result = generateSitrep();
	return json(result);
};
