const express = require("express");
const router = express.Router();
const controller = require("./controller");
const checkRole = require("../../lib/middleware/permission");

router.post(
  "/create",
  checkRole(["super_admin", "agency"]),
  controller.createMarkup
);
router.get(
  "/getAll",
  checkRole(["super_admin", "staff", "marketing", "agency", "sale"]),
  controller.getAllMarkups
);
router.get(
  "/getAllActiveMarkups",
  checkRole(["super_admin", "staff", "marketing", "agency", "sale"]),
  controller.getAllActiveMarkups
);
router.get(
  "/getById/:id",
  checkRole(["super_admin", "staff", "marketing", "agency", "sale"]),
  controller.getMarkupById
);
router.patch(
  "/update/:id",
  checkRole(["super_admin", "agency"]),
  controller.updateMarkup
);
router.delete(
  "/delete/:id",
  checkRole(["super_admin", "agency"]),
  controller.deleteMarkup
);
router.patch(
  "/status/:id",
  checkRole(["super_admin", "agency"]),
  controller.updateMarkupStatus
);

module.exports = router;
