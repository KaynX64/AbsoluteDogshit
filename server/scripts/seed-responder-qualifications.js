import { pool } from '../src/db/pool.js';
import { runMigrations } from '../src/db/migrate.js';
import { seedQualificationDemo } from '../src/emergency/qualificationDemo.js';
import { resolveResponderAccess } from '../src/emergency/responderAccess.js';
if (process.env.NODE_ENV === 'production' || !process.argv.includes('--development-fixture')) {
    console.error('This explicit synthetic fixture is for development only. Pass --development-fixture.');
    await pool.end();
    process.exitCode = 1;
}
else {
    let db;
    try {
        await runMigrations(pool);
        db = await pool.getConnection();
        await db.beginTransaction();
        await db.query('SELECT settings_id FROM RESPONDER_QUALIFICATION_SETTINGS WHERE settings_id=1 FOR UPDATE');
        const result = await seedQualificationDemo(db);
        const scenarios = await Promise.all([5,12].map(async userId => ({userId,...await resolveResponderAccess(userId,db)})));
        await db.commit();
        console.log(JSON.stringify({ syntheticDemoData: true, accounts: result, scenarios }));
    }
    catch (error) {
        if (db)
            await db.rollback();
        console.error('Qualification fixture failed:', error.code || error.message);
        process.exitCode = 1;
    }
    finally {
        db?.release();
        await pool.end();
    }
}
