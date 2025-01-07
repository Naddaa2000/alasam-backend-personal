const Booking = require("../../lib/schema/booking.schema");
const moment = require("moment");
const { EUserRole } = require("../../lib/utils/enum");
const { successResponse } = require("../../lib/utils/success");
const { errorResponse } = require("../../lib/utils/error");
// Create a new booking
exports.createBooking = async (req, res) => {
  try {
    const newBooking = new Booking(req.body);
    const savedBooking = await newBooking.save();
    res.status(201).json(savedBooking);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// Get all bookings
exports.getAllBookings = async (req, res) => {
  try {
    let allBookings;
    const role = req.user.role;
    if (role === EUserRole.SUPERADMIN) {
      console.log("super admin");
      allBookings = await Booking.find().sort({ createdAt: -1 });
    } else if (role === EUserRole.AGENCY) {
      // console.log("agency", req.user.agencyId);

      allBookings = await Booking.find({
        agencyId: req.user.agencyId,
      })
        .sort({ createdAt: -1 })
        .populate(
          "agencyId",
          "agencyEmail address agencyName logo phoneNumber"
        );
    } else if (
      role === EUserRole.MARKETING ||
      role === EUserRole.STAFF ||
      role === EUserRole.SALE
    ) {
      console.log("staff");

      allBookings = await Booking.find({ userId: req.user._id });
    }
    if (allBookings.length <= 0) {
      return errorResponse(res, "bookings not found", 404);
    }
    return successResponse(res, "bookings fetched successfully", allBookings);
  } catch (err) {
    return errorResponse(res, err);
  }
};

exports.searchBookings = async (req, res) => {
  try {
    const { pnr, passengerName, email, mobile, fromDate, toDate, reference } =
      req.body;

    // Check if any query parameters are provided
    if (
      !pnr &&
      !passengerName &&
      !email &&
      !mobile &&
      !fromDate &&
      !toDate &&
      !reference
    ) {
      return res
        .status(400)
        .json({ message: "At least one query parameter is required" });
    }

    // Define search criteria based on provided parameters
    const searchCriteria = {};
    if (pnr) searchCriteria.id = pnr;
    if (passengerName)
      searchCriteria["contacts.addresseeName.firstName"] = new RegExp(
        passengerName,
        "i"
      );
    if (email)
      searchCriteria["travelers.contact.emailAddress"] = new RegExp(email, "i");
    if (mobile) searchCriteria["contacts.phones.number"] = mobile;
    if (fromDate && toDate) {
      searchCriteria["associatedRecords.creationDate"] = {
        $gte: moment(fromDate).startOf("day").toDate(),
        $lte: moment(toDate).endOf("day").toDate(),
      };
    }
    if (reference) searchCriteria["associatedRecords.reference"] = reference;

    // Query the database with the search criteria
    const bookings = await Booking.find(searchCriteria);

    res.json(bookings);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server Error" });
  }
};

exports.calculateSalesAndEarnings = async (req, res) => {
  try {
    // Fetch all bookings from the database
    const allBookings = await Booking.find();

    let totalBookings = allBookings.length;
    let totalSales = 0;

    allBookings.forEach((booking) => {
      booking.flightOffers.forEach((flightOffer) => {
        totalSales += parseFloat(flightOffer.price.grandTotal);
      });
    });

    let totalEarnings = totalSales * 0.1; // 10% earnings

    totalSales = totalSales.toFixed(2);
    totalEarnings = totalEarnings.toFixed(2);

    res.status(200).json({
      totalBookings: totalBookings,
      totalSales: totalSales,
      totalEarnings: totalEarnings,
    });
  } catch (error) {
    console.error("Error fetching bookings:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

exports.getBookingById = async (req, res) => {
  try {
    const bookingId = req.params.id;
    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }
    res.status(200).json(booking);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getUserBookings = async (req, res) => {
  try {
    const userId = req.params.userId;
    const userBookings = await Booking.find({ userId: userId });
    res.status(200).json(userBookings);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Cancel a booking
exports.cancelBooking = async (req, res) => {
  try {
    const bookingId = req.params.bookingId;
    const cancelledBooking = await Booking.findByIdAndDelete(bookingId);
    if (!cancelledBooking) {
      return res.status(404).json({ message: "Booking not found" });
    }
    res.status(200).json({ message: "Booking cancelled successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Update a booking
exports.updateBooking = async (req, res) => {
  try {
    const bookingId = req.params.bookingId;
    const { status, paymentStatus } = req.body;
    const updatedBooking = await Booking.findByIdAndUpdate(
      bookingId,
      { status, paymentStatus },
      { new: true }
    );
    if (!updatedBooking) {
      return res.status(404).json({ message: "Booking not found" });
    }
    res.status(200).json(updatedBooking);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};
