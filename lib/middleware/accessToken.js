const jwt = require("jsonwebtoken");
const tokenValidation = (req, res, next) => {
  const token = req.headers["authorization"]?.split(" ")[1];

  if (!token) {
    return res.status(401).send("Access denied. No token provided.");
  }

  jwt.verify(token, process.env.TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send("Invalid token.");
    }
    req.user = decoded;
    next();
  });
};

module.exports = tokenValidation;
