const express = require("express");
const router = express.Router();
const flightController = require("./controller");
const checkRole = require("../../lib/middleware/permission");

router
  .route("/flightData")
  .get(
    checkRole(["super_admin", "staff", "marketing", "agency", "sale"]),
    flightController.postSabreFlightData
  );
router
  .route("/revalidate")
  .post(
    checkRole(["super_admin", "staff", "marketing", "agency", "sale"]),
    flightController.revalidateItinerary
  );
router
  .route("/revalidate")
  .post(
    checkRole(["super_admin", "staff", "marketing", "agency", "sale"]),
    flightController.revalidateItinerary
  );
router
  .route("/flightData/multipleCity")
  .post(flightController.postSabreFlightDataM);

router.route("/sabreCityData").get(flightController.postSabreCityData);
router
  .route("/createBooking")
  .post(
    checkRole(["super_admin", "staff", "marketing", "agency", "sale"]),
    flightController.createBooking
  );
router
  .route("/createBookingM")
  .post(
    checkRole(["super_admin", "staff", "marketing", "agency", "sale"]),
    flightController.createBookingM
  );
router
  .route("/issueTicket")
  .post(
    checkRole(["super_admin", "staff", "marketing", "agency", "sale"]),
    flightController.issueTicket
  );
router
  .route("/repriceOrder")
  .post(
    checkRole(["super_admin", "staff", "marketing", "agency", "sale"]),
    flightController.repriceOrder
  );
router
  .route("/cancelBooking")
  .put(
    checkRole(["super_admin", "staff", "marketing", "agency", "sale"]),
    flightController.deleteBooking
  );
router
  .route("/brandedFare")
  .post(
    checkRole(["super_admin", "staff", "marketing", "agency", "sale"]),
    flightController.brandedFares
  );

router
  .route("/voidFlightTickets")
  .post(
    checkRole(["super_admin", "staff", "marketing", "agency", "sale"]),
    flightController.voidFlightTickets
  );

router
  .route("/refundFlightTickets")
  .post(
    checkRole(["super_admin", "staff", "marketing", "agency", "sale"]),
    flightController.refundFlightTickets
  );
router
  .route("/checkFlightTickets/:bookingId")
  .post(
    checkRole(["super_admin", "staff", "marketing", "agency", "sale"]),
    flightController.checkFlightTickets
  );
router
  .route("/viewItinary")
  .post(
    checkRole(["super_admin", "staff", "marketing", "agency", "sale"]),
    flightController.viewItinary
  );
router
  .route("/comparePNR")
  .post(
    checkRole(["super_admin", "staff", "marketing", "agency", "sale"]),
    flightController.updatePNR
  );
router
  .route("/updateStatus")
  .post(
    checkRole(["super_admin", "staff", "marketing", "agency", "sale"]),
    flightController.updateStatus
  );
router
  .route("/importPNR")
  .post(
    checkRole(["super_admin", "staff", "marketing", "agency", "sale"]),
    flightController.importPNR
  );
router
  .route("/modifyPNR")
  .post(
    checkRole(["super_admin", "staff", "marketing", "agency", "sale"]),
    flightController.modifyPNR
  );
router
  .route("/modifyPNR")
  .post(
    checkRole(["super_admin", "staff", "marketing", "agency", "sale"]),
    flightController.modifyPNR
  );

module.exports = router;
