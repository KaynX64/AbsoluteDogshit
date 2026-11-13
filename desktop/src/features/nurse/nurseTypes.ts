export interface SosAlert {
  alert_id: number;
  first_name: string;
  last_name: string;
  phone?: string;
  studentNo?: string;
  course?: string;
  roleLabel?: string;
  blood_type?: string;
  allergies?: string;
  notes?: string;
  medicalDetailsRedacted?: boolean;
  latitude?: number | string | null;
  longitude?: number | string | null;
  status: string;
  created_at: string;
}

export interface ExpectedItem {
  appointment_id: number;
  patient_id: number;
  doctor_user_id: number;
  date_time: string;
  time_slot: string;
  date_str: string;
  appointment_type: string;
  status: string;
  notes: string;
  first_name: string;
  last_name: string;
  phone: string;
  student_no: string;
  course: string;
  blood_type: string;
  allergies: string;
  chronic_conditions: string;
  doctor_first_name: string;
  doctor_last_name: string;
  doctor_specialty: string;
}

export interface ActiveTicket {
  queue_id: number;
  queue_number: number;
  status: string;
  appointment_id: number | null;
  ticket_no: string;
  arrival_time: string;
  visit_type: string;
  doctor_name: string;
}

