export async function saveRoleProfile(connection, targetUserId, {
  role_code, student_no, course, year_level, faculty_no, employee_no, license_no, admin_no,
  specialty, department, position,
}) {
  if (role_code === 'STUDENT' && student_no) {
    await connection.query(
      `INSERT INTO STUDENT_PROFILES (user_id, student_no, course, year_level)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE student_no = VALUES(student_no), course = VALUES(course), year_level = VALUES(year_level)`,
      [targetUserId, student_no.trim(), course ? course.trim() : 'General', Number(year_level) || 1]
    );
  } else if (['DOCTOR', 'DENTIST', 'NURSE', 'EMERGENCY_RESPONDER', 'ADMIN'].includes(role_code)) {
    // admin_no is only meaningful for the ADMIN role. For clinical staff
    // it stays NULL so the column stays semantically clean.
    const adminNoValue =
      role_code === 'ADMIN' && admin_no ? admin_no.trim() : null;

    await connection.query(
      `INSERT INTO STAFF_PROFILES (user_id, admin_no, license_no, specialty, department)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       admin_no   = VALUES(admin_no),
       license_no = VALUES(license_no),
       specialty  = VALUES(specialty),
       department = VALUES(department)`,
      [
        targetUserId,
        adminNoValue,
        license_no ? license_no.trim() : null,
        specialty ? specialty.trim() : null,
        department ? department.trim() : 'University Infirmary',
      ]
    );
  } else if (role_code === 'FACULTY') {
    if (!faculty_no || !String(faculty_no).trim()) {
      throw new Error('Faculty number is required for FACULTY accounts.');
    }
    await connection.query(
      `INSERT INTO FACULTY_PROFILES (user_id, faculty_no, department, position)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       faculty_no = VALUES(faculty_no),
       department = VALUES(department),
       position   = VALUES(position)`,
      [
        targetUserId,
        String(faculty_no).trim(),
        department ? department.trim() : 'Academic Affairs',
        position ? position.trim() : 'Faculty Member',
      ]
    );
  } else if (role_code === 'NON_TEACHING') {
    await connection.query(
      `INSERT INTO NON_TEACHING_PROFILES (user_id, employee_no, department, position)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       employee_no = VALUES(employee_no),
       department = VALUES(department),
       position = VALUES(position)`,
      [
        targetUserId,
        employee_no ? employee_no.trim() : null,
        department ? department.trim() : 'General Services',
        position ? position.trim() : 'Support Staff',
      ]
    );
  }
}
