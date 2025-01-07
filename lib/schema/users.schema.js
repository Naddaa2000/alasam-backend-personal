const mongoose = require("mongoose");
const { Schema } = mongoose;
const {
  EUserRole,
  UserStatus,
  DeleteStatus,
  DB_Tables,
} = require("../../lib/utils/enum");
function getMidnightDate() {
  const now = new Date();
  return new Date(now.setHours(0, 0, 0, 0)); // Set time to 00:00:00.000
}
const UserSchema = new Schema(
  {
    firstName: { type: String, required: true },
    lastName: { type: String },
    email: {
      type: String,
      required: true,
      trim: true,
      unique: true,
      lowercase: true,
    },
    otp: {
      code: String,
      expiresAt: Date,
      count: { type: Number, default: 0 },
      availableAt: { type: Date, default: () => getMidnightDate() },
    },
    otpAttempts: {
      count: { type: Number, default: 0 },
      availableAt: { type: Date },
    },
    password: {
      type: String,
      required: function () {
        return !(this.isGoogleAuth || this.isFacebookAuth || this.isGitHubAuth);
      },
    },
    forgotPasswordAttempts: { type: Number, default: 0 },
    forgotPasswordCooldown: { type: Date, default: null },
    isGoogleAuth: { type: Boolean, default: false },
    phone: { type: String },
    status: { type: String, default: UserStatus.INACTIVE, enum: [UserStatus] },
    role: { type: String },
    CNIC: { type: String },

    emailVerified: { type: Boolean, default: false },
    address: {
      street: String,
      city: String,
      state: String,
      zip: String,
      country: String,
    },
    bio: { type: String },
    profileImg: { type: String },
    thumbnail: { type: String },
    lastLogin: { type: Date },
    socialLinks: [
      {
        platform: { type: String, required: true },
        url: { type: String, required: true },
      },
    ],
    agencyId: { type: mongoose.Types.ObjectId, ref: DB_Tables.AGENCY },
    createdBy: { type: mongoose.Types.ObjectId, ref: DB_Tables.USER },
    updatedBy: { type: mongoose.Types.ObjectId, ref: DB_Tables.USER },
    deletedBy: { type: mongoose.Types.ObjectId, ref: DB_Tables.USER },
    isDeleted: {
      type: String,
      default: DeleteStatus.ACTIVE,
      enum: [DeleteStatus],
    },

    creditInformation: {
      creditCardNumber: { type: String },
      expirationDate: { type: Date },
      cvv: { type: String },
    },
    balance: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Users", UserSchema);
