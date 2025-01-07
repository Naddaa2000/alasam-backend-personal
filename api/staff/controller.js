const bcrypt = require("bcryptjs");
const STAFF = require("../../lib/schema/users.schema");
const Type = require("../../lib/schema/agencytypes.schema");
const Booking = require("../../lib/schema/booking.schema");
const {
  EMarkupType,
  EUserRole,
  ETicketStatus,
} = require("../../lib/utils/enum");
const Agency = require("../../lib/schema/agency.schema");
const Role = require("../../lib/schema/role.schema");
const Permission = require("../../lib/schema/permission.schema");
require("dotenv").config();
const mongoose = require("mongoose");
const { successResponse } = require("../../lib/utils/success");
const { errorResponse } = require("../../lib/utils/error");
const { isValidPassword } = require("../../lib/utils/commonFunction");
const { generateActivationToken } = require("../../lib/utils/commonFunction");
const jwt = require("jsonwebtoken");
const { sendEmail } = require("../../lib/utils/sendEmail");
const {
  verifyAccount,
} = require("../../lib/utils/emailTemplate/verifyAccount");

exports.createStaff = async (req, res) => {
  try {
    const staffData = req.body;
    console.log("body", req.body);
    const findStaff = await STAFF.findOne({ email: staffData.email });
    if (findStaff) {
      return errorResponse(
        res,
        `staff already present with email ${staffData.email}`,
        400
      );
    }
    if (!mongoose.isValidObjectId(staffData.agencyId)) {
      return errorResponse(res, "Invalid agency ID format", 400);
    }
    const findAgency = await Agency.findById(staffData.agencyId);
    if (!findAgency) {
      return errorResponse(res, "agency not found", 404);
    }
    if (findAgency.countStaff >= findAgency.addStaff) {
      return errorResponse(
        res,
        "Your limit to add Members is completed. you cannot add more members",
        400
      );
    }

    const findRole = await Role.findOne({ name: req.body.role });

    if (!findRole) {
      return errorResponse(res, "role not found", 404);
    }

    if (staffData.password) {
      if (!isValidPassword(staffData.password)) {
        return errorResponse(
          res,
          "Password must be at least 8 characters long, contain one uppercase letter, one lowercase letter, one number, and one special character.",
          400
        );
      }
    }
    if (!staffData.CNIC) {
      return errorResponse(res, "CNIC is required", 400);
    }
    if (staffData.CNIC.length !== 13) {
      return errorResponse(res, "CNIC must be 13 digits long", 400);
    }
    if (!/^\d+$/.test(staffData.CNIC)) {
      return errorResponse(res, "CNIC must contain only digits", 400);
    }

    if (!staffData.email) {
      return errorResponse(res, "Email is required", 400);
    }
    if (!staffData.phone) {
      return errorResponse(res, "phone is required", 400);
    }
    // const emailRegex = /^[\w-\.]+@gmail\.com$/;
    // if (!emailRegex.test(staffData.email)) {
    //   return errorResponse(
    //     res,
    //     "Invalid email format. Only asaam.pk and gmail.com are allowed.",
    //     400
    //   );
    // }

    const salt = await bcrypt.genSalt(10);
    staffData.password = await bcrypt.hash(staffData.password, salt);
    const newUser = new STAFF({ ...staffData, role: findRole.name });
    const savedUser = await newUser.save();
    await Agency.findByIdAndUpdate(
      findAgency._id,
      { $inc: { countStaff: 1 } },
      { new: true }
    );
    const addPermission = await Permission.create({
      ...staffData.permission,
      userId: newUser._id,
    });
    await addPermission.save();
    const token = generateActivationToken(addPermission._id); // Generate JWT token
    const resetPasswordLink = `${process.env.API_URL}/api/agency/verify/email/${token}`;
    await sendEmail(
      addPermission.email,
      "Verify You Account",
      verifyAccount(
        `${addPermission.firstName}`,
        staffData.password,
        findRole.name,
        resetPasswordLink
      )
    );
    successResponse(res, "Staff created successfully", savedUser);
  } catch (err) {
    errorResponse(res, err);
  }
};
exports.getAllStaff = async (req, res) => {
  try {
    const { id } = req.params;
    const { CNIC, email, status, firstName, page = 1, limit = 10 } = req.query;
    const filter = {};
    if (CNIC) filter.CNIC = CNIC;
    if (email) filter.email = email;
    if (firstName) filter.firstName = firstName;
    if (status) filter.status = status;
    if (!mongoose.isValidObjectId(id)) {
      return errorResponse(res, "Invalid agency ID format", 400);
    }
    const findAgency = await Agency.findById(id);

    if (!findAgency) {
      return errorResponse(res, "agency not found", 404);
    }

    const findAllStaff = await STAFF.find({
      ...filter,
      agencyId: id,
      // role: { $in: ["staff", "marketing", "sale"] },
    })
      .skip((page - 1) * limit)
      .limit(Number(limit));
    const totalStaff = await STAFF.countDocuments({
      agencyId: id,
      role: { $in: ["staff", "marketing", "sale"] },
      ...filter,
    });

    const totalPages = Math.ceil(totalStaff / limit);
    if (findAllStaff.length <= 0) {
      return errorResponse(res, "staff not found", 404);
    }

    successResponse(res, "Staff fetched successfully", {
      staff: findAllStaff,
      totalStaff: findAllStaff.length,
      totalPages,
      currentPage: Number(page),
    });
  } catch (err) {
    errorResponse(res, err);
  }
};
exports.getAllStaffAdmin = async (req, res) => {
  try {
    const { CNIC, email, firstName, status, page = 1, limit = 10 } = req.query;

    const filter = {};
    if (CNIC) filter.CNIC = CNIC;
    if (email) filter.email = email;
    if (firstName) filter.firstName = firstName;
    if (status) filter.status = status;

    const findAllStaff = await STAFF.find({
      ...filter,
      role: { $in: ["staff", "marketing", "sale"] },
    })
      .populate("agencyId", "agencyName")
      .skip((page - 1) * limit)
      .limit(Number(limit));
    console.log(findAllStaff);
    const totalStaff = await STAFF.countDocuments({
      role: { $in: ["staff", "marketing", "sale"] },
      ...filter,
    });

    const totalPages = Math.ceil(totalStaff / limit);

    if (findAllStaff.length <= 0) {
      return errorResponse(res, "staff not found", 404);
    }

    return successResponse(res, "Staff fetched successfully", {
      staff: findAllStaff,
      totalStaff,
      totalPages,
      currentPage: Number(page),
    });
  } catch (err) {
    return errorResponse(res, err);
  }
};

exports.deleteStaff = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return errorResponse(res, "Invalid staff ID format", 400);
    }
    const findAllStaff = await STAFF.findByIdAndDelete(id);

    if (!findAllStaff) {
      return errorResponse(res, "staff not found", 404);
    }

    successResponse(res, "Staff deleted successfully");
  } catch (err) {
    errorResponse(res, err);
  }
};
exports.updateStaff = async (req, res) => {
  try {
    const { id } = req.params;
    const staffData = req.body;

    if (!mongoose.isValidObjectId(id)) {
      return errorResponse(res, "Invalid staff ID format", 400);
    }

    const findRole = await Role.findOne({ name: req.body.role });
    if (!findRole) {
      return errorResponse(res, "Role not found", 404);
    }

    console.log(findRole);
    const updateStaff = await STAFF.findByIdAndUpdate(
      id,
      {
        ...staffData,
        role: findRole.name,
      },
      { new: true }
    );

    if (!updateStaff) {
      return errorResponse(res, "Staff not found", 404);
    }

    if (staffData.permission) {
      const findPermission = await Permission.findOne({ userId: id });
      if (findPermission) {
        const old = await Permission.findByIdAndUpdate(
          findPermission._id,
          staffData.permission,
          { new: true }
        );
        console.log("old", old);
      } else {
        const news = await Permission.create({
          ...staffData.permission,
          userId: id,
        });
        console.log("news", news);
      }
    }

    successResponse(
      res,
      "Staff and permissions updated successfully",
      updateStaff
    );
  } catch (err) {
    return errorResponse(res, err);
  }
};

exports.findStaffById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return errorResponse(res, "Invalid staff ID format", 400);
    }
    const findStaff = await STAFF.findById(id);

    if (!findStaff) {
      return errorResponse(res, "staff not found", 404);
    }

    return successResponse(res, "Staff fetched successfully", findStaff);
  } catch (err) {
    errorResponse(res, err);
  }
};

exports.updateStaffStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body; // Expected to be one of 'ACTIVE', 'INACTIVE', etc.

    // Validate the status
    const validStatuses = ["ACTIVE", "INACTIVE", "SUSPENDED", "CLOSED"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: "Invalid status provided" });
    }

    // Find user and update status
    const updatedUser = await STAFF.findByIdAndUpdate(
      id,
      { status },
      { new: true, runValidators: true }
    );

    if (!updatedUser) {
      return res.status(404).json({ message: "Staff not found" });
    }

    // Send success response
    return successResponse(
      res,
      "Staff status updated successfully",
      updatedUser
    );
  } catch (err) {
    // Handle and return errors
    console.error("Error updating staff status:", err);
    return errorResponse(res, err);
  }
};
exports.getUsersSales = async (req, res) => {
  try {
    const userId = req.user._id;
    const user = await STAFF.findById(userId);
    if (req.user.role === EUserRole.SUPERADMIN) {
      const agencies = await Agency.find();

      // Prepare the result for all agencies
      const userStats = await Promise.all(
        agencies.map(async (agency) => {
          // Fetch bookings for the current agency
          const bookings = await Booking.find({ agencyId: agency._id });

          // Aggregate data for this agency
          const stats = bookings.reduce(
            (acc, booking) => {
              acc.totalCommission += booking.commission || 0;
              acc.totalEarnings += booking.finalPrice || 0;

              // Count ticket statuses
              switch (booking.status) {
                case "hold":
                  acc.hold += 1;
                  break;
                case "confirmed":
                  acc.confirmed += 1;
                  break;
                case "refunded":
                  acc.refunded += 1;
                  break;
                case "voided":
                  acc.void += 1;
                  break;
                case "canceled":
                  acc.cancelled += 1;
                  break;
                default:
                  break;
              }

              return acc;
            },
            {
              totalCommission: 0,
              totalEarnings: 0,
              hold: 0,
              confirmed: 0,
              refunded: 0,
              void: 0,
              cancelled: 0,
            }
          );

          // Return stats for this agency
          return {
            agencyId: agency._id,
            name: agency.agencyName,
            email: agency.agencyEmail,
            role: "agency",
            totalCommission: stats.totalCommission,
            totalEarnings: stats.totalEarnings,
            tickets: {
              hold: stats.hold,
              confirmed: stats.confirmed,
              refunded: stats.refunded,
              void: stats.void,
              cancelled: stats.cancelled,
            },
          };
        })
      );

      // Calculate overall totals across all agencies
      const totalStats = userStats.reduce(
        (acc, agency) => {
          acc.totalCommission += agency.totalCommission;
          acc.totalEarnings += agency.totalEarnings;

          acc.ticketStatusCounts.hold += agency.tickets.hold;
          acc.ticketStatusCounts.confirmed += agency.tickets.confirmed;
          acc.ticketStatusCounts.refunded += agency.tickets.refunded;
          acc.ticketStatusCounts.void += agency.tickets.void;
          acc.ticketStatusCounts.cancelled += agency.tickets.cancelled;

          return acc;
        },
        {
          totalCommission: 0,
          totalEarnings: 0,
          ticketStatusCounts: {
            hold: 0,
            confirmed: 0,
            refunded: 0,
            void: 0,
            cancelled: 0,
          },
        }
      );
      const users = await Agency.findOne({ _id: req.user.agencyId });
      console.log("asdfgh", users);

      // Respond with the overall stats and per-agency breakdown
      return successResponse(res, "Agencies sales data fetched successfully", {
        agencyId: req.user.agencyId,
        agencyName: users.agencyName,
        logo: users?.logo ? users.logo : null,
        totalStats,
        userStats,
      });
    }
    if (req.user.role === EUserRole.SALE) {
      // Fetch bookings for the salesperson
      const bookings = await Booking.find({ userId }).populate(
        "agencyId",
        "agencyName"
      );

      const stats = bookings.reduce(
        (acc, booking) => {
          acc.totalCommission += booking.commission || 0;
          acc.totalEarnings += booking.finalPrice || 0;
          // Increment ticket status counts for each booking
          acc.ticketStatusCounts[booking.status] =
            (acc.ticketStatusCounts[booking.status] || 0) + 1;

          return acc;
        },
        {
          totalCommission: 0,
          totalEarnings: 0,
          ticketStatusCounts: {
            hold: 0,
            confirmed: 0,
            refunded: 0,
            void: 0,
            canceled: 0,
          },
        }
      );

      const agency = await Agency.findOne({ _id: req.user.agencyId });
      console.log(req.user);
      // Return the response for salesperson with requested structure
      return successResponse(res, "Salesperson data fetched successfully", {
        agencyId: req.user.agencyId,
        agencyName: agency.agencyName,
        totalStats: {
          totalCommission: stats.totalCommission,
          totalEarnings: stats.totalEarnings,
          ticketStatusCounts: stats.ticketStatusCounts,
        },
        userStats: {
          name: req.user.firstName,
          email: req.user.email,
          role: req.user.role,
          totalCommission: stats.totalCommission,
          totalEarnings: stats.totalEarnings,
          tickets: stats.ticketStatusCounts,
        },
      });
    }
    if (req.user.role === EUserRole.AGENCY) {
      if (!user) {
        return errorResponse(res, "User not found", 404);
      }

      const agencyId = user.agencyId;

      if (!agencyId) {
        return errorResponse(res, "User does not belong to any agency", 400);
      }

      // Fetch all bookings for the agency
      const bookings = await Booking.find({ agencyId }).populate(
        "userId",
        "firstName lastName email role"
      );

      // Aggregate data
      const stats = bookings.reduce(
        (acc, booking) => {
          acc.totalCommission += booking.commission || 0;
          acc.totalEarnings += booking.finalPrice || 0;

          // Count ticket statuses
          switch (booking.status) {
            case "hold":
              acc.hold += 1;
              break;
            case "confirmed":
              acc.confirmed += 1;
              break;
            case "refunded":
              acc.refunded += 1;
              break;
            case "voided":
              acc.void += 1;
              break;
            case "canceled":
              acc.cancelled += 1;
              break;
            default:
              break;
          }

          // Group booking details by user
          const userId = booking.userId._id;
          if (!acc.users[userId]) {
            const firstName = booking.userId.firstName;
            // const lastName = booking.userId.lastName;
            acc.users[userId] = {
              name: `${firstName}`,
              email: booking.userId.email,
              role: booking.userId.role,
              totalCommission: 0,
              totalEarnings: 0,
              tickets: {
                hold: 0,
                confirmed: 0,
                refunded: 0,
                void: 0,
                cancelled: 0,
              },
            };
          }

          acc.users[userId].totalCommission += booking.commission || 0;
          acc.users[userId].totalEarnings += booking.finalPrice || 0;

          // Increment the ticket status counts for this user
          if (booking.status in acc.users[userId].tickets) {
            acc.users[userId].tickets[booking.status] += 1;
          }

          return acc;
        },
        {
          totalCommission: 0,
          totalEarnings: 0,
          hold: 0,
          confirmed: 0,
          refunded: 0,
          void: 0,
          cancelled: 0,
          users: {},
        }
      );

      // Calculate the total stats across all agencies
      const totalStats = {
        totalCommission: stats.totalCommission,
        totalEarnings: stats.totalEarnings,
        ticketStatusCounts: {
          hold: stats.hold,
          confirmed: stats.confirmed,
          refunded: stats.refunded,
          void: stats.void,
          cancelled: stats.cancelled,
        },
      };
      const users = await Agency.findOne({ _id: req.user.agencyId });
      // Return the total and agency-specific statistics
      return successResponse(res, "Sales fetched successfully", {
        agencyId,
        agencyName: users.agencyName,
        logo: users?.logo ? users?.logo : null,
        totalStats,
        userStats: Object.values(stats.users),
      });
    }
    return errorResponse(res, "Unauthorized access", 403);
  } catch (error) {
    return errorResponse(res, error);
  }
};
exports.getSaleGraph = async (req, res) => {
  try {
    const { id } = req.user; // Get the user ID
    const { filter } = req.query; // Time range: 'thisWeek', 'thisMonth', 'thisYear', 'last5Years'

    // Helper function to calculate date ranges
    const getDateRange = (filter) => {
      const now = new Date();
      let startDate, endDate, date;

      switch (filter) {
        case "thisWeek":
          startDate = new Date(now.setDate(now.getDate() - now.getDay())); // Start of this week (Sunday)
          startDate.setHours(0, 0, 0, 0);
          endDate = new Date(startDate);
          endDate.setDate(startDate.getDate() + 7); // End of this week (Saturday)
          endDate.setHours(23, 59, 59, 999);
          date = "This Week";
          break;
        case "thisMonth":
          startDate = new Date(now.getFullYear(), now.getMonth(), 1); // Start of this month
          endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0); // End of this month
          endDate.setHours(23, 59, 59, 999);
          date = "This Month";
          break;
        case "thisYear":
          startDate = new Date(now.getFullYear(), 0, 1); // Start of this year
          endDate = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999); // End of this year
          date = "This Year";
          break;
        case "last5Years":
          startDate = new Date(now.setFullYear(now.getFullYear() - 5)); // 5 years ago
          endDate = new Date();
          date = "Last 5 Years";
          break;
        default:
          throw new Error("Invalid filter provided");
      }

      return { startDate, endDate, date: date };
    };

    // Get the start and end dates based on the filter
    const { startDate, endDate, date } = getDateRange(filter);

    // Statuses to calculate stats for
    const statuses = ["confirmed"];
    const statsByStatus = [];

    // Fetch and aggregate stats for each status
    for (const status of statuses) {
      const bookings = await Booking.find({
        userId: id, // Fetch bookings for the current user
        status,
        createdAt: {
          $gte: startDate,
          $lt: endDate,
        },
      });

      // Prepare the data based on the filter
      switch (filter) {
        case "thisWeek":
          // Get data for each day of the week (Sun-Sat)
          const daysOfWeek = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
          daysOfWeek.forEach((day, index) => {
            const dayStart = new Date(startDate);
            dayStart.setDate(startDate.getDate() + index);
            const dayEnd = new Date(dayStart);
            dayEnd.setHours(23, 59, 59, 999);

            const daySales = bookings
              .filter(
                (booking) =>
                  booking.createdAt >= dayStart && booking.createdAt <= dayEnd
              )
              .reduce(
                (acc, booking) => {
                  acc.totalCommission += booking.commission || 0;
                  acc.totalEarnings += booking.finalPrice || 0;
                  return acc;
                },
                { totalCommission: 0, totalEarnings: 0 }
              );

            statsByStatus.push({
              date: day,
              commission: daySales.totalCommission,
              sales: daySales.totalEarnings,
            });
          });
          break;
        case "thisMonth":
          // Get data for each day of the current month
          const daysInMonth = new Date(
            startDate.getFullYear(),
            startDate.getMonth() + 1,
            0
          ).getDate();
          for (let i = 1; i <= daysInMonth; i++) {
            const dayStart = new Date(
              startDate.getFullYear(),
              startDate.getMonth(),
              i
            );
            const dayEnd = new Date(dayStart);
            dayEnd.setHours(23, 59, 59, 999);

            const daySales = bookings
              .filter(
                (booking) =>
                  booking.createdAt >= dayStart && booking.createdAt <= dayEnd
              )
              .reduce(
                (acc, booking) => {
                  acc.totalCommission += booking.commission || 0;
                  acc.totalEarnings += booking.finalPrice || 0;
                  return acc;
                },
                { totalCommission: 0, totalEarnings: 0 }
              );

            statsByStatus.push({
              date: i, // Day of the month
              commission: daySales.totalCommission,
              sales: daySales.totalEarnings,
            });
          }
          break;
        case "thisYear":
          // Get data for each month of the year
          const monthsOfYear = [
            "Jan",
            "Feb",
            "Mar",
            "Apr",
            "May",
            "Jun",
            "Jul",
            "Aug",
            "Sep",
            "Oct",
            "Nov",
            "Dec",
          ];
          for (let i = 0; i < 12; i++) {
            const monthStart = new Date(startDate.getFullYear(), i, 1);
            const monthEnd = new Date(
              startDate.getFullYear(),
              i + 1,
              0,
              23,
              59,
              59,
              999
            );

            const monthSales = bookings
              .filter(
                (booking) =>
                  booking.createdAt >= monthStart &&
                  booking.createdAt <= monthEnd
              )
              .reduce(
                (acc, booking) => {
                  acc.totalCommission += booking.commission || 0;
                  acc.totalEarnings += booking.finalPrice || 0;
                  return acc;
                },
                { totalCommission: 0, totalEarnings: 0 }
              );

            statsByStatus.push({
              date: monthsOfYear[i],
              commission: monthSales.totalCommission,
              sales: monthSales.totalEarnings,
            });
          }
          break;
        case "last5Years":
          // Get data for each year in the last 5 years
          const currentYear = new Date().getFullYear();
          for (let i = 0; i < 5; i++) {
            const yearStart = new Date(currentYear - i, 0, 1); // Start of the year
            const yearEnd = new Date(currentYear - i, 11, 31, 23, 59, 59, 999); // End of the year

            const yearSales = bookings
              .filter(
                (booking) =>
                  booking.createdAt >= yearStart && booking.createdAt <= yearEnd
              )
              .reduce(
                (acc, booking) => {
                  acc.totalCommission += booking.commission || 0;
                  acc.totalEarnings += booking.finalPrice || 0;
                  return acc;
                },
                { totalCommission: 0, totalEarnings: 0 }
              );

            statsByStatus.push({
              date: yearStart.getFullYear(), // Year label
              commission: yearSales.totalCommission,
              sales: yearSales.totalEarnings,
            });
          }
          break;
      }
    }

    // Return the aggregated stats with the label for the selected filter
    return successResponse(res, `Sales data fetched successfully for ${date}`, {
      statsByStatus,
    });
  } catch (err) {
    console.error("Error in getSaleGraph:", err);
    return errorResponse(res, "Internal server error", 500);
  }
};
exports.getBooking = async (req, res) => {
  try {
    console.log(req.user);
    const { _id } = req.user;
    const findBooking = await Booking.find({ userId: _id });
    if (findBooking.length <= 0) {
      return errorResponse(res, "No booking found", 404);
    }
    return successResponse(res, "Booking found", findBooking);
  } catch (error) {
    console.error("Error in getBooking:", error);
    return errorResponse(res, error);
  }
};
