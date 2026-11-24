import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import mysql from 'mysql2/promise';
import express from 'express';
import jwt from 'jsonwebtoken';
import { once } from 'node:events';
import { pool } from '../src/db/pool.js';
import { runMigrations } from '../src/db/migrate.js';
import { qualificationActor, createApplication, changeApplication, applicationDetail, setReviewer, endAppointment, enableQualificationRoster } from '../src/emergency/qualificationService.js';
import { resolveResponderAccess, getResponderAudience } from '../src/emergency/responderAccess.js';
import { seedQualificationDemo } from '../src/emergency/qualificationDemo.js';
import { processResponderQualifications } from '../src/workers/responderQualificationWorker.js';
import { COMPETENCIES } from '../src/emergency/qualificationPolicy.js';
import qualificationsRouter from '../src/routes/responderQualifications.js';
import { JWT_SECRET } from '../src/utils/secrets.js';
import qualificationMigration, {qualificationTables} from '../src/db/migrations/016-responder-qualifications.js';
const skip = !process.env.VALETUDO_MIGRATION_TEST_PORT && 'Set VALETUDO_MIGRATION_TEST_PORT to use disposable MySQL databases';
test('qualification lifecycle, concurrent decisions, privacy, renewal and development scenarios', { skip }, async (t) => {
    const database = 'vhl_qualification_test_' + randomUUID().replaceAll('-', '');
    const options = { host: '127.0.0.1', port: Number(process.env.VALETUDO_MIGRATION_TEST_PORT), user: process.env.DB_USER || 'root', password: process.env.VALETUDO_MIGRATION_TEST_PASSWORD || process.env.DB_PASSWORD };
    const admin = await mysql.createConnection({ ...options, multipleStatements: true });
    const db = mysql.createPool({ ...options, database, connectionLimit: 6 });
    let server;
    t.after(async () => { if (server) {
        server.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
    } t.mock.restoreAll(); await db.end(); if (!/^vhl_qualification_test_[a-f0-9]+$/.test(database))
        throw Error('Unsafe test database name'); await admin.query('DROP DATABASE IF EXISTS ??', [database]); await admin.end(); await pool.end(); });
    const source = await readFile(new URL('../schema.sql', import.meta.url), 'utf8');
    await admin.query(source.replaceAll('`valetudo_healthlink`', '`' + database + '`'));
    await runMigrations(db);
    t.mock.method(pool, 'query', (...args) => db.query(...args));
    t.mock.method(pool, 'getConnection', () => db.getConnection());
    const stored = new Map();
    const app = express();
    app.use(express.json());
    app.use('/qualifications', qualificationsRouter(null, {
        async uploadToS3({ buffer, key }) { stored.set(key, buffer); }, async getBufferFromS3(key) { return stored.get(key); }, async deleteFromS3(key) { stored.delete(key); },
    }));
    server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const request = (userId, path, method = 'GET', body) => fetch(`http://127.0.0.1:${server.address().port}/qualifications${path}`, { method, headers: { Authorization: 'Bearer ' + jwt.sign({ user_id: userId, roles: ['ADMIN'] }, JWT_SECRET), ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }) }, body: body == null ? undefined : body instanceof FormData ? body : JSON.stringify(body) });
    assert.equal((await request(12, '/reviewers')).status, 403, 'A stale ADMIN JWT cannot grant oversight');
    assert.equal((await request(12, '/me')).status, 200);
    assert.equal((await resolveResponderAccess(5)).tier, 'community');
    assert.equal((await resolveResponderAccess(12)).authorized, false);
    assert.equal((await resolveResponderAccess(1)).authorized, false);
    assert.equal((await resolveResponderAccess(3)).tier, 'clinical');
    const before = await db.query('SELECT COUNT(*) AS count FROM RESPONDER_APPLICATIONS');
    await db.query('SELECT settings_id FROM RESPONDER_QUALIFICATION_SETTINGS WHERE settings_id=1');
    const cx = await db.getConnection();
    try {
        await cx.beginTransaction();
        await seedQualificationDemo(cx);
        await seedQualificationDemo(cx);
        await cx.commit();
    }
    finally {
        cx.release();
    }
    assert.equal((await db.query('SELECT COUNT(*) AS count FROM RESPONDER_APPLICATIONS'))[0][0].count, before[0][0].count);
    const [[pending]] = await db.query('SELECT * FROM RESPONDER_APPLICATIONS WHERE user_id=12');
    await assert.rejects(createApplication(12, { requestedLevel: 'community' }), /open application/);
    await assert.rejects(applicationDetail(pending.application_id, await qualificationActor(5)), /private/);
    const assessment = { identityVerified: true, affiliationVerified: true, orientationCompleted: true, professionalCredentialsVerified: false, assessor: 'Synthetic demo data', assessmentDate: new Date().toISOString().slice(0, 10), method: 'Clinic practical assessment', notes: 'Synthetic demo data: practical return demonstration.', result: 'passed', competencies: Object.fromEntries(COMPETENCIES.map(k => [k, true])) };
    await assert.rejects(changeApplication(1, pending.application_id, { revision: pending.revision, action: 'approve', assessment, reason: 'Admin cannot qualify' }), /designated clinic reviewer/);
    const [[{count: initialEvents}]] = await db.query('SELECT COUNT(*) AS count FROM RESPONDER_QUALIFICATION_EVENTS WHERE application_id=?',[pending.application_id]);
    for (const action of ['save_assessment','approve','needs_information','training_required','reject']) {
        const denied=await request(2,`/applications/${pending.application_id}`,'PATCH',{revision:pending.revision,action,assessment,reason:'Attempt to bypass Start review.'});
        assert.equal(denied.status,409,action+' cannot skip Start review');
        assert.match((await denied.json()).error,/Start review/);
    }
    const evidenceUpload=()=>{
        const file=new FormData();file.append('file',new Blob(['%PDF-1.4 synthetic reviewer evidence'],{type:'application/pdf'}),'review-assessment.pdf');return file;
    };
    assert.equal((await request(2,`/applications/${pending.application_id}/evidence`,'POST',evidenceUpload())).status,403);
    assert.equal((await request(2,`/applications/${pending.application_id}`)).status,200,'Reviewers may inspect submitted applications');
    let [[row]] = await db.query('SELECT * FROM RESPONDER_APPLICATIONS WHERE application_id=?', [pending.application_id]);
    assert.equal(row.status,'submitted');assert.equal(row.revision,pending.revision);assert.equal(row.assessment,null);
    assert.equal((await db.query('SELECT COUNT(*) AS count FROM RESPONDER_QUALIFICATION_EVENTS WHERE application_id=?',[pending.application_id]))[0][0].count,initialEvents,'Rejected bypasses leave no decision history');
    assert.equal((await request(2,`/applications/${row.application_id}`,'PATCH',{revision:row.revision,action:'start_review',assessment})).status,200);
    [[row]] = await db.query('SELECT * FROM RESPONDER_APPLICATIONS WHERE application_id=?',[row.application_id]);
    assert.equal(row.status,'under_review');assert.equal(row.reviewed_by,2);assert.equal(row.assessment,null,'Starting review must not save assessment input');
    await assert.rejects(changeApplication(3,row.application_id,{revision:row.revision,action:'start_review'}),/already started/);
    assert.equal((await request(2,`/applications/${row.application_id}/evidence`,'POST',evidenceUpload())).status,201,'A reviewer can attach evidence after starting review');
    [[row]] = await db.query('SELECT * FROM RESPONDER_APPLICATIONS WHERE application_id=?',[row.application_id]);
    await changeApplication(2,row.application_id,{revision:row.revision,action:'needs_information',reason:'Please clarify your campus affiliation.'});
    [[row]] = await db.query('SELECT * FROM RESPONDER_APPLICATIONS WHERE application_id=?',[row.application_id]);
    await changeApplication(12, row.application_id, { revision: row.revision, action: 'submit', requestedLevel: 'community', affiliation: 'Synthetic campus', trainingHistory: 'Requesting supervised campus assessment', acceptResponsibilities: true });
    [[row]] = await db.query('SELECT * FROM RESPONDER_APPLICATIONS WHERE application_id=?', [row.application_id]);
    await assert.rejects(changeApplication(2,row.application_id,{revision:row.revision,action:'approve',assessment,reason:'Attempt to skip review after resubmission.'}),/Start review/);
    await changeApplication(2,row.application_id,{revision:row.revision,action:'start_review'});
    [[row]] = await db.query('SELECT * FROM RESPONDER_APPLICATIONS WHERE application_id=?',[row.application_id]);
    const competing = await Promise.allSettled([2, 3].map(id => changeApplication(id, row.application_id, { revision: row.revision, action: 'approve', assessment, reason: 'Passed campus assessment.' })));
    assert.equal(competing.filter(x => x.status === 'fulfilled').length, 1);
    assert.equal((await resolveResponderAccess(12)).authorized, true);
    const renewal = await createApplication(12, { requestedLevel: 'community' });
    assert.equal((await resolveResponderAccess(12)).authorized, true, 'Opening renewal preserves valid appointment');
    const file = new FormData();
    file.append('file', new Blob(['%PDF-1.4 synthetic evidence'], { type: 'application/pdf' }), 'assessment.pdf');
    const uploaded = await request(12, `/applications/${renewal.applicationId}/evidence`, 'POST', file);
    assert.equal(uploaded.status, 201);
    const evidenceId = (await uploaded.json()).evidenceId;
    assert.ok([...stored.values()][0].toString().startsWith('enc:v2:'), 'Evidence must be encrypted at rest');
    assert.equal((await request(5, `/evidence/${evidenceId}`)).status, 403);
    assert.equal((await request(1, `/evidence/${evidenceId}`)).status, 200);
    const download = await request(12, `/evidence/${evidenceId}`);
    assert.equal(await download.text(), '%PDF-1.4 synthetic evidence');
    assert.match(download.headers.get('content-disposition'), /^attachment/);
    const spoof = new FormData();
    spoof.append('file', new Blob(['<script>bad</script>'], { type: 'application/pdf' }), 'fake.pdf');
    assert.equal((await request(12, `/applications/${renewal.applicationId}/evidence`, 'POST', spoof)).status, 415);
    await changeApplication(12, renewal.applicationId, { revision: 2, action: 'withdraw' });
    const [[appointment]] = await db.query('SELECT * FROM RESPONDER_APPOINTMENTS WHERE user_id=12 ORDER BY appointment_id DESC LIMIT 1');
    await endAppointment(1, appointment.appointment_id, { status: 'revoked', reason: 'Synthetic revocation scenario.' });
    assert.equal((await resolveResponderAccess(12)).authorized, false);
    assert.ok(!(await getResponderAudience()).some(u => u.userId === 12));
    await assert.rejects(setReviewer(1, 5, true), /nurse or doctor/);
    await setReviewer(1, 2, false);
    assert.equal((await qualificationActor(2)).reviewer, false);
    await setReviewer(1, 2, true);
    const own = await createApplication(2, { requestedLevel: 'staff' });
    await changeApplication(2, own.applicationId, { revision: 1, action: 'submit', requestedLevel: 'staff', affiliation: 'Clinic', trainingHistory: 'Assessment renewal', acceptResponsibilities: true });
    await assert.rejects(changeApplication(2, own.applicationId, { revision: 2, action: 'approve', assessment, reason: 'Self review' }), /own application/);
    const nomination = await createApplication(2, { userId: 7, requestedLevel: 'community' });
    await assert.rejects(changeApplication(7, nomination.applicationId, { revision: 1, action: 'submit', requestedLevel: 'community', affiliation: 'Campus', trainingHistory: 'Assessment requested', acceptResponsibilities: true }), /Accept the nomination/);
    await changeApplication(7, nomination.applicationId, { revision: 1, action: 'accept_nomination', acceptResponsibilities: true });
    await changeApplication(7, nomination.applicationId, { revision: 2, action: 'submit', requestedLevel: 'community', affiliation: 'Campus', trainingHistory: 'Assessment requested', acceptResponsibilities: true });
    await changeApplication(2, nomination.applicationId, { revision: 3, action: 'start_review' });
    await changeApplication(2, nomination.applicationId, { revision: 4, action: 'training_required', reason: 'Complete the practical drill.' });
    await assert.rejects(changeApplication(2, nomination.applicationId, { revision: 5, action: 'approve', assessment, reason: 'Bypass training' }), /must submit/);
    await changeApplication(7, nomination.applicationId, { revision: 5, action: 'submit', requestedLevel: 'community', affiliation: 'Campus', trainingHistory: 'Training completed', acceptResponsibilities: true });
    await assert.rejects(changeApplication(2, nomination.applicationId, { revision: 6, action: 'reject', reason: 'Attempt to skip review.' }),/Start review/);
    await changeApplication(2, nomination.applicationId, { revision: 6, action: 'start_review' });
    await changeApplication(2, nomination.applicationId, { revision: 7, action: 'reject', reason: 'Assessment incomplete.' });
    await db.query('UPDATE RESPONDER_APPOINTMENTS SET expires_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 SECOND) WHERE user_id=5');
    assert.equal((await resolveResponderAccess(5)).authorized, false, 'Access expiry does not await worker');
    await processResponderQualifications();
    assert.equal((await resolveResponderAccess(5)).appointmentStatus, 'expired');
    await db.query('UPDATE RESPONDER_APPOINTMENTS SET expires_at=DATE_ADD(UTC_TIMESTAMP(),INTERVAL 6 DAY) WHERE user_id=3');
    await processResponderQualifications();
    await processResponderQualifications();
    assert.equal((await db.query("SELECT COUNT(*) AS count FROM RESPONDER_QUALIFICATION_NOTICES WHERE user_id=3 AND notice_key LIKE '%:reminder:7'"))[0][0].count, 1);
    await enableQualificationRoster(1);
    await db.query('DELETE FROM USER_ROLES WHERE user_id=3');
    assert.equal((await resolveResponderAccess(3)).authorized, false, 'Live role loss prevents staff access');
    // Rehearse an installation that genuinely predates qualification tables.
    for (const sql of [...qualificationTables].reverse()) {
        const table=sql.match(/EXISTS (\w+)/)[1];
        await db.query('DROP TABLE ??',[table]);
    }
    await db.query("INSERT IGNORE INTO USER_ROLES (user_id,role_id) SELECT 3,role_id FROM ROLES WHERE code='NURSE'");
    await db.query('UPDATE USERS SET is_qualified_responder=1 WHERE user_id=5');
    await qualificationMigration.schema(db); await qualificationMigration.data(db);
    assert.equal((await db.query('SELECT enforced FROM RESPONDER_QUALIFICATION_SETTINGS'))[0][0].enforced,0);
    assert.equal((await db.query('SELECT COUNT(*) AS count FROM RESPONDER_APPOINTMENTS'))[0][0].count,0,'A production upgrade must not fabricate approvals');
    await assert.rejects(enableQualificationRoster(1),/Approve an active response staff roster/);
    const connection=await db.getConnection();
    try {await connection.beginTransaction();await seedQualificationDemo(connection);await seedQualificationDemo(connection);await connection.commit();}
    catch(error){await connection.rollback();throw error;}finally{connection.release();}
    assert.equal((await resolveResponderAccess(5)).tier,'community');
    assert.equal((await resolveResponderAccess(12)).authorized,false);
    assert.equal((await db.query("SELECT COUNT(*) AS count FROM RESPONDER_APPOINTMENTS WHERE starts_at<=UTC_TIMESTAMP(3) AND expires_at<=DATE_ADD(starts_at,INTERVAL 1 YEAR)"))[0][0].count,5,'Fixture dates are UTC even on a Philippine host');
});
