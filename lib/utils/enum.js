exports.DB_Tables = Object.freeze({
  USER: "Users",
  AGENCY: "Agencies",
  TYPES: "Type",
});

exports.EUserRole = Object.freeze({
  USER: "user",
  STAFF: "staff",
  ADMIN: "admin",
  AGENCY: "agency",
  SUPERADMIN: "super_admin",
  SALE: "sale",
  MARKETING: "marketing",
});

exports.EResponseCode = Object.freeze({
  SUCCESS: 200,
  BADREQUEST: 400,
  NOTFOUND: 404,
  INVALID: 422,
  UNAUTHORIZED: 401,
  CONFLICT: 409,
  INTERNALSERVERERROR: 500,
});

exports.UserStatus = Object.freeze({
  ACTIVE: "ACTIVE",
  INACTIVE: "INACTIVE",
  SUSPENDED: "SUSPENDED",
  CLOSED: "CLOSED",
});

exports.DeleteStatus = Object.freeze({
  ACTIVE: "ACTIVE",
  SOFT_DELETE: "SOFT_DELETE",
  HARD_DELETE: "HARD_DELETE",
});

exports.AppointmentStatus = Object.freeze({
  BOOKED: "BOOKED",
  PENDING: "PENDING",
  CONFIRMED: "CONFIRMED",
  CHECKEDIN: "CHECKEDIN",
  INPROGRESS: "INPROGRESS",
  COMPLETED: "COMPLETED",
  RESCHEDULED: "RESCHEDULED",
  CANCELLED: "CANCELLED",
  NOSHOW: "NOSHOW",
  PASTDUE: "PASTDUE",
});

exports.EChatStatus = Object.freeze({
  ACTIVE: "ACTIVE",
  INACTIVE: "INACTIVE",
});
exports.EMarkupType = Object.freeze({
  percentage: "percentage",
  whole: "whole",
});
exports.EPaymentTypeStatus = Object.freeze({
  pending: "pending",
  paid: "paid",
  confirmed: "confirmed",
  declined: "declined",
  overdue: "overdue",
});
exports.ETicketStatus = Object.freeze({
  CANCELLED: "canceled",
  VOIDED: "voided",
  HOLD: "hold",
  COMFIRMED: "confirmed",
  REFUNDED: "refunded",
});
