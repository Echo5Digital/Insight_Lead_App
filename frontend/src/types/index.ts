export type Role = 'admin' | 'staff' | 'readonly';

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  tenantId: string;
}

export interface Lead {
  _id: string;
  tenantId: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  dob?: string;
  insurance?: string;
  referralSource?: string;
  notes?: string;
  status?: string;
  source?: string;
  convertedToPatient?: boolean;
  patientId?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface Patient {
  _id: string;
  tenantId: string;
  patientId?: string;
  name: string;
  phone?: string;
  email?: string;
  dob?: string;
  insurance?: string;
  referralSource?: string;
  category?: 'Standard' | 'Pain Management';
  status?: string;
  notes?: string;
  // Process milestones
  referralDate?: string;
  formsSent?: string;
  formsRec?: string;
  preAuthSent?: string;
  preAuthRec?: string;
  gfeSent?: string;
  gfeRec?: string;
  intakeAppt?: string;
  testAppt?: string;
  feedbackAppt?: string;
  // Financials
  copay?: number;
  intakePaid?: number;
  testingPaid?: number;
  balance?: number;
  intakePD?: number;
  testPD?: number;
  feedbackPD?: number;
  // Flag: imported without name, needs update
  needsName?: boolean;
  excelRow?: number;
  // Computed
  intakeToTestDays?: number;
  testToFeedbackDays?: number;
  intakeToFeedbackDays?: number;
  referralWeekEnding?: string;
  formsCompleted?: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface AuditLog {
  _id: string;
  entityType: 'lead' | 'patient';
  entityId: string;
  userId: string;
  userName: string;
  action: string;
  changedFields?: { field: string; oldValue?: unknown; newValue?: unknown }[];
  timestamp: string;
}

export interface Settings {
  appointmentDays: {
    intake: number;
    test: number;
    feedback: number;
    gfeLookback: number;
    outstandingLookback: number;
  };
  statusList: string[];
  insuranceList: string[];
  referralSourceList: string[];
}

export interface DashboardStats {
  totalLeads: number;
  totalPatients: number;
  activePatients: number;
  completePatients: number;
  deniedPatients: number;
  conversionRate: number;
  formsRate: number;
  avgIntakeToFeedbackDays: number | null;
  recentActivity: AuditLog[];
}

export interface ProcessMetrics {
  avgIntakeToTest: number | null;
  avgTestToFeedback: number | null;
  avgIntakeToFeedback: number | null;
  formsCompletionPct: number;
}
