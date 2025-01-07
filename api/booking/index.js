const express = require("express");
const router = express.Router();
const controller = require("./controller");
const checkRole = require("../../lib/middleware/permission");

router
  .route("/getAll")
  .get(
    checkRole(["super_admin", "staff", "marketing", "agency", "sale"]),
    controller.getAllBookings
  );
router.route("/create").post(controller.createBooking);

router.route("/search").post(controller.searchBookings);
router.route("/sale").get(controller.calculateSalesAndEarnings);

router.route("/getById/:id").get(controller.getBookingById);
router.route("/update/:id").put(controller.updateBooking);
router.route("/cancel/:id").delete(controller.cancelBooking);

module.exports = router;
