// server/src/routes/emergency.js
import express from 'express';
import { pool } from '../db.js';
import { authenticateToken } from '../auth.js';
import { decrypt } from '../utils/cryptoVault.js';
import { requireRoles } from '../middleware/rbac.js';
import { sendPushToRoles } from '../utils/fcmNotifier.js';
import { logAudit } from '../utils/auditLogger.js';

export default function emergencyRouter(io) {
  const router = express.Router();

  // 1. POST /api/emergency/sos - Trigger Campus Emergency SOS
  router.post('/sos', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.user_id;
      const { latitude, longitude, notes } = req.body;

      if (!latitude || !longitude) {
        return res.status(400).json({ error: 'Latitude and Longitude are required coordinates.' });
      }

      const lat = Number(latitude);
      const lng = Number(longitude);

      if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        return res.status(400).json({ error: 'Invalid geographic coordinates provided.' });
      }

      const connection = await pool.getConnection();

      let alertId;
      try {
        await connection.beginTransaction();

        const [insertResult] = await connection.query(
          `INSERT INTO EMERGENCY_ALERTS (user_id, location, status, notes)
           VALUES (?, ST_SRID(POINT(?, ?), 4326), 'triggered', ?)`,
          [userId, lng, lat, notes || 'Emergency SOS pressed'] //lng (X), lat (Y)
        );

        alertId = insertResult.insertId;

        // R.A. 10173 Audit Logging
        await logAudit(connection, {
          userId,
          action: 'CREATE',
          table: 'EMERGENCY_ALERTS',
          recordId: alertId,
          oldValue: null,
          newValue: { latitude: lat, longitude: lng, notes: notes || 'Emergency SOS pressed' },
          ipAddress: req.ip,
        });

        await connection.commit();
      } catch (dbErr) {
        await connection.rollback();
        throw dbErr;
      } finally {
        connection.release();
      }

      // Fetch user demographic & health indicators for responder payload
      const [details] = await pool.query(
        `SELECT u.user_id, u.first_name, u.last_name, u.phone, u.email,
                COALESCE(r.code, 'STUDENT') AS primary_role,
                COALESCE(r.name, 'Student Patient') AS role_name,
                COALESCE(sp.student_no, st.license_no, fp.position, 'PSU Member') AS identifier_no,
                COALESCE(sp.course, st.department, fp.department, 'PSU Lingayen') AS affiliation,
                hp.blood_type, hp.allergies, hp.chronic_conditions,
                hp.emergency_contact_name, hp.emergency_contact_phone
         FROM USERS u
         LEFT JOIN USER_ROLES ur ON u.user_id = ur.user_id
         LEFT JOIN ROLES r ON ur.role_id = r.role_id
         LEFT JOIN STUDENT_PROFILES sp ON u.user_id = sp.user_id
         LEFT JOIN STAFF_PROFILES st ON u.user_id = st.user_id
         LEFT JOIN FACULTY_PROFILES fp ON u.user_id = fp.user_id
         LEFT JOIN HEALTH_PROFILES hp ON u.user_id = hp.user_id
         WHERE u.user_id = ?
         LIMIT 1`,
        [userId]
      );

      const patientInfo = details[0] || {};
      const decryptedAllergies = decrypt(patientInfo.allergies) || 'None listed';
      const decryptedConditions = decrypt(patientInfo.chronic_conditions) || 'None listed';

      let roleLabel = 'Student';
      if (patientInfo.primary_role === 'ADMIN') roleLabel = 'System Administrator';
      else if (patientInfo.primary_role === 'DOCTOR') roleLabel = 'Campus Physician';
      else if (patientInfo.primary_role === 'DENTIST') roleLabel = 'Campus Dentist';
      else if (patientInfo.primary_role === 'NURSE') roleLabel = 'Clinic Nurse';
      else if (patientInfo.primary_role === 'FACULTY') roleLabel = 'Faculty / Staff';
      else if (patientInfo.primary_role === 'EMERGENCY_RESPONDER') roleLabel = 'Emergency Responder';

      const alertPayload = {
        alertId,
        userId,
        patientName: `${patientInfo.first_name} ${patientInfo.last_name}`,
        phone: patientInfo.phone,
        role: patientInfo.primary_role,
        roleLabel,
        studentNo: patientInfo.identifier_no,
        course: patientInfo.affiliation,
        bloodType: patientInfo.blood_type || 'Unknown',
        allergies: decryptedAllergies,
        chronicConditions: decryptedConditions,
        emergencyContact: `${patientInfo.emergency_contact_name || 'N/A'} (${patientInfo.emergency_contact_phone || 'N/A'})`,
        latitude: lat,
        longitude: lng,
        googleMapsUrl: `https://www.google.com/maps?q=${lat},${lng}`,
        status: 'triggered',
        createdAt: new Date().toISOString(),
      };

      // 1. Dispatch Firebase Cloud Messaging (FCM) background push to responders & medical staff
      sendPushToRoles(['EMERGENCY_RESPONDER', 'NURSE', 'DOCTOR', 'ADMIN'], {
        title: `🚨 EMERGENCY SOS: ${alertPayload.patientName}`,
        body: `Location: ${lat.toFixed(5)}, ${lng.toFixed(5)} | Blood: ${alertPayload.bloodType} | Allergies: ${alertPayload.allergies}`,
        data: { alertId: String(alertId), type: 'EMERGENCY_SOS' },
      }).catch((err) => console.error('[FCM SOS Push Error]:', err.message));

      // 2. Broadcast via WebSockets (Socket.IO) to both responder room and clinical consoles
      if (io) {
        io.to('responders').emit('emergency:new_alert', alertPayload);
        io.emit('emergency:new_alert', alertPayload);
      }

      res.status(201).json({
        message: 'Emergency alert dispatched to PSU Clinic and Quick-Response team.',
        alertId,
      });
    } catch (error) {
      console.error('SOS Trigger Error:', error);
      res.status(500).json({ error: 'Failed to process SOS alert.' });
    }
  });

  // 2. GET /api/emergency/active - Retrieve Active/Dispatched Alerts
  router.get('/active', authenticateToken, requireRoles('EMERGENCY_RESPONDER', 'DOCTOR', 'NURSE', 'ADMIN'), async (req, res) => {
    try {
      const [alerts] = await pool.query(
        `SELECT a.alert_id, a.user_id, a.latitude, a.longitude, a.status, a.created_at, a.notes,
                u.first_name, u.last_name, u.phone,
                COALESCE(r.code, 'STUDENT') AS primary_role,
                COALESCE(sp.student_no, st.license_no, fp.position, 'PSU Member') AS identifier_no,
                COALESCE(sp.course, st.department, fp.department, 'PSU Lingayen') AS affiliation,
                hp.blood_type, hp.allergies
         FROM EMERGENCY_ALERTS a
         JOIN USERS u ON a.user_id = u.user_id
         LEFT JOIN USER_ROLES ur ON u.user_id = ur.user_id
         LEFT JOIN ROLES r ON ur.role_id = r.role_id
         LEFT JOIN STUDENT_PROFILES sp ON u.user_id = sp.user_id
         LEFT JOIN STAFF_PROFILES st ON u.user_id = st.user_id
         LEFT JOIN FACULTY_PROFILES fp ON u.user_id = fp.user_id
         LEFT JOIN HEALTH_PROFILES hp ON u.user_id = hp.user_id
         WHERE a.status IN ('triggered', 'acknowledged', 'dispatched')
         ORDER BY a.created_at DESC`
      );

      const decryptedAlerts = alerts.map((a) => ({
        ...a,
        studentNo: a.identifier_no,
        course: a.affiliation,
        allergies: decrypt(a.allergies) || 'None',
      }));

      res.json(decryptedAlerts);
    } catch (error) {
      console.error('[Emergency Active Error]:', error);
      res.status(500).json({ error: 'Failed to fetch active alerts.' });
    }
  });

  // 3. PATCH /api/emergency/:alertId/status - Update Incident Status (Acknowledge / Dispatch / Resolve)
  router.patch('/:alertId/status', authenticateToken, requireRoles('EMERGENCY_RESPONDER', 'DOCTOR', 'NURSE', 'ADMIN'), async (req, res) => {
    try {
      const { alertId } = req.params;
      const { status } = req.body;
      const responderId = req.user.user_id;

      if (!['acknowledged', 'dispatched', 'resolved', 'false_alarm'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status update.' });
      }

      let extraUpdate = '';
      const params = [status, responderId];

      if (status === 'acknowledged') {
        extraUpdate = ', acknowledged_at = CURRENT_TIMESTAMP';
      } else if (status === 'resolved' || status === 'false_alarm') {
        extraUpdate = `, resolved_at = CURRENT_TIMESTAMP,
                       response_time_seconds = TIMESTAMPDIFF(SECOND, created_at, CURRENT_TIMESTAMP)`;
      }

      params.push(alertId);

      await pool.query(
        `UPDATE EMERGENCY_ALERTS
         SET status = ?, assigned_responder_id = ? ${extraUpdate}
         WHERE alert_id = ?`,
        params
      );

      if (io) {
        io.emit('emergency:status_change', { alertId: Number(alertId), status, responderId });
      }

      res.json({ message: `Alert #${alertId} updated to ${status}.` });
    } catch (error) {
      console.error('[Emergency Status Error]:', error);
      res.status(500).json({ error: 'Failed to update alert status.' });
    }
  });

  return router;
}