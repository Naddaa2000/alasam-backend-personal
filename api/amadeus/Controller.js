const amadeusService = require("./amadeusService");
const logger = require("../../lib/utils/logger");
const mongoose = require("mongoose");
const axios = require("axios");
const airlineLogo = require("../airlineLogo/airlineLogo");
const { v4 } = require("uuid");

// const agencyImage = "/uploads/user/group-svgrepo-com.png";
// const bookingImage = "/uploads/user/booking-booking-svgrepo-com.png";
// const revenueImage = "/uploads/user/currency-revenue-solid-svgrepo-com.png";
// const cashImage = "/uploads/user/cash-svgrepo-com.png";
// const staffImage = "/uploads/user/staff-symbol-svgrepo-com.png";
// const staffBookingImage =
//   "/uploads/user/air-booking-ticket-tickets-tourism-transportation-svgrepo-com.png";
// const staffRevenueImage = "/uploads/user/sales-amount-svgrepo-com.png";
// const staffCashImage = "/uploads/user/cash-payment-solid-svgrepo-com.png";
const staffImage =
  "https://www.svgrepo.com/show/493012/hotel-staff-bowing-upper-body.svg";
const staffBookingImage =
  "https://www.svgrepo.com/show/429351/booking-destination-internet.svg";
const staffRevenueImage =
  "https://www.svgrepo.com/show/448118/sales-amount.svg";
const staffCashImage = "https://www.svgrepo.com/show/300811/cash-bill.svg";
const {
  EMarkupType,
  EUserRole,
  ETicketStatus,
} = require("../../lib/utils/enum");
const { successResponse } = require("../../lib/utils/success");
const { errorResponse } = require("../../lib/utils/error");
const Agency = require("../../lib/schema/agency.schema");
const User = require("../../lib/schema/users.schema");
const Markup = require("../../lib/schema/markup.schema");
const Promotion = require("../../lib/schema/promotion.schema");
const Booking = require("../../lib/schema/booking.schema");
const { AMADEUS } = require("../../config/config");
let accessToken = null;
let tokenExpiryTime = 0;
const moment = require("moment");
const { uniqueId } = require("lodash");
let AmaClientRef = "";
let dateHeader = null;
const multycityFlights = async (
  data,
  findPromotion,
  findMakrup,
  staffMarkupValue,
  staffMarkupType,
  airlineLogoMap,
  adultsCount,
  childrenCount,
  infantsCount
) => {};

async function getToken() {
  try {
    const AQCUser = AMADEUS.Company_Code;
    const timestamp = new Date().toJSON();
    AmaClientRef = `${AQCUser}-${timestamp}`;

    // Generate date header in the desired format
    dateHeader = new Date().toUTCString();

    // Prepare request body
    const requestBody = new URLSearchParams({
      client_id: AMADEUS.CLIENT_ID,
      client_secret: AMADEUS.CLIENT_SECRET,
      grant_type: "client_credentials",
    });

    // Make the API call
    const response = await fetch(AMADEUS.TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "ama-client-ref": AmaClientRef,
        date: dateHeader,
      },
      body: requestBody,
    });

    // Handle response
    if (!response.ok) {
      throw new Error("Failed to fetch access token");
    }

    const tokenData = await response.json();
    const expiresIn = tokenData.expires_in; // Token expiration time in seconds
    accessToken = tokenData.access_token;

    console.log("accessToken:", accessToken);

    // Calculate token expiry time
    tokenExpiryTime = Date.now() + (expiresIn - 100) * 1000;

    // Automatically refresh the token close to expiry
    setTimeout(getToken, (expiresIn - 100) * 1000);
  } catch (error) {
    console.error(`Error in getToken: ${error}`);
  }
}

async function ensureToken() {
  // Check if token needs to be refreshed
  if (!accessToken || Date.now() >= tokenExpiryTime) {
    console.log("Fetching a new token...");
    await getToken();
  } else {
    console.log("Using existing token:", accessToken);
  }
}

async function getFlightData(req, res) {
  await ensureToken();
  const currentDate = new Date();

  const findMakrup = await Markup.findOne({
    api: { $in: ["amadus", "all"] },
    status: "ACTIVE",
  });
  const findPromotion = await Promotion.findOne({
    api: "amadus",
    status: "ACTIVE",
    startDate: { $lte: currentDate },
    endDate: { $gte: currentDate },
  });
  let lable = null;
  const findagency = await Agency.findById(req.user.agencyId);
  if (findagency) {
    lable = findagency.showLabel;
  }
  let airlineLogoMap = {};
  try {
    airlineLogo.forEach(({ arCode, logo, ar }) => {
      airlineLogoMap[arCode] = { ar, logo };
    });
  } catch (error) {
    console.error("Error processing airline logo data:", error);
  }
  try {
    const {
      start_date,
      end_date,
      adult,
      children,
      infants,
      dept,
      arrival,
      excludedAirlineCodes,
      includedAirlineCodes,
      travelClass,
      currencyCode,
      nonStop,
      maxPrice,
      max,
      staffMarkupValue,
      staffMarkupType,
    } = req.query;
    const id = req.user.agencyId;
    const findAgency = await Agency.findById(id);

    let body = {
      currencyCode: `${AMADEUS.CURRENCY}`,
      originDestinations: [
        {
          id: "1",
          originLocationCode: `${dept}`,
          destinationLocationCode: `${arrival}`,
          departureDateTimeRange: {
            date: `${start_date}`,
          },
        },
      ],
      travelers: [],
      sources: ["GDS"],
      searchCriteria: {
        maxUpsellOffers: 6,

        pricingOptions: {
          includedCheckedBagsOnly: true,
        },
        additionalInformation: {
          chargeableCheckedBags: true,
          brandedFares: true,
        },
      },
    };
    if (end_date) {
      body.originDestinations.push({
        id: "2",
        originLocationCode: `${arrival}`,
        destinationLocationCode: `${dept}`,
        departureDateTimeRange: {
          date: `${end_date}`,
        },
      });
    }
    if (adult) {
      for (let i = 1; i <= adult; i++) {
        body.travelers.push({
          id: `${body.travelers.length + 1}`,
          travelerType: "ADULT",
        });
      }
    }

    if (children) {
      for (let i = 1; i <= children; i++) {
        body.travelers.push({
          id: `${body.travelers.length + 1}`,
          travelerType: "CHILD",
        });
      }
    }

    if (infants) {
      for (let i = 1; i <= infants; i++) {
        body.travelers.push({
          id: `${body.travelers.length + 1}`,
          travelerType: "HELD_INFANT",
          associatedAdultId: 1,
        });
      }
    }
    console.log("response", body);
    const response = await fetch(`${AMADEUS.BASE_URL}/shopping/flight-offers`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "ama-client-ref": AmaClientRef,
        date: dateHeader,
      },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    // return errorResponse(res, body, 404);

    if (!response.ok) {
      // const errorDetails = await response.text();
      // throw new Error(body);
      return errorResponse(res, data, 404, null, {
        "ama-client-ref": AmaClientRef,
        date: dateHeader,
      });
    }

    const flightDetails = data.data.map((flightOffer) => {
      const datas = flightOffer;
      const uniqueId = v4();
      const departureSegment = flightOffer.itineraries[0].segments[0];

      let prices = {
        adults: 0,
        children: 0,
        infants: 0,
      };
      flightOffer.travelerPricings.forEach((tp) => {
        if (tp.travelerType === "ADULT") {
          prices.adults = tp.price.total;
        } else if (tp.travelerType === "CHILD") {
          prices.children = tp.price.total;
        } else if (tp.travelerType === "HELD_INFANT") {
          prices.infants = tp.price.total;
        }
      });

      const totalAdults = flightOffer.travelerPricings.filter(
        (tp) => tp.travelerType === "ADULT"
      ).length;
      const totalChildren = flightOffer.travelerPricings.filter(
        (tp) => tp.travelerType === "CHILD"
      ).length;
      const totalInfants = flightOffer.travelerPricings.filter(
        (tp) => tp.travelerType === "HELD_INFANT"
      ).length;
      const airlineData = airlineLogoMap[departureSegment.carrierCode] || {
        arCode: marketingCarrier,
        logo: "default_logo_url",
      };
      let adjustedPrice = flightOffer.price.grandTotal;
      if (
        findPromotion &&
        findPromotion.airlines.includes(
          flightOffer.itineraries[0].segments[0].carrierCode
        )
      ) {
      } else if (findMakrup) {
        if (
          findMakrup.airlines.includes(
            flightOffer.itineraries[0].segments[0].carrierCode
          )
        ) {
          if (findMakrup.markupType === EMarkupType.percentage) {
            const divide = Number(flightOffer.price.grandTotal) / 100;
            const sum = divide * findMakrup.markupValue;
            adjustedPrice = Number(flightOffer.price.grandTotal) + sum;
          } else if (findMakrup.markupType === EMarkupType.whole) {
            adjustedPrice =
              Number(flightOffer.price.grandTotal) + findMakrup.markupValue;
          }
        }
      }
      if (staffMarkupValue) {
        const markupAmount =
          staffMarkupType === "percentage"
            ? adjustedPrice * (Number(staffMarkupValue) / 100)
            : Number(staffMarkupValue);
        adjustedPrice = Number(markupAmount) + Number(adjustedPrice);
      }

      // Separate the itineraries into "departure" and "return"
      const departureItinerary = flightOffer.itineraries[0];
      const returnItinerary = flightOffer.itineraries[1] || null;
      const totalTax = flightOffer.price.fees
        ? flightOffer.price.fees.reduce(
            (acc, tax) => acc + parseFloat(tax.amount),
            0
          )
        : 0;

      return {
        api: "amadus",
        uuid: uniqueId,
        arCode: airlineData.ar,
        logo: airlineData.logo,
        departure: departureItinerary.segments.map((segment) => ({
          departureTime: segment.departure.at,
          arrivalTime: segment.arrival.at,
          departureLocation: segment.departure.iataCode,
          arrivalLocation: segment.arrival.iataCode,
          marketing: segment.carrierCode,
          operating: segment.operating.carrierCode,
          marketingFlightNumber: segment.number,
          aircraftType: segment.aircraft.code,
          elapsedTime: segment.duration,
          stopCount: segment.numberOfStops,
          logo: airlineLogoMap[segment.carrierCode],
        })),

        return: returnItinerary
          ? returnItinerary.segments.map((segment) => ({
              departureTime: segment.departure.at,
              arrivalTime: segment.arrival.at,
              departureLocation: segment.departure.iataCode,
              arrivalLocation: segment.arrival.iataCode,
              marketing: segment.carrierCode,
              operating: segment.operating.carrierCode,
              marketingFlightNumber: segment.number,
              aircraftType: segment.aircraft.code,
              elapsedTime: segment.duration,
              stopCount: segment.numberOfStops,
              logo: airlineLogoMap[segment.carrierCode],
            }))
          : null,
        totalFare: flightOffer.price.grandTotal,
        baseFare: flightOffer.price.base,
        passengerTotalFare: adjustedPrice,
        itineraries: datas,
        totalTax,
        extra: {
          adult: {
            count: totalAdults,
            Price: prices.adults,
            // isRefundable: adultIsRefundable,
            // meal: adultMealInfo.length
            //   ? adultMealInfo
            //   : ["No meal info available"],
            // cabin: adultCabin,
            // totalSeat: adultTotalSeatsAvailable,
            // baggage: adultBaggage,
          },

          child: {
            count: totalChildren,
            Price: prices.children,
            // isRefundable: adultIsRefundable,
            // meal: adultMealInfo.length
            //   ? adultMealInfo
            //   : ["No meal info available"],
            // cabin: adultCabin,
            // totalSeat: adultTotalSeatsAvailable,
            // baggage: adultBaggage,
          },
          infants: {
            count: totalInfants,
            Price: prices.infants,
            // isRefundable: adultIsRefundable,
            // meal: adultMealInfo.length
            //   ? adultMealInfo
            //   : ["No meal info available"],
            // cabin: adultCabin,
            // totalSeat: adultTotalSeatsAvailable,
            // baggage: adultBaggage,
          },
        },
      };
    });

    if (flightDetails.length <= 0) {
      return errorResponse(res, "No ticket found", 200, null, {
        "ama-client-ref": AmaClientRef,
        date: dateHeader,
      });
    }

    return successResponse(
      res,
      "Flight data fetched successfully",
      {
        ticket: flightDetails,
      },
      200,
      { "ama-client-ref": AmaClientRef, date: dateHeader }
    );
  } catch (error) {
    return errorResponse(res, error.message, {
      "ama-client-ref": AmaClientRef,
      date: dateHeader,
    });
  }
}

async function getFlightDataMultiCity(req, res) {
  await ensureToken(); // Ensure the token is present for the request
  const currentDate = new Date(); // Get the current date

  // Fetch markup settings from the database
  const findMakrup = await Markup.findOne({
    api: { $in: ["amadus", "all"] },
    status: "ACTIVE",
  });

  // Fetch promotion details for the Amadeus API
  const findPromotion = await Promotion.findOne({
    api: "amadus",
    status: "ACTIVE",
    startDate: { $lte: currentDate },
    endDate: { $gte: currentDate },
  });

  // Retrieve agency information and any labels for the user
  let label = null;
  const findagency = await Agency.findById(req.user.agencyId);
  if (findagency) {
    label = findagency.showLabel;
  }

  // Initialize the airline logo map
  let airlineLogoMap = {};
  try {
    airlineLogo.forEach(({ arCode, logo, ar }) => {
      airlineLogoMap[arCode] = { ar, logo };
    });
  } catch (error) {
    console.error("Error processing airline logo data:", error);
  }

  try {
    const {
      multicityFlights,
      adultsCount,
      childrenCount,
      infantsCount,
      associatedAdultId,
      fareOptions,
      maxFlightOffers,
      staffMarkupValue,
      staffMarkupType,
    } = req.body;

    // Set cabin class if provided, otherwise default to "STANDARD"
    let cabin = fareOptions ? fareOptions : "STANDARD";
    const travelers = [];

    // Add adults to the travelers list
    for (let i = 0; i < adultsCount; i++) {
      travelers.push({
        id: `${travelers.length + 1}`,
        travelerType: "ADULT",
        fareOptions: [cabin],
      });
    }

    // Add children to the travelers list
    for (let i = 0; i < childrenCount; i++) {
      travelers.push({
        id: `${travelers.length + 1}`,
        travelerType: "CHILD",
        fareOptions: [cabin],
      });
    }

    // Add infants to the travelers list
    for (let i = 0; i < infantsCount; i++) {
      travelers.push({
        id: `${travelers.length + 1}`,
        travelerType: "HELD_INFANT",
        fareOptions: [cabin],
        associatedAdultId: `${associatedAdultId}`,
      });
    }

    // Build the request body for the Amadeus API
    const body = {
      currencyCode: `${AMADEUS.CURRENCY}`,
      originDestinations: multicityFlights,
      travelers: travelers,
      sources: ["GDS"],
      searchCriteria: {
        maxUpsellOffers: 6,

        pricingOptions: {
          includedCheckedBagsOnly: true,
        },
        additionalInformation: {
          chargeableCheckedBags: true,
          brandedFares: true,
        },
      },
    };

    // Make a POST request to the Amadeus API
    const response = await fetch(`${AMADEUS.BASE_URL}/shopping/flight-offers`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "ama-client-ref": AmaClientRef,
        date: dateHeader,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorDetails = await response.text();
      return errorResponse(res, errorDetails, 400, null, {
        "ama-client-ref": AmaClientRef,
        date: dateHeader,
      });
    }

    const data = await response.json();
    let code, logos;
    // Initialize the airline logo map
    let airlineLogoMap = {};
    try {
      airlineLogo.forEach(({ arCode, logo, ar }) => {
        airlineLogoMap[arCode] = { ar, logo };
      });
    } catch (error) {
      console.error("Error processing airline logo data:", error);
    }

    // Map the flight offer details
    const flightDetails = data.data.map((flightOffer) => {
      const datas = flightOffer;

      let adjustedPrice = flightOffer.price.grandTotal;
      const baseFare = flightOffer.price.base;
      const segmentsInfo = flightOffer.itineraries.flatMap((itinerary) =>
        itinerary.segments.map((segment) => {
          if (
            findPromotion &&
            findPromotion.airlines.includes(segment.carrierCode)
          ) {
            console.log(
              `Skipping markup for airline ${segment.carrierCode} due to active promotion`
            );
          } else if (findMakrup) {
            // Apply markup if the airline is not in the promotion
            if (findMakrup.airlines.includes(segment.carrierCode)) {
              if (findMakrup.markupType === EMarkupType.percentage) {
                const divide = Number(flightOffer.price.grandTotal) / 100;
                const sum = divide * Number(findMakrup.markupValue);
                adjustedPrice = Number(flightOffer.price.grandTotal) + sum;
              } else if (findMakrup.markupType === EMarkupType.whole) {
                adjustedPrice =
                  Number(flightOffer.price.grandTotal) + findMakrup.markupValue;
              }
            }
          }
          if (staffMarkupValue) {
            const markupAmount =
              staffMarkupType === "percentage"
                ? adjustedPrice * (Number(staffMarkupValue) / 100)
                : Number(staffMarkupValue);
            adjustedPrice = Number(adjustedPrice) + Number(markupAmount);
          }
          const airlineData = airlineLogoMap[segment.carrierCode] || {
            ar: "N/A",
            logo: "default_logo_url",
          };
          logos = airlineData.logo;
          code = airlineData.ar;
          const logo = {
            logo: airlineData.logo,
            code: airlineData.ar,
          };

          return {
            arCode: airlineData.ar,
            logo: airlineData.logo,
            departureTime: segment.departure.at,
            arrivalTime: segment.arrival.at,
            departureLocation: segment.departure.iataCode,
            arrivalLocation: segment.arrival.iataCode,
            marketingFlightNumber: segment.number,
            marketing: segment.carrierCode,
            elapsedTime: segment.duration,
            stopCount: segment.numberOfStops,
            logo,
          };
        })
      );

      const totalTax = flightOffer.price.fees
        ? flightOffer.price.fees.reduce(
            (acc, tax) => acc + parseFloat(tax.amount),
            0
          )
        : 0;

      // Organize traveler details with meal, cabin, baggage, and refund info
      let adult = {};
      let child = {};
      let infants = {};

      flightOffer.travelerPricings.forEach((tp) => {
        const travelerInfo = {
          Price: tp.price.total,
          cabin: [],
          baggage: [],
          meal: [],
          isRefundable: false,
        };

        tp?.fareDetailsBySegment?.forEach((segment) => {
          // Cabin class
          travelerInfo?.cabin?.push(segment.cabin);

          // Baggage
          if (segment?.includedCheckedBags) {
            travelerInfo.baggage.push({
              quantity: segment.includedCheckedBags.quantity,
              type: "Checked Baggage",
              weight: segment.includedCheckedBags.weight,
            });
          }
          if (segment?.amenities) {
            travelerInfo?.meal?.push({
              description: segment?.amenities.amenity?.description || "asdf",
              isChargeable: segment?.amenities.amenity?.isChargeable || "rtygh",
            });
          }
          // Meal (Amadeus API does not directly provide meal options, you might need to check for specific segments or conditions)
          // travelerInfo.meal.push("Meal Included");

          // Refundability
          if (flightOffer.fareRules) {
            const refundRule = flightOffer.fareRules.rules.find(
              (rule) => rule.category === "REFUND"
            );
            travelerInfo.isRefundable = refundRule
              ? !refundRule.notApplicable
              : false;
          }
        });

        // Organize by traveler type
        if (tp.travelerType === "ADULT") {
          adult = { ...travelerInfo, count: adultsCount };
        } else if (tp.travelerType === "CHILD") {
          child = { ...travelerInfo, count: childrenCount };
        } else if (tp.travelerType === "HELD_INFANT") {
          infants = { ...travelerInfo, count: infantsCount };
        }
      });

      return {
        api: "amadus",
        logo: logos,
        arCode: code,
        flights: segmentsInfo,
        totalFare: flightOffer.price.grandTotal,
        totalTax: totalTax.toFixed(2),
        passengerTotalFare: adjustedPrice,
        baseFare: baseFare,
        taxSummaries: flightOffer.price.fees,
        extra: {
          adult: adult,
          child: child,
          infants: infants,
        },
        itineraries: datas,
      };
    });

    if (flightDetails.length <= 0) {
      return errorResponse(res, "No ticket found", 200, null, {
        "ama-client-ref": AmaClientRef,
        date: dateHeader,
      });
    }

    return successResponse(
      res,
      "Amadeus multi-city flights fetched successfully",
      { tickets: flightDetails }
    );
  } catch (error) {
    console.error("Error fetching multi-city flight data:", error);
    return errorResponse(res, error.message, 500, null, {
      "ama-client-ref": AmaClientRef,
      date: dateHeader,
    });
  }
}

async function getCityData(req, res) {
  await ensureToken();
  const { city } = req.query;
  try {
    let apiUrl = `${AMADEUS.URL}/reference-data/locations?subType=AIRPORT,CITY&keyword=r`;
    console.log(apiUrl);
    const response = await fetch(apiUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    if (!response.ok) {
      const errorDetails = await response.text();
      throw new Error(
        `Failed to post flight data. Status: ${response.status} ${response.statusText}. Details: ${errorDetails}`
      );
    }
    const data = await response.json();
    const result = data.data.map((location) => ({
      name: location.name,
      iataCode: location.iataCode,
    }));
    return successResponse(res, "City data fetched successfully", result);
  } catch (error) {
    return errorResponse(res, error);
  }
}

async function reValidate(req, res) {
  try {
    const currentDate = new Date();
    let staffMarkupValue = 20;
    let staffMarkupType = "whole";
    const findMakrup = await Markup.findOne({
      api: { $in: ["amadus", "all"] },
      status: "ACTIVE",
    });
    const findPromotion = await Promotion.findOne({
      api: "amadus",
      status: "ACTIVE",
      startDate: { $lte: currentDate },
      endDate: { $gte: currentDate },
    });
    await ensureToken();
    let airlineLogoMap = {};
    try {
      airlineLogo.forEach(({ arCode, logo, ar }) => {
        airlineLogoMap[arCode] = { ar, logo };
      });
    } catch (error) {
      console.error("Error processing airline logo data:", error);
    }

    const { flightOffers } = req.body;
    const body = {
      data: {
        type: "flight-offers-pricing",
        flightOffers: [flightOffers],
      },
      pricingOptions: {
        includedCheckedBagsOnly: true,
      },
      additionalInformation: {
        chargeableCheckedBags: true,
      },
    };
    console.log("body", body.data.flightOffers);
    const bookingResponse = await fetch(
      `${AMADEUS.URL}/shopping/flight-offers/pricing?include=bags`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }
    );
    if (!bookingResponse.ok) {
      const errorDetails = await bookingResponse.text();
      return errorResponse(res, errorDetails, 404);
    }
    if (req.body.type === "Multi City") {
      const flightDetails = multycityFlights(data);

      if (flightDetails.length <= 0) {
        return errorResponse(res, "No ticket found", 200);
      }

      return successResponse(
        res,
        "Amadeus multi-city flights fetched successfully",
        { tickets: flightDetails }
      );
    }
    const data = await bookingResponse.json();
    const flightDetails = data.data.flightOffers.map((flightOffer) => {
      const datas = flightOffer;
      const departureSegment = flightOffer.itineraries[0].segments[0];

      let prices = {
        adults: 0,
        children: 0,
        infants: 0,
      };
      flightOffer.travelerPricings.forEach((tp) => {
        if (tp.travelerType === "ADULT") {
          prices.adults = tp.price.total;
        } else if (tp.travelerType === "CHILD") {
          prices.children = tp.price.total;
        } else if (tp.travelerType === "HELD_INFANT") {
          prices.infants = tp.price.total;
        }
      });

      const totalAdults = flightOffer.travelerPricings.filter(
        (tp) => tp.travelerType === "ADULT"
      ).length;
      const totalChildren = flightOffer.travelerPricings.filter(
        (tp) => tp.travelerType === "CHILD"
      ).length;
      const totalInfants = flightOffer.travelerPricings.filter(
        (tp) => tp.travelerType === "HELD_INFANT"
      ).length;
      const airlineData = airlineLogoMap[departureSegment.carrierCode] || {
        arCode: marketingCarrier,
        logo: "default_logo_url",
      };
      let adjustedPrice = flightOffer.price.grandTotal;
      if (
        findPromotion &&
        findPromotion.airlines.includes(
          flightOffer.itineraries[0].segments[0].carrierCode
        )
      ) {
        console.log(
          `Skipping markup for airline ${flightOffer.itineraries[0].segments[0].carrierCode} due to active promotion`
        );
      } else if (findMakrup) {
        if (
          findMakrup.airlines.includes(
            flightOffer.itineraries[0].segments[0].carrierCode
          )
        ) {
          if (findMakrup.markupType === EMarkupType.percentage) {
            const divide = Number(flightOffer.price.grandTotal) / 100;
            const sum = divide * findMakrup.markupValue;
            adjustedPrice = Number(flightOffer.price.grandTotal) + sum;
          } else if (findMakrup.markupType === EMarkupType.whole) {
            adjustedPrice =
              Number(flightOffer.price.grandTotal) + findMakrup.markupValue;
          }
        }
      }
      if (staffMarkupValue) {
        const markupAmount =
          staffMarkupType === "percentage"
            ? adjustedPrice * (Number(staffMarkupValue) / 100)
            : Number(staffMarkupValue);
        adjustedPrice = Number(markupAmount) + Number(adjustedPrice);
      }

      // Separate the itineraries into "departure" and "return"
      const departureItinerary = flightOffer.itineraries[0];
      const returnItinerary = flightOffer.itineraries[1] || null;
      const totalTax = flightOffer.price.fees
        ? flightOffer.price.fees.reduce(
            (acc, tax) => acc + parseFloat(tax.amount),
            0
          )
        : 0;

      return {
        api: "amadus",

        arCode: airlineData.ar,
        logo: airlineData.logo,
        departure: departureItinerary.segments.map((segment) => ({
          departureTime: segment.departure.at,
          arrivalTime: segment.arrival.at,
          departureLocation: segment.departure.iataCode,
          arrivalLocation: segment.arrival.iataCode,
          marketing: segment.carrierCode,
          operating: segment.operating.carrierCode,
          marketingFlightNumber: segment.number,
          aircraftType: segment.aircraft.code,
          elapsedTime: segment.duration,
          stopCount: segment.numberOfStops,
        })),

        return: returnItinerary
          ? returnItinerary.segments.map((segment) => ({
              departureTime: segment.departure.at,
              arrivalTime: segment.arrival.at,
              departureLocation: segment.departure.iataCode,
              arrivalLocation: segment.arrival.iataCode,
              marketing: segment.carrierCode,
              operating: segment.operating.carrierCode,
              marketingFlightNumber: segment.number,
              aircraftType: segment.aircraft.code,
              elapsedTime: segment.duration,
              stopCount: segment.numberOfStops,
            }))
          : null,
        totalFare: flightOffer.price.grandTotal,
        baseFare: flightOffer.price.base,
        passengerTotalFare: adjustedPrice,

        itineraries: datas,
        totalTax,
        uuid: req.body.uuid,

        extra: {
          adult: {
            count: totalAdults,
            Price: prices.adults,
            // isRefundable: adultIsRefundable,
            // meal: adultMealInfo.length
            //   ? adultMealInfo
            //   : ["No meal info available"],
            // cabin: adultCabin,
            // totalSeat: adultTotalSeatsAvailable,
            // baggage: adultBaggage,
          },

          child: {
            count: totalChildren,
            Price: prices.children,
            // isRefundable: adultIsRefundable,
            // meal: adultMealInfo.length
            //   ? adultMealInfo
            //   : ["No meal info available"],
            // cabin: adultCabin,
            // totalSeat: adultTotalSeatsAvailable,
            // baggage: adultBaggage,
          },
          infants: {
            count: totalInfants,
            Price: prices.infants,
            // isRefundable: adultIsRefundable,
            // meal: adultMealInfo.length
            //   ? adultMealInfo
            //   : ["No meal info available"],
            // cabin: adultCabin,
            // totalSeat: adultTotalSeatsAvailable,
            // baggage: adultBaggage,
          },
        },
      };
    });
    return successResponse(res, "Flight data revalidated successfully", {
      ticket: flightDetails,
    });
  } catch (error) {
    return errorResponse(res, error);
  }
}

async function createBooking(req, res) {
  await ensureToken();
  const price = req.body.passengerTotalFare;
  const { data } = req.body;
  console.log(data);

  try {
    const role = req.user.role;
    const userId = req.user._id;
    const agencyId = req.user.agencyId;
    const findMakrup = await Markup.findOne({
      api: { $in: ["amadus", "all"] },
      status: "ACTIVE",
    });
    const findAgency = await Agency.findById(agencyId);
    function formatName(name) {
      const [firstName, lastName] = name.split(" ");
      return {
        firstName:
          firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase(),
        lastName:
          lastName.charAt(0).toUpperCase() + lastName.slice(1).toLowerCase(),
      };
    }

    const { firstName, lastName } = formatName(findAgency.personName);
    const travelers = data.travelers.map((traveler, index) => ({
      id: (index + 1).toString(),
      dateOfBirth: traveler.dateOfBirth,
      name: {
        firstName: traveler.name.firstName,
        lastName: traveler.name.lastName,
      },
      gender: traveler.gender,
      contact: {
        purpose: "STANDARD_WITHOUT_TRANSMISSION",

        emailAddress: traveler.contact.emailAddress,
        phones: traveler.contact.phones.map((data) => ({
          deviceType: "MOBILE",
          countryCallingCode: data.countryCallingCode,
          number: data.number,
        })),
      },
      documents: traveler.documents.map((data) => ({
        documentType: data.documentType,
        number: data.number,
        expiryDate: data.expiryDate,
        issuanceCountry: data.issuanceCountry,
        validityCountry: data.validityCountry,
        nationality: data.nationality,
        holder: true,
      })),
    }));
    const id = req.user.agencyId;

    const travelerIdMap = travelers.reduce((map, traveler) => {
      map[traveler.id] = traveler;
      return map;
    }, {});

    // const flightOffers = data.flightOffers.map((offer) => {
    //   const travelerPricings = (offer.travelerPricings || []).map((pricing) => {
    //     if (!travelerIdMap[pricing.travelerId]) {
    //       throw new Error(`Invalid travelerId: ${pricing}`);
    //     }
    //     return {
    //       ...pricing,
    //     };
    //   });

    //   return {
    //     ...offer,
    //     id: offer.id,
    //     source: "GDS",
    //     instantTicketingRequired: offer.instantTicketingRequired || false,
    //     nonHomogeneous: offer.nonHomogeneous || false,
    //     oneWay: offer.oneWay,
    //     numberOfBookableSeats: offer.numberOfBookableSeats || 9,
    //     travelerPricings: travelerPricings,
    //     fareDetailsBySegment: offer.travelerPricings?.fareDetailsBySegment,
    //     price: offer.price,
    //   };
    // });

    const bookingBody = {
      data: {
        type: "flight-order",
        flightOffers: [data.flightOffers],
        travelers: travelers,
        // remarks: {
        //   general: [
        //     {
        //       subType: "GENERAL_MISCELLANEOUS",
        //       text: "PASSENGER NEED ASSISTANCE",
        //     },
        //   ],
        // },
        ticketingAgreement: {
          option: "DELAY_TO_CANCEL",
          delay: "6D",
        },
        contacts: [
          {
            addresseeName: {
              firstName: firstName,
              lastName: lastName,
            },
            companyName: findAgency.agencyName,
            purpose: "STANDARD",
            phones: [
              {
                deviceType: "MOBILE",
                countryCallingCode: "92",
                number: findAgency.phoneNumber,
              },
            ],
            emailAddress: findAgency.agencyEmail,
            address: {
              lines: ["Calle Prado, 16"],
              postalCode: findAgency.poBoxNumber,
              cityName: findAgency.city,
              countryCode: "ES",
            },
          },
        ],
        // "documents"
      },
    };

    // const existingBooking = await Booking.findOne({
    //   "data.type": data.type,
    //   "data.id": data.id,
    //   "data.flightOffers": data.flightOffers,
    //   "data.travelers": travelers,
    // });

    // if (existingBooking) {
    //   return errorResponse(
    //     res,
    //     "Booking with the same data already exists",
    //     409
    //   );
    // }
    const agency = await Agency.findById(req.user.agencyId);
    let adjustedPrice = price;
    if (findMakrup) {
      if (findMakrup.markupType === EMarkupType.percentage) {
        const divide = Number(price) / 100;
        const sum = divide * findMakrup.markupValue;
        adjustedPrice = Number(price) + sum;
      } else if (findMakrup.markupType === EMarkupType.whole) {
        adjustedPrice = Number(price) + findMakrup.markupValue;
      }
    }
    if (agency.cashLimit < Number(adjustedPrice)) {
      return errorResponse(
        res,
        "Your account balance is insufficient. Please recharge your balance to proceed with booking creation.",
        404
      );
    }
    // return errorResponse(res, bookingBody, 404);

    const bookingResponse = await fetch(
      `${AMADEUS.URL}/booking/flight-orders`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(bookingBody),
      }
    );
    const bookingData = await bookingResponse.json();
    // return errorResponse(res, bookingData, 404);
    if (!bookingResponse.ok) {
      const errorDetails = await bookingResponse.text();
      return errorResponse(res, errorDetails, 404, null, {
        "ama-client-ref": AmaClientRef,
        date: dateHeader,
      });
    }
    const org = bookingData.data.flightOffers.reduce((total, flightOffer) => {
      return total + Number(flightOffer.price.grandTotal);
    }, 0);

    const finalPrice = bookingData.data.flightOffers.reduce(
      (total, flightOffer) => {
        let adjustedPrice = flightOffer.price.grandTotal;
        if (findMakrup !== null) {
          if (findMakrup.markupType === EMarkupType.percentage) {
            const divide = Number(flightOffer.price.grandTotal) / 100;
            const sum = divide * findMakrup.markupValue;
            adjustedPrice = Number(flightOffer.price.grandTotal) + sum;
          } else if (findMakrup.markupType === EMarkupType.whole) {
            adjustedPrice =
              Number(flightOffer.price.grandTotal) + findMakrup.markupValue;
          }
        }

        return total + adjustedPrice;
      },
      0
    );
    const booking = new Booking({
      type: bookingData.data.type,
      api: "amadeus",
      id: bookingData.data.id,
      userId: userId,
      status: ETicketStatus.HOLD,
      agencyId: agencyId,
      createdby: role,
      orignalPrice: org,
      finalPrice: finalPrice,
      markupType: findMakrup ? findMakrup.markupType : 0,
      markupAmount: findMakrup ? findMakrup.markupValue : 0,
      associatedRecords: bookingData.data.associatedRecords,
      flightOffers: bookingData.data.flightOffers,
      travelers: bookingData.data.travelers,
      remarks: bookingData.data.remarks,
      ticketingAgreement: bookingData.data.ticketingAgreement,
      contacts: bookingData.data.contacts,
    });

    await booking.save();
    // agency.cashLimit = Number(agency.cashLimit) - Number(adjustedPrice);

    // await agency.save(); // Correct saving the agency
    return successResponse(res, "Booking created successfully", booking, 200, {
      "ama-client-ref": AmaClientRef,
      date: dateHeader,
    });
  } catch (error) {
    return errorResponse(res, error.message, 500, null, {
      "ama-client-ref": AmaClientRef,
      date: dateHeader,
    });
  }
}

async function saveTickets(amadeusResponse, bookingId) {
  try {
    // Extract ticket data from the response
    const tickets = amadeusResponse.data.tickets; // Tickets array
    const travelers = amadeusResponse.data.travelers; // Travelers array

    // Prepare updates for each traveler
    for (const ticket of tickets) {
      const travelerId = ticket.travelerId;
      const ticketNumber = ticket.documentNumber;

      // Find traveler details (if needed for debugging or verification)
      const travelerDetails = travelers.find(
        (traveler) => traveler.id === travelerId
      );

      // Update the ticket number for the traveler
      await Booking.updateOne(
        {
          _id: bookingId,
          "travelers.id": travelerId, // Match the specific traveler
        },
        {
          $set: {
            "travelers.$.ticketNumber": ticketNumber, // Update ticketNumber field
          },
        }
      );

      console.log(
        `Updated ticket number for traveler ${travelerId}: ${ticketNumber}`
      );
    }

    console.log("All tickets updated successfully.");
  } catch (error) {
    console.error("Error updating tickets:", error);
  }
}

async function issueTicket(req, res) {
  try {
    await ensureToken();

    const { pnr } = req.body;
    if (!pnr) {
      return errorResponse(res, "PNR is required", 400);
    }

    console.log("PNR:", pnr);
    const booking = await Booking.findOne({ id: pnr });
    if (!booking) {
      return errorResponse(res, "Booking not found", 404);
    }

    // Set commission
    const commissionBody = {
      data: {
        type: "flight-order",
        commissions: [
          {
            controls: ["MANUAL"],
            values: [
              {
                commissionType: "NEW",
                percentage: 2.0,
              },
            ],
          },
        ],
      },
    };

    const commissionResponse = await fetch(
      `${AMADEUS.URL}/booking/flight-orders/${pnr}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(commissionBody),
      }
    );
    const commissionData = await commissionResponse.json();
    if (!commissionResponse.ok) {
      console.error("Commission Error:", commissionData);
      return errorResponse(res, "Failed to set commission", 400, null, {
        "ama-client-ref": AmaClientRef,
        date: dateHeader,
      });
    }

    // Issue ticket
    const bookingResponse = await fetch(
      `${AMADEUS.URL}/booking/flight-orders/${pnr}/issuance`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );
    // return errorResponse(res, bookingResponse, 404);
    const bookingData = await bookingResponse.json();
    if (!bookingResponse.ok) {
      console.error("Ticket Issuance Error:", bookingData);
      return errorResponse(res, "Failed to issue ticket", 400, null, {
        "ama-client-ref": AmaClientRef,
        date: dateHeader,
      });
    }

    // Update travelers with ticket numbers
    const updatedTravelers = booking.travelers.map((traveler, index) => {
      const ticketInfo =
        bookingData.data?.tickets?.[index]?.documentNumber || "";
      return {
        ...traveler._doc,
        ticketNumber: ticketInfo,
      };
    });

    const updatedBooking = await Booking.findByIdAndUpdate(
      booking._id,
      {
        status: ETicketStatus.COMFIRMED,
        isTicketed: true,
        travelers: updatedTravelers,
      },
      { new: true }
    );

    return successResponse(
      res,
      "Ticket issued successfully",
      updatedBooking,
      200,
      {
        "ama-client-ref": AmaClientRef,
        date: dateHeader,
      }
    );
  } catch (error) {
    console.error("Error:", error, 500, null, {
      "ama-client-ref": AmaClientRef,
      date: dateHeader,
    });
    return errorResponse(
      res,
      "An error occurred while issuing the ticket",
      500,
      null,
      {
        "ama-client-ref": AmaClientRef,
        date: dateHeader,
      }
    );
  }
}

async function cancleBooking(req, res) {
  try {
    await ensureToken();

    const { pnr } = req.body;
    if (!pnr) {
      return errorResponse(res, "PNR is required", 400);
    }

    console.log("PNR:", pnr);
    const booking = await Booking.findOne({ id: pnr });
    if (!booking) {
      return errorResponse(res, "Booking not found", 404);
    }

    // Issue ticket
    const bookingResponse = await fetch(
      `${AMADEUS.URL}/booking/flight-orders/${pnr}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );
    const bookingData = await bookingResponse.json();
    if (!bookingResponse.ok) {
      console.error("Ticket Issuance Error:", bookingData);
      return errorResponse(res, "Failed to issue ticket", 400);
    }

    const updatedBooking = await Booking.findByIdAndUpdate(
      booking._id,
      {
        status: ETicketStatus.CANCELLED,
      },
      { new: true }
    );

    return successResponse(res, "booking cancled successfully", updatedBooking);
  } catch (error) {
    console.error("Error:", error);
    return errorResponse(
      res,
      "An error occurred while issuing the ticket",
      500
    );
  }
}

async function deleteBooking(req, res) {
  try {
    await ensureToken();
    const { bookingId } = req.query;
    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return errorResponse(res, "Booking not found", 404);
    }

    const amadeusResponse = await fetch(
      `${AMADEUS.URL}/booking/flight-orders/${booking.id}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );
    if (!amadeusResponse.ok) {
      const errorDetails = await amadeusResponse.text();
      return errorResponse(
        res,
        `Failed to delete booking: ${amadeusResponse.status} ${amadeusResponse.statusText}. Details: ${errorDetails}`,
        amadeusResponse.status
      );
    }

    const agency = await Agency.findById(booking.agencyId);
    if (!agency) {
      return errorResponse(res, "Agency not found", 404);
    }

    // Return credit to the agency's cash limit
    agency.cashLimit += Number(booking.finalPrice);
    await agency.save();

    // Delete booking from database
    await booking.deleteOne();
    return successResponse(res, "Booking deleted successfully", 200);
  } catch (error) {
    console.error("Error deleting booking:", error);
    return errorResponse(res, error.message || "An error occurred", 500);
  }
}

async function upsellingFares(req, res) {
  try {
    await ensureToken();
    const { price_flightOffers } = req.body;
    console.log("hello", req.body);
    const upsellingData = {
      data: {
        type: "flight-offers-upselling",
        flightOffers: [req.body.price_flightOffers],
      },
    };

    const bookingResponse = await fetch(
      `${AMADEUS.URL}/shopping/flight-offers/upselling`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "ama-client-ref": "-2024-11-12T19:01:34.644Z",
        },
        body: JSON.stringify(upsellingData),
      }
    );

    if (!bookingResponse.ok) {
      const errorDetails = await bookingResponse.text();
      console.log(errorDetails);
      return res.status(404).json({
        error: `Failed to get upselling fares. Status: ${bookingResponse.status} ${bookingResponse.statusText}. Details: ${errorDetails}`,
      });
    }

    const upsellingResponse = await bookingResponse.json();

    const detailedOffers = upsellingResponse.data.map((offer) => {
      const itinary = offer;
      const flightDetails = offer.itineraries.map((itinerary) => ({
        segments: itinerary.segments.map((segment) => ({
          departure: segment.departure,
          arrival: segment.arrival,
          carrierCode: segment.carrierCode,
          flightNumber: segment.number,
          duration: segment.duration,
          aircraft: segment.aircraft,
          stops: segment.numberOfStops,
        })),
      }));

      const pricingDetails = offer.travelerPricings.map((pricing) => {
        // Calculate total tax and collect tax descriptions
        const taxes = pricing.price.taxes || [];
        const totalTax = taxes.reduce(
          (acc, tax) => acc + parseFloat(tax.amount || 0),
          0
        );
        const taxDescriptions = taxes.map((tax) => ({
          code: tax.code,
          amount: tax.amount,
        }));

        // Gather all amenities for each segment
        const fareDetails = pricing.fareDetailsBySegment.map((detail) => {
          const amenities = detail.amenities
            ? detail.amenities.map((amenity) => ({
                code: amenity.code,
                description: amenity.description,
                isChargeable: amenity.isChargeable,
                amenityType: amenity.amenityType,
              }))
            : [];

          return {
            segmentId: detail.segmentId,
            cabin: detail.cabin || "N/A",
            brandedFare: detail.brandedFare || "N/A",
            class: detail.class || "N/A",
            baggage: detail.includedCheckedBags
              ? detail.includedCheckedBags.quantity
              : 0,
            amenities,
          };
        });

        return {
          travelerType: pricing.travelerType,
          total: pricing.price.total,
          base: pricing.price.base,
          totalTax: totalTax.toFixed(2),
          taxDescriptions,
          fareDetails,
        };
      });
      const fareRules = offer?.fareRules
        ? offer.fareRules.rules.map((rule) => ({
            category: rule.category,
            currency: offer.fareRules.currency,
            maxPenaltyAmount: rule.maxPenaltyAmount,
            circumstances: rule.circumstances,
            notApplicable: rule.notApplicable,
            descriptions: rule.descriptions
              ? rule.descriptions.map((desc) => ({
                  descriptionType: desc.descriptionType,
                  text: desc.text,
                }))
              : [],
          }))
        : [];
      return {
        flightDetails,
        pricingDetails,
        validatingAirline: offer.validatingAirlineCodes
          ? offer.validatingAirlineCodes[0]
          : "N/A",
        totalFare: offer.price ? offer.price.grandTotal : "N/A",
        fareRules,
        itineraries: itinary,
      };
    });

    return successResponse(
      res,
      "Upselling fares retrieved successfully",
      detailedOffers
    );
  } catch (error) {
    console.error("upselling fares:", error);

    return errorResponse(res, error);
  }
}

async function getFlightRules(req, res) {
  try {
    await ensureToken();
    if (!accessToken) {
      return errorResponse(res, "Authorization token is missing");
    }

    const { flightOffers } = req.body;
    if (!flightOffers) {
      return errorResponse(res, "Flight offer data is required");
    }

    const body = {
      data: {
        type: "flight-offers-pricing",
        flightOffers: [flightOffers],
      },
    };

    const bookingResponse = await fetch(
      `${AMADEUS.URL}/shopping/flight-offers/pricing?include=detailed-fare-rules`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }
    );

    if (!bookingResponse.ok) {
      const errorDetails = await bookingResponse.text();
      throw new Error(
        `Failed to fetch flight rules. Status: ${bookingResponse.status} ${bookingResponse.statusText}. Details: ${errorDetails}`
      );
    }

    const bookingData = await bookingResponse.json();
    return successResponse(
      res,
      "Flight rules fetched successfully",
      bookingData
    );
  } catch (error) {
    return errorResponse(res, error);
  }
}

async function importPNR(req, res) {
  try {
  } catch (error) {}
}

// async function flightNameByAirlineCode(req, res) {
//   await ensureToken(); // Ensure the token is available
//   try {
//     const { airlineCodes } = req.query; // Get airline codes from query parameters
//     const bookingResponse = await fetch(
//       `${AMADEUS.URL}/reference-data/airlines?airlineCodes=${airlineCodes}`,
//       {
//         method: "GET",
//         headers: {
//           Authorization: `Bearer ${accessToken}`,
//           "Content-Type": "application/json",
//         },
//       }
//     );

//     if (!bookingResponse.ok) {
//       const errorDetails = await bookingResponse.text();
//       throw new Error(
//         `Failed to get airline data. Status: ${bookingResponse.status} ${bookingResponse.statusText}. Details: ${errorDetails}`
//       );
//     }

//     const data = await bookingResponse.json();
//     if (data.data.length <= 0) {
//       return errorResponse(
//         res,
//         `No airline found with airlineCode(s): ${airlineCodes}`,
//         404
//       );
//     }

//     const codesArray = airlineCodes.split(",").map((code) => code.trim());
//     const logoPromises = codesArray.map(async (code) => {
//       const logoResponse = await axios.get(
//         `http://api.aviationstack.com/v1/airlines`, // Use the appropriate endpoint for airlines
//         {
//           params: {
//             access_key: "1f02ec94ff626430b69e5a7a2c62e40d", // Replace with your actual API key
//             iata_code: code, // Pass the IATA code here
//           },
//         }
//       );

//       if (logoResponse.data && logoResponse.data.data) {
//         const airlineData = logoResponse.data.data.find(
//           (airline) => airline.iata_code === code
//         );
//         if (airlineData && airlineData.logo) {
//           return {
//             iataCode: code,
//             logo: airlineData.logo,
//             businessName: airlineData.name || "No business name available",
//           };
//         }
//       }
//       return {
//         iataCode: code,
//         logo: "No logo available",
//         businessName: "No business name available",
//       };
//     });

//     // Wait for all logo requests to complete
//     const airlineLogos = await Promise.all(logoPromises);

//     return successResponse(
//       res,
//       "Airline data with logos fetched successfully",
//       airlineLogos // Change to return logos instead of original data
//     );
//   } catch (error) {
//     console.error(error); // Log the error for debugging
//     return errorResponse(res, error.message || "An error occurred");
//   }
// }

async function flightNameByAirlineCode(req, res) {
  await ensureToken();
  try {
    const { airlineCodes } = req.query;

    // Fetch airline data from Amadeus API
    const bookingResponse = await fetch(
      `${AMADEUS.URL}/reference-data/airlines?airlineCodes=${airlineCodes}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    // Check if the response is okay
    if (!bookingResponse.ok) {
      const errorDetails = await bookingResponse.text();
      throw new Error(
        `Failed to get airline data. Status: ${bookingResponse.status} ${bookingResponse.statusText}. Details: ${errorDetails}`
      );
    }

    const data = await bookingResponse.json();
    if (data.data.length <= 0) {
      return errorResponse(
        res,
        `No airline found with airlineCode ${airlineCodes}`,
        404
      );
    }

    // Create a mapping of airline IATA codes to their official domains
    const domainMap = {
      B6: "jetblue.com", // JetBlue Airways
      // Add other airline IATA codes and their domains here
      PIA: "piac.com.pk", // Pakistan International Airlines
      // Example: "AA": "aa.com", // American Airlines
    };

    // Map through the airline data to construct the response
    const airlineLogos = data.data.map((code) => {
      // Use the domain mapping to construct the logo URL
      const domain = domainMap[code.iataCode] || `${code.icaoCode}.com`;
      const logoResponse = `https://logo.clearbit.com/${domain}`; // Use the mapped domain

      // Remove "Airways" from businessName and commonName
      const businessName = code.businessName.replace(/Airways/gi, "").trim();
      const commonName = code.commonName.replace(/Airways/gi, "").trim();

      return {
        iataCode: code.iataCode,
        logo: logoResponse, // Use the fetched logo
        icaoCode: code.icaoCode,
        businessName: businessName, // Use modified businessName
        commonName: commonName, // Modify commonName as well
      };
    });

    return successResponse(
      res,
      "Airline data with logos fetched successfully",
      airlineLogos
    );
  } catch (error) {
    return errorResponse(res, error);
  }
}

const getFlightSalesData = async (req, res) => {
  try {
    const year = new Date().getFullYear();
    const role = req.user.role;

    if (role === "super_admin") {
      const flightSalesData = await Booking.aggregate([
        { $unwind: "$flightOffers" },
        {
          $match: {
            createdAt: {
              $gte: new Date(`${year}-01-01`),
              $lt: new Date(`${year + 1}-01-01`),
            },
          },
        },
        {
          $group: {
            _id: {
              airline: {
                $arrayElemAt: ["$flightOffers.validatingAirlineCodes", 0],
              },
              bookingId: "$_id",
            },
            totalRevenue: { $sum: "$finalPrice" },
            totalSales: { $sum: "$finalPrice" },
            totalBookings: { $sum: 1 },
            destinations: {
              $addToSet: "$flightOffers.itineraries.segments.arrival.iataCode",
            },
          },
        },
        {
          $group: {
            _id: "$_id.airline",
            totalRevenue: { $sum: "$totalRevenue" },
            totalSales: { $sum: "$totalSales" },
            totalBookings: { $sum: "$totalBookings" },
            destinations: { $addToSet: "$destinations" },
          },
        },
        {
          $project: {
            airline: "$_id",
            totalSales: { $round: ["$totalSales", 2] },
            totalRevenue: { $round: ["$totalRevenue", 2] },
            totalBookings: "$totalBookings",
            destination: { $arrayElemAt: ["$destinations", 0] },
          },
        },
      ]);

      return successResponse(
        res,
        "Flight sales data fetched successfully",
        flightSalesData
      );
    } else if (role === "agency") {
      const agencyId = req.user.agencyId;

      const bookings = await Booking.find({
        agencyId: agencyId,
        createdAt: {
          $gte: new Date(`${year}-01-01`),
          $lt: new Date(`${year + 1}-01-01`),
        },
      });

      const totalSales = bookings.reduce((sum, b) => sum + b.finalPrice, 0);
      const totalBookings = bookings.length;
      const airline = bookings
        .map((b) =>
          b.flightOffers.map((fo) => fo.validatingAirlineCodes).flat()
        )
        .flat();

      return successResponse(
        res,
        "Flight sales data for agency fetched successfully",
        [{ totalBookings, totalSales, airline }]
      );
    } else if (role === "staff" || role === "sale" || role === "marketing") {
      const userId = req.user._id;
      const bookings = await Booking.find({
        userId: userId,
        createdAt: {
          $gte: new Date(`${year}-01-01`),
          $lt: new Date(`${year + 1}-01-01`),
        },
      });

      const totalSales = bookings.reduce((sum, b) => sum + b.finalPrice, 0);
      const totalBookings = bookings.length;
      const airline = bookings
        .map((b) =>
          b.flightOffers.map((fo) => fo.validatingAirlineCodes).flat()
        )
        .flat();

      return successResponse(
        res,
        "Flight sales data for staff fetched successfully",
        [{ totalBookings, totalSales, airline }]
      );
    }
  } catch (error) {
    return errorResponse(res, error);
  }
};

const getSaleReport = async (req, res) => {
  try {
    const role = req.user.role;
    const { filter } = req.query; //(daily, weekly, monthly, yearly)
    const getDateRange = (filter) => {
      const now = new Date();
      let startDate, endDate;
      switch (filter) {
        case "daily":
          startDate = new Date(now.setHours(0, 0, 0, 0));
          endDate = new Date(now.setHours(23, 59, 59, 999));
          break;
        case "weekly":
          startDate = new Date(now.setDate(now.getDate() - now.getDay()));
          startDate.setHours(0, 0, 0, 0);
          endDate = new Date(startDate);
          endDate.setDate(startDate.getDate() + 7);
          endDate.setHours(23, 59, 59, 999);
          break;
        case "monthly":
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
          endDate.setHours(23, 59, 59, 999);
          break;
        case "yearly":
        default:
          startDate = new Date(now.getFullYear(), 0, 1);
          endDate = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
          break;
      }
      return { startDate, endDate };
    };

    const { startDate, endDate } = getDateRange(filter);

    if (role === "super_admin") {
      const bookings = await Booking.find({
        createdAt: {
          $gte: startDate,
          $lt: endDate,
        },
      });

      const allAgencies = await Agency.find({});
      const agencyMap = allAgencies.reduce((map, agency) => {
        map[agency._id] = agency;
        return map;
      }, {});

      const uniqueAgencyIds = new Set();
      bookings.forEach((booking) => {
        uniqueAgencyIds.add(booking.agencyId);
      });

      const agencySalesData = [...uniqueAgencyIds].map((id) => {
        const agency = agencyMap[id];
        const agencyBookings = bookings.filter((b) => b.agencyId === id);
        const totalSales = agencyBookings.reduce(
          (sum, b) => sum + b.finalPrice,
          0
        );
        const bookingsCount = agencyBookings.length;
        const ticketedCount = agencyBookings.filter((b) => b.isTicked).length;
        const nonTicketedCount = bookingsCount - ticketedCount;

        return {
          agencyName: agency.agencyName,
          totalSales: `$${totalSales.toLocaleString()}`,
          bookings: bookingsCount.toLocaleString(),
          ticketed: ticketedCount.toLocaleString(),
          nonTicketed: nonTicketedCount.toLocaleString(),
        };
      });

      return successResponse(
        res,
        "Agency sales data fetched successfully",
        agencySalesData
      );
    } else if (role === "agency") {
      const id = req.user.agencyId;
      const findUsers = await Agency.find({ _id: id });
      const userIds = findUsers.map((user) => user._id);

      const bookings = await Booking.find({
        agencyId: { $in: id },
        createdAt: {
          $gte: startDate,
          $lt: endDate,
        },
      });
      const agencyMap = findUsers.reduce((map, agency) => {
        map[agency._id] = agency;

        return map;
      }, {});

      const uniqueAgencyIds = new Set();
      bookings.forEach((booking) => {
        uniqueAgencyIds.add(booking.agencyId);
      });

      const agencySalesData = [...uniqueAgencyIds].map((id) => {
        const agency = agencyMap[id];
        const agencyBookings = bookings.filter(
          (b) => b.agencyId.toString() === id.toString()
        );
        const totalSales = agencyBookings.reduce(
          (sum, b) => sum + b.finalPrice,
          0
        );
        const bookingsCount = agencyBookings.length;
        const ticketedCount = agencyBookings.filter((b) => b.isTicked).length;
        const nonTicketedCount = bookingsCount - ticketedCount;
        return {
          agencyName: agency ? agency.agencyName : "Unknown",
          totalSales: `$${totalSales.toLocaleString()}`,
          bookings: bookingsCount.toLocaleString(),
          ticketed: ticketedCount.toLocaleString(),
          nonTicketed: nonTicketedCount.toLocaleString(),
          // staffName: agency.firstName,
          // staffRole: agency.role,
        };
      });

      return successResponse(
        res,
        "Agency sales data fetched successfully",
        agencySalesData
      );
    } else if (role === "staff" || role === "sale" || role === "marketing") {
      const userId = req.user._id;

      const bookings = await Booking.find({
        userId: userId,
        createdAt: {
          $gte: startDate,
          $lt: endDate,
        },
      });

      const totalSales = bookings.reduce((sum, b) => sum + b.finalPrice, 0);
      const bookingsCount = bookings.length;
      const ticketedCount = bookings.filter((b) => b.isTicked).length;
      const nonTicketedCount = bookingsCount - ticketedCount;

      const userData = {
        agencyName: req.user.agencyName || "Unknown",
        staffName: req.user.firstName,
        staffRole: req.user.role,
        totalSales: `$${totalSales.toLocaleString()}`,
        bookings: bookingsCount.toLocaleString(),
        ticketed: ticketedCount.toLocaleString(),
        nonTicketed: nonTicketedCount.toLocaleString(),
      };

      return successResponse(
        res,
        "User sales data fetched successfully",
        userData
      );
    }
  } catch (error) {
    return errorResponse(res, error);
  }
};

const agencySaleData = async (req, res) => {
  try {
    const year = new Date().getFullYear();
    const role = req.user.role;
    if (role === "super_admin") {
      const bookings = await Booking.find({
        createdAt: {
          $gte: new Date(`${year}-01-01`),
          $lt: new Date(`${year + 1}-01-01`),
        },
      });

      const allAgencies = await Agency.find({});

      const agencyMap = allAgencies.reduce((map, agency) => {
        map[agency._id] = agency;
        return map;
      }, {});

      const uniqueAgencyIds = new Set();

      bookings.forEach((booking) => {
        uniqueAgencyIds.add(booking.agencyId);
      });

      const agencySalesData = [...uniqueAgencyIds].map((id) => {
        const agency = agencyMap[id];
        const totalSales = bookings.reduce((sum, b) => sum + b.finalPrice, 0);
        const bookingsCount = bookings.filter((b) => b.userId === id).length;
        return {
          agencyName: agency ? agency.agencyName : "Unknown",
          totalSales: `$${totalSales.toLocaleString()}`,
          bookings: bookingsCount.toLocaleString(),
        };
      });
      return successResponse(
        res,
        "Agency sales data fetched successfully",
        agencySalesData
      );
    } else if (role === "agency") {
      const id = req.user.agencyId;

      const findUsers = await User.find({ agencyId: id });

      const userIds = findUsers.map((user) => user._id);

      const bookings = await Booking.find({
        userId: { $in: userIds },
        createdAt: {
          $gte: new Date(`${year}-01-01`),
          $lt: new Date(`${year + 1}-01-01`),
        },
      });

      const agencyMap = findUsers.reduce((map, agency) => {
        map[agency._id] = agency;
        return map;
      }, {});

      const uniqueAgencyIds = new Set();

      bookings.forEach((booking) => {
        uniqueAgencyIds.add(booking.userId);
      });

      const agencySalesData = [...uniqueAgencyIds].map((id) => {
        const agency = agencyMap[id];
        const totalSales = bookings
          .filter((b) => b.userId.toString() === id.toString())
          .reduce((sum, b) => sum + b.finalPrice, 0);

        const bookingsCount = bookings.filter(
          (b) => b.userId.toString() === id.toString()
        ).length;

        return {
          agencyName: agency ? agency.agencyName : "Unknown",
          totalSales: `$${totalSales.toLocaleString()}`,
          bookings: bookingsCount.toLocaleString(),
          staffName: agency.firstName,
          staffRole: agency.role,
        };
      });

      return successResponse(
        res,
        "Agency sales data fetched successfully",
        agencySalesData
      );
    } else if (["staff", "sale", "marketing"].includes(role)) {
      const userId = req.user._id;

      const bookings = await Booking.find({
        userId: userId,
        createdAt: {
          $gte: new Date(`${year}-01-01`),
          $lt: new Date(`${year + 1}-01-01`),
        },
      });

      const totalSales = bookings.reduce((sum, b) => sum + b.finalPrice, 0);

      const bookingsCount = bookings.length;
      const userData = {
        agencyName: agency ? agency.agencyName : "Unknown",
        staffName: req.user.firstName,
        staffRole: req.user.role,
        totalSales: `$${totalSales.toLocaleString()}`,
        bookings: bookingsCount.toLocaleString(),
      };

      return successResponse(
        res,
        "User sales data fetched successfully",
        userData
      );
    }
  } catch (error) {
    return errorResponse(res, error);
  }
};

const data = async (req, res) => {
  try {
    const role = req.user.role;
    const year = new Date().getFullYear();
    let cardsData = [];

    if (role === "super_admin") {
      const activeAgencies = await Agency.find({ status: "ACTIVE" });
      const totalActiveAgencies = activeAgencies.length;
      const bookingsToday = await Booking.find({
        createdAt: {
          $gte: new Date(new Date().setHours(0, 0, 0, 0)),
          $lt: new Date(new Date().setHours(23, 59, 59, 999)),
        },
      });
      const totalRevenue = bookingsToday.reduce(
        (sum, b) => sum + b.finalPrice,
        0
      );
      const cashReceivedToday = bookingsToday.reduce(
        (sum, b) => sum + (b.finalPrice || 0),
        0
      ); // Assuming cash received is finalPrice - markupAmount

      cardsData = [
        {
          title: "Active Agencies",
          src: "https://www.svgrepo.com/show/417142/team-work.svg",
          description: totalActiveAgencies.toString(),
          alt: "Active Agencies",
        },
        {
          title: "Today's Bookings",
          src: "https://www.svgrepo.com/show/300621/ticket.svg",
          description: bookingsToday.length.toString(),
          alt: "Today's Bookings",
        },
        {
          title: "Revenue Per Agency",
          src: "https://www.svgrepo.com/show/289526/cash-money.svg",
          description: `Rs ${totalRevenue.toLocaleString()}`,
          alt: "Revenue Per Agency",
        },
        {
          title: "Cash Received Today",
          src: "https://www.svgrepo.com/show/293515/cash-money.svg",
          description: `Rs ${cashReceivedToday.toLocaleString()}`,
          alt: "Cash Received Today",
        },
      ];
    } else if (role === "agency") {
      const findTotalSaleActive = await User.find({
        role: "sale",
        status: "ACTIVE",
      });
      const findTotalMarketingActive = await User.find({
        role: "marketing",
        status: "ACTIVE",
      });
      const findTotalStaffActive = await User.find({
        role: "staff",
        status: "ACTIVE",
      });
      const total =
        findTotalSaleActive.length +
        findTotalMarketingActive.length +
        findTotalStaffActive.length;
      const id = req.user.agencyId;
      const bookingsToday = await Booking.find({
        agencyId: id,
        createdAt: {
          $gte: new Date(new Date().setHours(0, 0, 0, 0)),
          $lt: new Date(new Date().setHours(23, 59, 59, 999)),
        },
      });
      const totalRevenue = bookingsToday.reduce(
        (sum, b) => sum + b.finalPrice,
        0
      );
      const cashReceivedToday = bookingsToday.reduce(
        (sum, b) => sum + (b.finalPrice - b.markupAmount || 0),
        0
      );

      cardsData = [
        {
          title: "Active Staff",
          src: staffImage,
          description: total.toString(),
          alt: "Active Agencies",
        },
        {
          title: "Today's Bookings",
          src: staffBookingImage,
          description: bookingsToday.length.toString(),
          alt: "Today's Bookings",
        },
        {
          title: "Revenue Today",
          src: staffRevenueImage,
          description: `Rs ${totalRevenue.toLocaleString()}`,
          alt: "Revenue Today",
        },
        {
          title: "Cash Received Today",
          src: staffCashImage,
          description: `Rs ${cashReceivedToday.toLocaleString()}`,
          alt: "Cash Received Today",
        },
      ];
    } else if (role === "staff" || role === "sale" || role === "marketing") {
      const userId = req.user._id;
      const bookingsToday = await Booking.find({
        userId: userId,
        createdAt: {
          $gte: new Date(new Date().setHours(0, 0, 0, 0)),
          $lt: new Date(new Date().setHours(23, 59, 59, 999)),
        },
      });
      const totalRevenue = bookingsToday.reduce(
        (sum, b) => sum + b.finalPrice,
        0
      );
      const cashReceivedToday = bookingsToday.reduce(
        (sum, b) => sum + (b.finalPrice - b.markupAmount || 0),
        0
      );

      cardsData = [
        {
          title: "Today's Bookings",
          src: "https://www.svgrepo.com/show/21240/booking.svg",
          description: bookingsToday.length.toString(),
          alt: "Today's Bookings",
        },
        {
          title: "Revenue Today",
          src: "https://www.svgrepo.com/show/215690/profits-graph.svg",
          description: `Rs ${totalRevenue.toLocaleString()}`,
          alt: "Revenue Today",
        },
        {
          title: "Cash Received Today",
          src: "https://www.svgrepo.com/show/422172/cash-coins-currency.svg",
          description: `Rs ${cashReceivedToday.toLocaleString()}`,
          alt: "Cash Received Today",
        },
      ];
    }

    return successResponse(res, "Data fetched successfully", cardsData);
  } catch (error) {
    return errorResponse(res, error);
  }
};

const sale = async (req, res) => {
  try {
    const role = req.user.role;
    const { filter } = req.query; //(daily, weekly, monthly, yearly)
    const getDateRange = (filter) => {
      const now = new Date();
      let startDate, endDate;
      switch (filter) {
        case "daily":
          startDate = new Date(now.setHours(0, 0, 0, 0));
          endDate = new Date(now.setHours(23, 59, 59, 999));
          break;
        case "weekly":
          startDate = new Date(now.setDate(now.getDate() - now.getDay()));
          startDate.setHours(0, 0, 0, 0);
          endDate = new Date(startDate);
          endDate.setDate(startDate.getDate() + 7);
          endDate.setHours(23, 59, 59, 999);
          break;
        case "monthly":
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
          endDate.setHours(23, 59, 59, 999);
          break;
        case "yearly":
        default:
          startDate = new Date(now.getFullYear(), 0, 1);
          endDate = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
          break;
      }
      return { startDate, endDate };
    };
    const { startDate, endDate } = getDateRange(filter);
    if (role === EUserRole.SUPERADMIN) {
      const findBooking = await Booking.find({
        createdAt: {
          $gte: startDate,
          $lt: endDate,
        },
      });
      let tot = 0;
      const totalSales = findBooking.map((booking) => {
        tot = tot + booking.finalPrice;
      });

      const totalBookings = findBooking.length;
      const averagePrice = tot / totalBookings;
      const totalRevenue = tot;
      cardsData = [
        {
          title: "Total Bookings",
          src: "https://www.svgrepo.com/show/21240/booking.svg",
          description: findBooking.length,
          alt: "Total Bookings",
        },
        {
          title: "Average Price",
          src: "https://www.svgrepo.com/show/215690/profits-graph.svg",
          description: averagePrice.toFixed(),
          alt: "Average Price",
        },
        {
          title: "Total Revenue",
          src: "https://www.svgrepo.com/show/422172/cash-coins-currency.svg",
          description: totalRevenue.toFixed(),
          alt: "Total Revenue",
        },
      ];
      return successResponse(res, "data", cardsData);
    }
    if (role === EUserRole.AGENCY) {
      const findBooking = await Booking.find({
        agencyId: req.user.agencyId,
        createdAt: {
          $gte: startDate,
          $lt: endDate,
        },
      });
      let tot = 0;
      const totalSales = findBooking.map((booking) => {
        tot = tot + booking.finalPrice;
      });

      const totalBookings = findBooking.length;
      const averagePrice = tot / totalBookings;
      const totalRevenue = tot;
      cardsData = [
        {
          title: "Total Bookings",
          src: "https://www.svgrepo.com/show/21240/booking.svg",
          description: findBooking.length,
          alt: "Total Bookings",
        },
        {
          title: "Average Price",
          src: "https://www.svgrepo.com/show/215690/profits-graph.svg",
          description: averagePrice.toFixed(),
          alt: "Average Price",
        },
        {
          title: "Total Revenue",
          src: "https://www.svgrepo.com/show/422172/cash-coins-currency.svg",
          description: totalRevenue.toFixed(),
          alt: "Total Revenue",
        },
      ];
      return successResponse(res, "data", cardsData);
    }
  } catch (error) {}
};

const filterSale = async (req, res) => {
  try {
    const role = req.user.role;
    const { filter } = req.query; // Filter options: 'daily', 'weekly', 'monthly', 'yearly', 'last5years'

    // Function to get startDate and endDate based on filter
    const getDateRange = (filter) => {
      const now = new Date();
      let startDate, endDate;

      switch (filter) {
        case "daily":
          startDate = new Date(now.setHours(0, 0, 0, 0)); // Start of today
          endDate = new Date(now.setHours(23, 59, 59, 999)); // End of today
          break;
        case "weekly":
          const dayOfWeek = now.getDay();
          const mondayOffset = (dayOfWeek === 0 ? -6 : 1) - dayOfWeek; // Calculate offset to Monday
          startDate = new Date(now.setDate(now.getDate() + mondayOffset));
          startDate.setHours(0, 0, 0, 0);
          endDate = new Date(startDate);
          endDate.setDate(startDate.getDate() + 4); // Until Friday
          endDate.setHours(23, 59, 59, 999);
          break;
        case "monthly":
          startDate = new Date(now.getFullYear(), now.getMonth(), 1); // Start of current month
          endDate = new Date(
            now.getFullYear(),
            now.getMonth() + 1,
            0,
            23,
            59,
            59,
            999
          ); // End of current month
          break;
        case "yearly":
          startDate = new Date(now.getFullYear(), 0, 1); // Start of current year
          endDate = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999); // End of current year
          break;
        case "last5years":
          startDate = new Date(now.getFullYear() - 5, 0, 1); // Start of 5 years ago
          endDate = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999); // End of current year
          break;
        default:
          startDate = new Date(now.getFullYear(), 0, 1); // Default to yearly if no filter provided
          endDate = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
      }

      return { startDate, endDate };
    };

    const { startDate, endDate } = getDateRange(filter);

    let findBooking;
    if (role === EUserRole.SUPERADMIN) {
      // Get all bookings within the date range for SUPERADMIN
      findBooking = await Booking.find({
        createdAt: { $gte: startDate, $lt: endDate },
      });
    } else if (role === EUserRole.AGENCY) {
      // Get bookings related to the specific agency for AGENCY role
      findBooking = await Booking.find({
        agencyId: req.user.agencyId,
        createdAt: { $gte: startDate, $lt: endDate },
      });
    }

    const salesData = [];
    const labelFormatter = (date) => {
      const options = { weekday: "short", month: "short", day: "numeric" }; // Format for graph labels
      return date.toLocaleDateString(undefined, options); // Labels based on the date format (for graph)
    };

    // Prepare graph data
    switch (filter) {
      case "daily":
        salesData.push({
          label: labelFormatter(startDate),
          value: findBooking
            .map((booking) => booking.finalPrice)
            .reduce((a, b) => a + b, 0),
        });
        break;
      case "weekly":
        // For each day in the week (Mon-Fri), calculate sales
        for (let i = 0; i <= 4; i++) {
          // Monday to Friday
          const dayStart = new Date(startDate);
          dayStart.setDate(startDate.getDate() + i);
          const dayEnd = new Date(dayStart);
          dayEnd.setHours(23, 59, 59, 999);

          const daySales = findBooking
            .filter(
              (booking) =>
                booking.createdAt >= dayStart && booking.createdAt <= dayEnd
            )
            .map((booking) => booking.finalPrice)
            .reduce((a, b) => a + b, 0);

          salesData.push({
            label: labelFormatter(dayStart),
            value: daySales,
          });
        }
        break;
      case "monthly":
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

          const daySales = findBooking
            .filter(
              (booking) =>
                booking.createdAt >= dayStart && booking.createdAt <= dayEnd
            )
            .map((booking) => booking.finalPrice)
            .reduce((a, b) => a + b, 0);

          salesData.push({
            label: i, // Day of the month as label
            value: daySales,
          });
        }
        break;
      case "yearly":
        for (let i = 0; i < 12; i++) {
          // For each month of the year
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

          const monthSales = findBooking
            .filter(
              (booking) =>
                booking.createdAt >= monthStart && booking.createdAt <= monthEnd
            )
            .map((booking) => booking.finalPrice)
            .reduce((a, b) => a + b, 0);

          salesData.push({
            label: monthStart.toLocaleString("default", { month: "short" }), // 'Jan', 'Feb', etc.
            value: monthSales,
          });
        }
        break;
      case "last5years":
        const currentYear = new Date().getFullYear();
        for (let i = 0; i < 5; i++) {
          const yearStart = new Date(currentYear - i, 0, 1); // Start of each year
          const yearEnd = new Date(currentYear - i, 11, 31, 23, 59, 59, 999); // End of each year

          const yearSales = findBooking
            .filter(
              (booking) =>
                booking.createdAt >= yearStart && booking.createdAt <= yearEnd
            )
            .map((booking) => booking.finalPrice)
            .reduce((a, b) => a + b, 0);

          salesData.push({
            label: yearStart.getFullYear(), // Year as label
            value: yearSales,
          });
        }
        break;
    }

    return successResponse(res, "Sales data fetched successfully", {
      salesData,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Error fetching sales data" });
  }
};

// const sale = async (req, res) => {
//   try {
//     const role = req.user.role;
//     const { filter } = req.query; // Filter options: 'daily', 'weekly', 'monthly', 'yearly'

//     // Function to get startDate and endDate based on filter
//     const getDateRange = (filter) => {
//       const now = new Date();
//       let startDate, endDate;

//       switch (filter) {
//         case "daily":
//           startDate = new Date(now.setHours(0, 0, 0, 0)); // Start of today
//           endDate = new Date(now.setHours(23, 59, 59, 999)); // End of today
//           break;
//         case "weekly":
//           const dayOfWeek = now.getDay();
//           const mondayOffset = (dayOfWeek === 0 ? -6 : 1) - dayOfWeek; // Calculate offset to Monday
//           startDate = new Date(now.setDate(now.getDate() + mondayOffset));
//           startDate.setHours(0, 0, 0, 0);
//           endDate = new Date(startDate);
//           endDate.setDate(startDate.getDate() + 4); // Until Friday
//           endDate.setHours(23, 59, 59, 999);
//           break;
//         case "monthly":
//           startDate = new Date(now.getFullYear(), now.getMonth(), 1); // Start of current month
//           endDate = new Date(
//             now.getFullYear(),
//             now.getMonth() + 1,
//             0,
//             23,
//             59,
//             59,
//             999
//           ); // End of current month
//           break;
//         case "yearly":
//           startDate = new Date(now.getFullYear(), 0, 1); // Start of current year
//           endDate = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999); // End of current year
//           break;
//         default:
//           startDate = new Date(now.getFullYear(), 0, 1); // Default to yearly if no filter provided
//           endDate = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
//       }

//       return { startDate, endDate };
//     };

//     const { startDate, endDate } = getDateRange(filter);

//     let findBooking;
//     if (role === EUserRole.SUPERADMIN) {
//       // Get all bookings within the date range for SUPERADMIN
//       findBooking = await Booking.find({
//         createdAt: { $gte: startDate, $lt: endDate },
//       });
//     } else if (role === EUserRole.AGENCY) {
//       // Get bookings related to the specific agency for AGENCY role
//       findBooking = await Booking.find({
//         agencyId: req.user.agencyId,
//         createdAt: { $gte: startDate, $lt: endDate },
//       });
//     }

//     const salesData = [];
//     const labelFormatter = (date) => {
//       const options = { weekday: "short", month: "short", day: "numeric" }; // Format for graph labels
//       return date.toLocaleDateString(undefined, options); // Labels based on the date format (for graph)
//     };

//     // Prepare graph data
//     switch (filter) {
//       case "daily":
//         salesData.push({
//           label: labelFormatter(startDate),
//           value: findBooking
//             .map((booking) => booking.finalPrice)
//             .reduce((a, b) => a + b, 0),
//         });
//         break;
//       case "weekly":
//         // For each day in the week (Mon-Fri), calculate sales
//         for (let i = 0; i <= 4; i++) {
//           // Monday to Friday
//           const dayStart = new Date(startDate);
//           dayStart.setDate(startDate.getDate() + i);
//           const dayEnd = new Date(dayStart);
//           dayEnd.setHours(23, 59, 59, 999);

//           const daySales = findBooking
//             .filter(
//               (booking) =>
//                 booking.createdAt >= dayStart && booking.createdAt <= dayEnd
//             )
//             .map((booking) => booking.finalPrice)
//             .reduce((a, b) => a + b, 0);

//           salesData.push({
//             label: labelFormatter(dayStart),
//             value: daySales,
//           });
//         }
//         break;
//       case "monthly":
//         const daysInMonth = new Date(
//           startDate.getFullYear(),
//           startDate.getMonth() + 1,
//           0
//         ).getDate();
//         for (let i = 1; i <= daysInMonth; i++) {
//           const dayStart = new Date(
//             startDate.getFullYear(),
//             startDate.getMonth(),
//             i
//           );
//           const dayEnd = new Date(dayStart);
//           dayEnd.setHours(23, 59, 59, 999);

//           const daySales = findBooking
//             .filter(
//               (booking) =>
//                 booking.createdAt >= dayStart && booking.createdAt <= dayEnd
//             )
//             .map((booking) => booking.finalPrice)
//             .reduce((a, b) => a + b, 0);

//           salesData.push({
//             label: i, // Day of the month as label
//             value: daySales,
//           });
//         }
//         break;
//       case "yearly":
//         for (let i = 0; i < 12; i++) {
//           // For each month of the year
//           const monthStart = new Date(startDate.getFullYear(), i, 1);
//           const monthEnd = new Date(
//             startDate.getFullYear(),
//             i + 1,
//             0,
//             23,
//             59,
//             59,
//             999
//           );

//           const monthSales = findBooking
//             .filter(
//               (booking) =>
//                 booking.createdAt >= monthStart && booking.createdAt <= monthEnd
//             )
//             .map((booking) => booking.finalPrice)
//             .reduce((a, b) => a + b, 0);

//           salesData.push({
//             label: monthStart.toLocaleString("default", { month: "short" }), // 'Jan', 'Feb', etc.
//             value: monthSales,
//           });
//         }
//         break;
//     }

//     return successResponse(res, "Sales data fetched successfully", {
//       salesData,
//     });
//   } catch (error) {
//     console.error(error);
//     return res.status(500).json({ message: "Error fetching sales data" });
//   }
// };

async function updatePNR(req, res) {
  try {
    await ensureToken();
    const { pnr } = req.body;
    const findBooking = await Booking.findOne({ id: pnr });
    if (!findBooking) {
      return errorResponse(res, "Booking not found with the given PNR", 404);
    }
    const data = {
      confirmationId: `${pnr}`,
    };
    let status = null;
    console.log("body", data);
    const bookingResponse = await fetch(
      `${AMADEUS.URL}/booking/flight-orders/${pnr}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    // Parse the response
    const amadeusResponse = await bookingResponse.json();
    console.log("bookingData", amadeusResponse);

    if (!bookingResponse.ok) {
      const errorDetails = await bookingResponse.text();
      throw new Error(
        `Failed to get airline data. Status: ${bookingResponse.status} ${bookingResponse.statusText}. Details: ${errorDetails}`
      );
    }

    status = amadeusResponse?.data.ticketingAgreement.option;
    console.log(status, findBooking.status);
    // return errorResponse(res, amadeusResponse, 404);
    if (findBooking.status === "hold" && status === "DELAY_TO_CANCEL") {
      return successResponse(res, "the status is same i.e hold", 204);
    }
    if (findBooking.status === "confirmed" && status === "DELAY_TO_CANCEL") {
      return successResponse(
        res,
        {
          message: "ticket is on hold but db contains confirmed status",
          ticketNumber: null,
          status: "hold",
        },
        204
      );
    }
    if (findBooking.status === "voided" && status === "DELAY_TO_CANCEL") {
      return successResponse(
        res,
        {
          message: "ticket is on hold but db contains voided status",
          ticketNumber: null,
          status: "hold",
        },
        204
      );
    }
    if (findBooking.status === "hold" && status === "CONFIRM") {
      const ticketNumber = amadeusResponse.data.tickets.map((data) => ({
        ticket: data.documentNumber,
      }));
      return successResponse(
        res,
        {
          message: "ticket is issued but db contains hold status",
          ticketNumber,
          status: "confirmed",
        },
        200
      );
    }
    if (findBooking.status === "voided" && status === "CONFIRM") {
      const ticketNumber = amadeusResponse.data.tickets.map((data) => ({
        ticket: data.documentNumber,
      }));
      return successResponse(
        res,
        {
          message: "ticket is issued but db contains voided status",
          ticketNumber,
          status: "confirmed",
        },
        200
      );
    }
    if (findBooking.status === "confirmed" && status === "CONFIRM") {
      return successResponse(res, "the status is same i.e confirmed", 204);
    }
    // if (findBooking.status === "hold" && status === null) {
    //   const ticketNumber = amadeusResponse.travelers.map((data) => ({
    //     ticket: data.identityDocuments[0].documentNumber,
    //   }));
    //   return errorResponse(
    //     res,

    //     {
    //       message: "ticket is Voided but db contains hold status",
    //       ticketNumber,
    //       status: "voided",
    //     },
    //     200
    //   );
    // }
    if (findBooking.status === "confirmed" && status === "Voided") {
      const ticketNumber = amadeusResponse.data.tickets.map((data) => ({
        ticket: data.documentNumber,
      }));
      return successResponse(res, {
        message: "ticket is Voided but db contains confirmed status",
        ticketNumber,
        status: "voided",
      });
    }

    if (findBooking.status === "voided" && status === "Issued") {
      const ticketNumber = amadeusResponse.data.tickets.map((data) => ({
        ticket: data.documentNumber,
      }));
      return successResponse(
        res,

        {
          message: "ticket is Voided but db contains confirmed status",
          ticketNumber,
          status: "voided",
        },
        200
      );
    }
    if (findBooking.status === "voided" && status === "Voided") {
      return successResponse(res, "the status is same i.e Voided", 204);
    }
    if (
      findBooking.status === "voided" &&
      amadeusResponse.isTicketed === false
    ) {
      return successResponse(
        res,
        {
          mwssage: "ticket is hold but db contains voided status",
          ticketNumber: null,
          status: "hold",
        },
        200
      );
    }
    if (
      findBooking.status === "confirmed" &&
      amadeusResponse.isTicketed === false
    ) {
      return successResponse(
        res,
        {
          message: "ticket is hold but db contains confirmed status",
          ticketNumber: null,
          status: "hold",
        },
        200
      );
    }
  } catch (error) {
    return errorResponse(res, error);
  }
}

async function updateStatus(req, res) {
  try {
    await ensureToken();
    const { pnr, status, ticket } = req.body;

    const findBooking = await Booking.findOne({ id: pnr });
    if (!findBooking) {
      return errorResponse(res, "Booking not found with the given PNR", 404);
    }

    let updatedTravelers = findBooking.travelers;

    if (ticket && Array.isArray(ticket)) {
      if (ticket.length !== findBooking.travelers.length) {
        return errorResponse(
          res,
          "Number of ticket numbers does not match the number of travelers",
          400
        );
      }

      updatedTravelers = findBooking.travelers.map((traveler, index) => {
        return {
          ...traveler._doc,
          ticketNumber: ticket[index].ticket.toString(),
        };
      });
    }

    const updateFields = { status };
    if (ticket) updateFields.travelers = updatedTravelers;

    const updatedBooking = await Booking.findByIdAndUpdate(
      findBooking._id,
      updateFields,
      { new: true }
    );

    return successResponse(res, "Booking updated successfully", updatedBooking);
  } catch (error) {
    return errorResponse(res, error);
  }
}

async function importPNR(req, res) {
  try {
    await ensureToken();
    const { pnr } = req.body;
    console.log(pnr);

    let airlineLogoMap = {};
    try {
      airlineLogo.forEach(({ arCode, logo, ar }) => {
        airlineLogoMap[arCode] = { ar, logo };
      });
    } catch (error) {
      console.error("Error processing airline logo data:", error);
    }

    const findBooking = await Booking.findOne({ id: pnr });

    if (findBooking) {
      return errorResponse(res, "PNR already exists in the database", 200);
    }

    const data = {
      confirmationId: `${pnr}`,
    };
    const response = await fetch(
      `${AMADEUS.URL}/booking/flight-orders/${pnr}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    const amadeusResponse = await response.json();
    if (!response.ok) {
      return errorResponse(
        res,
        `Failed to get Booking: ${response.status} ${
          response.statusText
        }. Details: ${JSON.stringify(amadeusResponse)}`,
        response.status
      );
    }
    if (amadeusResponse.errors) {
      const hasWarnings = amadeusResponse.errors.some(
        (error) => error.title === "WARNING"
      );
      const hasErrors = amadeusResponse.errors.some(
        (error) => error.category !== "WARNING"
      );

      if (hasErrors) {
        const errors = amadeusResponse.errors.filter(
          (error) => error.title !== "NOT FOUND"
        );
        console.error("Errors from Sabre API:", errors);
        return errorResponse(res, errors, 404);
      }

      if (hasWarnings) {
        console.warn("Warnings from Sabre API:", amadeusResponse.errors);
      }
    }
    if (amadeusResponse.data.flightOffers) {
      amadeusResponse.data.flightOffers.forEach((flight, index) => {
        const airlineData = airlineLogoMap[
          flight.validatingAirlineCodes[index]
        ] || {
          arCode: flight.airlineCode,
          logo: "default_logo_url",
        };
        flight.logo = airlineData.logo;
        flight.arcode = airlineData.ar;
      });
    }

    return successResponse(res, "Import PNR from amadeus API", amadeusResponse);
  } catch (error) {
    console.error("Error importing PNR:", error);
    return errorResponse(res, error);
  }
}

async function modifyPNR(req, res) {
  try {
    await ensureToken();
    const { pnr, documentDetails, staffMarkupValue, staffMarkupType } =
      req.body;
    const { id, travelers } = req.body.data.data;
    let markupType, markupAmount;
    const findAgency = await Agency.findOne({ _id: req.user.agencyId });
    const findMakrup = await Markup.findOne({
      api: { $in: ["sabre", "all"] },
      status: "ACTIVE",
    });
    if (findMakrup) {
      markupType = findMakrup.markupType;
      markupAmount = findMakrup.markupValue;
    }
    // Validate documentDetails length matches travelers length
    if (travelers.length !== documentDetails.length) {
      return errorResponse(
        res,
        "Mismatch between travelers and document details",
        400
      );
    }

    const data = {
      data: {
        type: "flight-order",
        travelers: travelers.map((traveler, index) => {
          // Ensure all required fields are present
          if (
            !documentDetails[index].dateOfBirth ||
            !documentDetails[index].documentType ||
            !documentDetails[index].documentNumber
          ) {
            throw new Error(
              `Missing required fields for traveler ${index + 1}`
            );
          }

          return {
            id: `${index + 1}`,
            dateOfBirth: documentDetails[index].dateOfBirth,
            name: traveler.name,
            gender: traveler.gender,
            documents: [
              {
                documentType: documentDetails[index].documentType,
                number: documentDetails[index].documentNumber,
                expiryDate: documentDetails[index].expiryDate,
                nationality: documentDetails[index].nationality,
                holder: documentDetails[index].documentHolder,
                issuanceCountry: documentDetails[index].nationality,
              },
            ],
          };
        }),
      },
    };

    const response = await fetch(`${AMADEUS.URL}/booking/flight-orders/${id}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });
    console.log("amadeusResponse", response);

    const amadeusResponse = await response.json();
    if (!response.ok) {
      return errorResponse(
        res,
        `Failed to get Booking: ${response.status} ${
          response.statusText
        }. Details: ${JSON.stringify(amadeusResponse)}`,
        response.status
      );
    }
    if (amadeusResponse.errors) {
      const hasWarnings = amadeusResponse.errors.some(
        (error) => error.title === "WARNING"
      );
      const hasErrors = amadeusResponse.errors.some(
        (error) => error.category !== "WARNING"
      );

      if (hasErrors) {
        const errors = amadeusResponse.errors.filter(
          (error) => error.title !== "NOT FOUND"
        );
        console.error("Errors from Sabre API:", errors);
        return errorResponse(res, errors, 404);
      }

      if (hasWarnings) {
        console.warn("Warnings from Sabre API:", amadeusResponse.errors);
      }
    }
    let status = amadeusResponse?.data.ticketingAgreement.option;
    let ticketNumber,
      isTicked = false;

    if (status === "DELAY_TO_CANCEL") {
      status = "hold";
    }
    if (status === "CONFIRM") {
      ticketNumber = amadeusResponse.data.tickets.map((data) => ({
        ticket: data.documentNumber,
      }));

      status = "confirmed";
      isTicked = true;
    }
    const basePrice = parseFloat(
      amadeusResponse.data.flightOffers[0].price.total
    );
    console.log("BAsePrice", basePrice);
    const adjustedPrice = calculateAdjustedPrice(
      basePrice,
      findMakrup,
      staffMarkupValue || 0,
      staffMarkupType || 0
    );
    const newBooking = new Booking({
      type: amadeusResponse.type,
      api: "amadeus",
      userId: findAgency._id,
      id: amadeusResponse.data.id,
      isTicketed: isTicked,
      status: status,
      orignalPrice: basePrice,
      finalPrice: adjustedPrice,
      markupType: markupType,
      markupAmount: markupAmount,
      flightOffers: amadeusResponse.data.flightOffers,
      travelers: amadeusResponse.data.travelers,
      remarks: amadeusResponse.data.remarks,
      ticketingAgreement: amadeusResponse.data.ticketingAgreement,
      contacts: amadeusResponse.data.contacts,
    });
    await newBooking.save();

    return successResponse(res, "PNR modified successfully", amadeusResponse);
  } catch (error) {
    console.error("Error in modifyPNR:", error);
    return errorResponse(res, error.message || error);
  }
}

async function addDb(req, res) {
  try {
    const { pnr, amadeusResponse } = req.body;
    const findAgency = await Agency.findOne({ _id: req.user.agencyId });

    // return successResponse(res, "PNR modified successfully", findAgency);
    let status = amadeusResponse?.data.ticketingAgreement.option;
    let ticketNumber,
      isTicked = false;
    console.log("status", status);

    if (status === "DELAY_TO_CANCEL") {
      status = "hold";
    }
    if (status === "CONFIRM") {
      ticketNumber = amadeusResponse.data.tickets.map((data) => ({
        ticket: data.documentNumber,
      }));

      status = "confirmed";
      isTicked = true;
    }

    const newBooking = new Booking({
      type: amadeusResponse.type,
      api: "amadeus",
      userId: findAgency._id,
      id: amadeusResponse.data.id,
      isTicketed: isTicked,
      status: status,
      flightOffers: amadeusResponse.data.flightOffers,
      travelers: amadeusResponse.data.travelers,
      remarks: amadeusResponse.data.remarks,
      ticketingAgreement: amadeusResponse.data.ticketingAgreement,
      contacts: amadeusResponse.data.contacts,
    });

    await newBooking.save();
    return successResponse(res, "PNR modified successfully", amadeusResponse);
  } catch (error) {
    console.error("Error in modifyPNR:", error);
    return errorResponse(res, error.message || error);
  }
}

async function viewItinary(req, res) {
  try {
    await ensureToken();
    const { pnr } = req.body;
    const response = await fetch(
      `${AMADEUS.URL}/booking/flight-orders/${pnr}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );
    const amadeusResponse = await response.json();
    if (!response.ok) {
      return errorResponse(
        res,
        `Failed to get Booking: ${response.status} ${
          response.statusText
        }. Details: ${JSON.stringify(amadeusResponse)}`,
        response.status
      );
    }
    return successResponse(res, amadeusResponse, 200);
  } catch (error) {
    return errorResponse(res, error);
  }
}
module.exports = {
  getFlightData,
  getCityData,
  getFlightDataMultiCity,
  createBooking,
  getFlightRules,
  flightNameByAirlineCode,
  getFlightSalesData,
  agencySaleData,
  data,
  getSaleReport,
  filterSale,
  sale,
  deleteBooking,
  upsellingFares,
  reValidate,
  issueTicket,
  viewItinary,
  updatePNR,
  updateStatus,
  modifyPNR,
  importPNR,
  addDb,
};
