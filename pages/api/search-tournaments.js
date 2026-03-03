import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { name, city, state, year, division, query } = req.body;

  try {
    // General search box: run broad case-insensitive search
    if (query) {
      const result = await pool.query(
        `SELECT name, city, state, year, division
         FROM tournaments
         WHERE 
           LOWER(name) LIKE LOWER($1) OR 
           LOWER(city) LIKE LOWER($1) OR 
           LOWER(state) LIKE LOWER($1) OR 
           LOWER(division) LIKE LOWER($1)`,
        [`%${query}%`]
      );
      return res.status(200).json(result.rows);
    }

    // Field-specific search
    const conditions = [];
    const values = [];
    let paramIndex = 1;

    if (name) {
      conditions.push(`LOWER(name) LIKE LOWER($${paramIndex++})`);
      values.push(`%${name}%`);
    }
    if (city) {
      conditions.push(`LOWER(city) LIKE LOWER($${paramIndex++})`);
      values.push(`%${city}%`);
    }
    if (state) {
      conditions.push(`LOWER(state) LIKE LOWER($${paramIndex++})`);
      values.push(`%${state}%`);
    }
    if (year) {
      conditions.push(`year = $${paramIndex++}`);
      values.push(year);
    }
    if (division) {
      conditions.push(`LOWER(division) LIKE LOWER($${paramIndex++})`);
      values.push(`%${division}%`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await pool.query(
      `SELECT name, city, state, year, division FROM tournaments ${whereClause}`,
      values
    );

    res.status(200).json(result.rows);
  } catch (err) {
    console.error('Database error:', err);
    res.status(500).json({ error: err.message });
  }
}