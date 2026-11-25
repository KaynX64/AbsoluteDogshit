import express from 'express';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import { pool } from '../db/pool.js';
import { authenticateToken } from '../auth/middleware.js';
import { encrypt, decrypt } from '../utils/cryptoVault.js';
import { uploadToS3, getBufferFromS3, deleteFromS3 } from '../utils/s3Vault.js';
import { qualificationActor, qualificationOverview, qualificationTransaction, getApplication, applicationDetail, createApplication, changeApplication, setReviewer, endAppointment, enableQualificationRoster, publishQualification, event } from '../emergency/qualificationService.js';
import { OPEN_APPLICATION_STATES, EDITABLE_APPLICATION_STATES, qualificationError as fail, qualificationRecord } from '../emergency/qualificationPolicy.js';
export function evidenceMime(buffer) {
    if (buffer?.subarray(0, 5).toString('latin1') === '%PDF-')
        return 'application/pdf';
    if (buffer?.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
        return 'image/png';
    if (buffer?.length >= 3 && buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255)
        return 'image/jpeg';
    return null;
}
export default function responderQualifications(io, storage = { uploadToS3, getBufferFromS3, deleteFromS3 }) {
    const router = express.Router();
    const route = handler => async (req, res, next) => {
        try {
            await handler(req, res, next);
        }
        catch (error) {
            if (res.headersSent)
                return next(error);
            res.status(error.status || (error.code === 'ER_DUP_ENTRY' ? 409 : 500)).json({ error: error.status ? error.message : error.code === 'ER_DUP_ENTRY' ? 'The record already exists. Refresh and retry.' : 'Unable to complete the qualification request.' });
        }
    };
    const notify = userId => publishQualification(io, userId).catch(error => console.error('[Qualification notification]', error.code || error.name));
    router.use(authenticateToken, route(async (req, res, next) => {
        res.set('Cache-Control', 'no-store');
        req.qualificationActor = await qualificationActor(req.user.user_id);
        next();
    }));
    router.get('/me', route(async (req, res) => res.json(await qualificationOverview(req.qualificationActor))));
    router.get('/applications', route(async (req, res) => {
        const actor = req.qualificationActor;
        if (!actor.admin && !actor.reviewer)
            throw fail('Qualification review permission is required.', 403);
        const before = Number(req.query.before) || Number.MAX_SAFE_INTEGER;
        const [rows] = await pool.query(`SELECT a.*,CONCAT(u.first_name,' ',u.last_name) AS applicant_name,
   p.appointment_id,p.status AS appointment_status,p.level AS appointment_level,p.expires_at
   FROM RESPONDER_APPLICATIONS a JOIN USERS u ON u.user_id=a.user_id LEFT JOIN RESPONDER_APPOINTMENTS p ON p.application_id=a.application_id
   WHERE a.application_id<? ORDER BY a.application_id DESC LIMIT 100`, [before]);
        res.json({ applications: rows.map(qualificationRecord), nextCursor: rows.length === 100 ? rows.at(-1).application_id : null });
    }));
    router.get('/candidates', route(async (req, res) => {
        if (!req.qualificationActor.admin && !req.qualificationActor.reviewer)
            throw fail('Nomination permission is required.', 403);
        const search = String(req.query.q || '').trim().slice(0, 100);
        if (!search)
            return res.json([]);
        const [rows] = await pool.query(`SELECT u.user_id,CONCAT(u.first_name,' ',u.last_name) AS name,GROUP_CONCAT(DISTINCT r.code) AS roles
   FROM USERS u LEFT JOIN USER_ROLES ur ON ur.user_id=u.user_id LEFT JOIN ROLES r ON r.role_id=ur.role_id
   WHERE u.is_active=1 AND u.deleted_at IS NULL AND (CONCAT(u.first_name,' ',u.last_name) LIKE ? OR CAST(u.user_id AS CHAR)=?) GROUP BY u.user_id,u.first_name,u.last_name LIMIT 25`, ['%' + search + '%', search]);
        res.json(rows.map(qualificationRecord));
    }));
    router.get('/reviewers', route(async (req, res) => {
        if (!req.qualificationActor.admin)
            throw fail('Responder administrator permission is required.', 403);
        const [rows] = await pool.query(`SELECT rr.*,CONCAT(u.first_name,' ',u.last_name) AS name FROM RESPONDER_REVIEWERS rr JOIN USERS u ON u.user_id=rr.user_id ORDER BY rr.user_id`);
        res.json(rows);
    }));
    router.put('/reviewers/:id', route(async (req, res) => {
        await setReviewer(req.user.user_id, Number(req.params.id), req.body.isActive);
        await notify(Number(req.params.id));
        res.json({ ok: true });
    }));
    router.post('/enable', route(async (req, res) => {
        await enableQualificationRoster(req.user.user_id);
        // Contains no incident data. Every device must drop stale access on cutover.
        io?.emit('responder:status_changed', {});
        res.json({ ok: true });
    }));
    router.post('/applications', route(async (req, res) => {
        const result = await createApplication(req.user.user_id, req.body);
        await notify(result.userId);
        res.status(201).json(result);
    }));
    router.get('/applications/:id', route(async (req, res) => res.json(await applicationDetail(Number(req.params.id), req.qualificationActor))));
    router.patch('/applications/:id', route(async (req, res) => {
        const result = await changeApplication(req.user.user_id, Number(req.params.id), req.body);
        await notify(result.userId);
        res.json(result);
    }));
    router.post('/appointments/:id/end', route(async (req, res) => {
        const result = await endAppointment(req.user.user_id, Number(req.params.id), req.body);
        await notify(result.userId);
        res.json({ ok: true });
    }));
    const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 }, fileFilter: (_req, file, cb) => {
            if (!['application/pdf', 'image/jpeg', 'image/png'].includes(file.mimetype))
                return cb(fail('Use a PDF, JPEG or PNG file.', 415));
            cb(null, true);
        } }).single('file');
    router.post('/applications/:id/evidence', route(async (req, _res, next) => {
        await getApplication(pool, Number(req.params.id), req.qualificationActor);
        next();
    }), (req, res, next) => upload(req, res, error => error ? res.status(error.status || (error.code === 'LIMIT_FILE_SIZE' ? 413 : 400)).json({ error: error.code === 'LIMIT_FILE_SIZE' ? 'Evidence must be no larger than 5 MB.' : error.message }) : next()), route(async (req, res) => {
        if (!req.file || evidenceMime(req.file.buffer) !== req.file.mimetype)
            throw fail('File content must match PDF, JPEG or PNG.', 415);
        const key = `responder-evidence/${randomUUID()}`;
        let stored = false, committed = false;
        try {
            const result = await qualificationTransaction(req.user.user_id, async (db, actor) => {
                const row = await getApplication(db, Number(req.params.id), actor, { write: true });
                const own = Number(row.user_id) === actor.userId;
                if (!(own && EDITABLE_APPLICATION_STATES.includes(row.status)) && !(actor.reviewer && !own && row.status === 'under_review'))
                    throw fail('Evidence cannot be changed at this stage.', 403);
                const [[{ count }]] = await db.query('SELECT COUNT(*) AS count FROM RESPONDER_EVIDENCE WHERE application_id=?', [row.application_id]);
                if (count >= 10)
                    throw fail('At most ten evidence files may be attached.');
                const encrypted = encrypt(req.file.buffer.toString('base64'));
                await storage.uploadToS3({ buffer: Buffer.from(encrypted), key, mimeType: 'application/octet-stream' });
                stored = true;
                const name = req.file.originalname.replace(/[^a-zA-Z0-9._ -]/g, '_').slice(0, 200) || 'evidence';
                const [insert] = await db.query('INSERT INTO RESPONDER_EVIDENCE (application_id,uploaded_by,file_name,mime_type,file_size,s3_key) VALUES (?,?,?,?,?,?)', [row.application_id, actor.userId, name, req.file.mimetype, req.file.size, key]);
                await db.query('UPDATE RESPONDER_APPLICATIONS SET revision=revision+1,updated_at=UTC_TIMESTAMP(3) WHERE application_id=?', [row.application_id]);
                await event(db, row.application_id, actor.userId, 'EVIDENCE_ADDED', { evidenceId: insert.insertId });
                return { evidenceId: insert.insertId };
            });
            committed = true;
            res.status(201).json(result);
        }
        finally {
            if (stored && !committed)
                await storage.deleteFromS3(key).catch(() => { });
        }
    }));
    router.get('/evidence/:id', route(async (req, res) => {
        const [[file]] = await pool.query('SELECT * FROM RESPONDER_EVIDENCE WHERE evidence_id=?', [req.params.id]);
        if (!file)
            throw fail('Evidence not found.', 404);
        await getApplication(pool, file.application_id, req.qualificationActor);
        const encrypted = await storage.getBufferFromS3(file.s3_key), plain = decrypt(encrypted.toString());
        if (!plain || plain.startsWith('[ENCRYPTED'))
            throw fail('Evidence integrity check failed.', 500);
        const buffer = Buffer.from(plain, 'base64');
        res.set({ 'Content-Type': file.mime_type, 'Content-Disposition': `attachment; filename="${encodeURIComponent(file.file_name)}"`, 'X-Content-Type-Options': 'nosniff', 'Content-Length': String(buffer.length) });
        res.send(buffer);
    }));
    return router;
}
