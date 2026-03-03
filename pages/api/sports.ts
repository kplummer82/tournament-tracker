// pages/api/sports.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { neon, neonConfig } from '@neondatabase/serverless';

neonConfig.fetchConnectionCache = true; // reuse connection in dev hot-reloads

const connectionString = process.env.DATABASE_URL!;
const sql = neon(connectionString);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).end('Method Not Allowed');

  try {
    if (!connectionString) {
      return res.status(500).json({ error: 'Missing DATABASE_URL' });
    }

    // optional caching headers
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=600');

    const rows = await sql/*sql*/`
      SELECT id, sportname, gender
      FROM public.sport
      ORDER BY gender, sportname
    `;

    const payload = rows.map((r: any) => ({
      id: Number(r.id),
      sportname: String(r.sportname ?? '').trim(),
      gender: String(r.gender ?? '').trim(),
      label: `${String(r.gender ?? '').trim()} ${String(r.sportname ?? '').trim()}`.trim(),
    }));

    res.status(200).json(payload);
  } catch (e) {
    console.error('Fetch sports error:', e);
    res.status(500).json({ error: 'Failed to load sports' });
  }
}