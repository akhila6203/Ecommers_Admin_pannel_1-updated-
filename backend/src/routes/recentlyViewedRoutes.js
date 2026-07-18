const express = require("express");

const {
  recordRecentlyViewed,
  getRecentlyViewed,
  clearRecentlyViewed,
} = require(
  "../controllers/recentlyViewedController"
);

const {
  optionalCustomerAuth,
} = require("../middleware/customerAuthMiddleware");

const router = express.Router();

/*
 * storeMiddleware server level lo already apply ayithe
 * ikkada malli add cheyyalsina avasaram ledu.
 */

router.use(optionalCustomerAuth);

router.get(
  "/",
  getRecentlyViewed
);

router.post(
  "/",
  recordRecentlyViewed
);

router.delete(
  "/",
  clearRecentlyViewed
);

module.exports = router;