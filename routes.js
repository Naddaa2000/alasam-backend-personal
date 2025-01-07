"use strict";
const authRouter = require("./lib/utils/passport");
const User = require("./lib/schema/users.schema");

const { sendResponse, errReturned } = require("./lib/utils/dto");
const { EResponseCode } = require("./lib/utils/enum");

const { HOST, PORT, SESS_SECRET, CLIENT_PORT } = require("./config/config");

const checkRole = require("./lib/middleware/permission");
const tokenValidation = require("./lib/middleware/accessToken"); // Import the token validation middleware

module.exports = (app) => {
  app.use("/api/auth", require("./api/authentication"));
  // app.use(tokenValidation);

  app.use("/api/users", require("./api/users"));
  // app.use('/api/auth/google', authRouter);
  app.use("/api/booking", require("./api/booking"));
  app.use("/api/agency", require("./api/agency"));
  // app.use("/api/roles", checkRole("admin"), require("./api/roles"));
  app.use("/api/roles", require("./api/roles"));
  app.use("/api/staff", require("./api/staff"));
  app.use("/api/flights", require("./api/amadeus"));
  app.use("/api/type", require("./api/type"));
  app.use("/api/sabre", require("./api/sabre"));
  app.use("/api/permission", require("./api/permission"));
  app.use("/api/markup", require("./api/markup"));
  app.use("/api/airlineMarkup", require("./api/airlineMarkup"));
  app.use("/api/payment", require("./api/payment"));
  app.use("/api/promotion", require("./api/promotion"));
  app.use("/api/notification", require("./api/notification"));
  app.use("/api/paymentType", require("./api/paymentType"));
};
