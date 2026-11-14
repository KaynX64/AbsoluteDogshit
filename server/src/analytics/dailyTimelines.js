// Builds aligned daily encounter and SOS timelines from the reporting calendar.

import { pool } from '../db/pool.js';

export async function getDailyTimelines() {
  const [days] = await pool.query(`
    WITH RECURSIVE calendar AS (
      SELECT CURDATE() - INTERVAL 13 DAY AS day
      UNION ALL
      SELECT day + INTERVAL 1 DAY FROM calendar WHERE day < CURDATE()
    ),
    encounters AS (
      SELECT DATE(encounter_date) AS day, COUNT(*) AS count
      FROM EMR_RECORDS
      WHERE deleted_at IS NULL AND encounter_date >= CURDATE() - INTERVAL 13 DAY
        AND encounter_date <= NOW()
      GROUP BY DATE(encounter_date)
    ),
    emergencies AS (
      SELECT DATE(created_at) AS day, COUNT(*) AS count
      FROM EMERGENCY_ALERTS
      WHERE created_at >= CURDATE() - INTERVAL 13 DAY AND created_at <= NOW()
      GROUP BY DATE(created_at)
    )
    SELECT DATE_FORMAT(c.day, '%Y-%m-%d') AS date, DATE_FORMAT(c.day, '%b %d') AS label,
           c.day = CURDATE() AS partial,
           COALESCE(e.count, 0) AS encounters, COALESCE(s.count, 0) AS emergencies
    FROM calendar c
    LEFT JOIN encounters e ON e.day = c.day
    LEFT JOIN emergencies s ON s.day = c.day
    ORDER BY c.day
  `);
  const series = key => days.map(day => ({
    date: day.date, label: day.label, count: Number(day[key]), partial: Boolean(day.partial),
  }));
  return { timeSeries: series('encounters'), emergencyTimeSeries: series('emergencies') };
}
