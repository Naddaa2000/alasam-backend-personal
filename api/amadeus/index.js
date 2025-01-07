const express = require("express");
const router = express.Router();
const flightController = require("./Controller");
const checkRole = require("../../lib/middleware/permission");

router
  .route("/flightData")
  .get(
    checkRole(["super_admin", "staff", "marketing", "agency", "sale"]),
    flightController.getFlightData
  );
router
  .route("/reValidate")
  .post(
    checkRole(["super_admin", "staff", "marketing", "agency", "sale"]),
    flightController.reValidate
  );
router
  .route("/multiFlightData")
  .post(
    checkRole(["super_admin", "staff", "marketing", "agency", "sale"]),
    flightController.getFlightDataMultiCity
  );
router.route("/cityData").get(flightController.getCityData);
router
  .route("/createBooking")
  .post(
    checkRole(["super_admin", "staff", "marketing", "agency", "sale"]),
    flightController.createBooking
  );
router.route("/deleteBooking").delete(
  // checkRole(["super_admin", "staff", "marketing", "agency", "sale"]),
  flightController.deleteBooking
);
router.route("/flightRules").post(flightController.getFlightRules);
router.route("/upselling").post(flightController.upsellingFares);
router.route("/airlineData").get(flightController.flightNameByAirlineCode);
router
  .route("/getFlightSalesData")
  .get(
    checkRole(["super_admin", "staff", "marketing", "agency", "sale"]),
    flightController.getFlightSalesData
  );
router
  .route("/agencySaleData")
  .get(
    checkRole(["super_admin", "staff", "marketing", "agency", "sale"]),
    flightController.agencySaleData
  );
router
  .route("/data")
  .get(
    checkRole(["super_admin", "staff", "marketing", "agency", "sale"]),
    flightController.data
  );
router
  .route("/getSaleReport")
  .get(checkRole(["super_admin", "agency"]), flightController.getSaleReport);
router
  .route("/issueTicket")
  .post(checkRole(["super_admin", "agency"]), flightController.issueTicket);
router
  .route("/CancelBooking")
  .post(checkRole(["super_admin", "agency"]), flightController.issueTicket);
router
  .route("/sale")
  .get(checkRole(["super_admin", "agency"]), flightController.sale);
router
  .route("/filterSale")
  .get(checkRole(["super_admin", "agency"]), flightController.filterSale);
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
router.route("/viewItinary").post(
  // checkRole(["super_admin", "staff", "marketing", "agency", "sale"]),
  flightController.viewItinary
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
  .route("/addDb")
  .post(
    checkRole(["super_admin", "staff", "marketing", "agency", "sale"]),
    flightController.addDb
  );
//  router.route('/search').post(controller.searchBookings);
//  router.route('/sale').get(controller.calculateSalesAndEarnings);

// router
//   .route('/:id')
//   .get(controller.getBookingById)
//   .put(controller.updateBooking)
//   .delete(controller.cancelBooking);

module.exports = router;
