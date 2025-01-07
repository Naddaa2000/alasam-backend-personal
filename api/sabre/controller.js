const sabreService = require("./sabreService");
const logger = require("../../lib/utils/logger");
const { successResponse } = require("../../lib/utils/success");
const { errorResponse } = require("../../lib/utils/error");
const agencySchema = require("../../lib/schema/agency.schema");
const Agency = require("../../lib/schema/agency.schema");
const Booking = require("../../lib/schema/booking.schema");
const User = require("../../lib/schema/users.schema");
const Markup = require("../../lib/schema/markup.schema");
require("dotenv").config();
const airlineLogo = require("../airlineLogo/airlineLogo");
const {
  EMarkupType,
  EUserRole,
  ETicketStatus,
} = require("../../lib/utils/enum");
const { create } = require("xmlbuilder2");
const axios = require("axios");
const { v4 } = require("uuid");
const xml2js = require("xml2js");
const { SABRE } = require("../../config/config");
const {
  generateActivationToken,
  generateOTP,
  handleOtpAttempts,
} = require("../../lib/utils/commonFunction");
const AccessToken = require("twilio/lib/jwt/AccessToken");

let accessToken = "";
let soapAccessToken = "";
let tokenExpiryTime = 0;
let soapTokenExpiryTime = 0;
function calculateAgeInYears(dobString) {
  const dob = new Date(dobString);
  const today = new Date();

  let ageYears = today.getFullYear() - dob.getFullYear();
  if (
    today.getMonth() < dob.getMonth() ||
    (today.getMonth() === dob.getMonth() && today.getDate() < dob.getDate())
  ) {
    ageYears--;
  }
  return ageYears;
}

function calculateAgeInMonths(dobString) {
  const dob = new Date(dobString);
  const today = new Date();

  let ageMonths =
    (today.getFullYear() - dob.getFullYear()) * 12 +
    (today.getMonth() - dob.getMonth());
  if (today.getDate() < dob.getDate()) {
    ageMonths--;
  }
  return ageMonths;
}

function getGenderCode(gender) {
  // Convert the input to lowercase to make the function case-insensitive
  const lowerGender = gender.toLowerCase();
  // Check for different cases and return the corresponding code
  if (lowerGender === "adult") {
    return "ADT";
  } else if (lowerGender === "child") {
    return "CNN";
  } else if (lowerGender === "infant") {
    return "INF";
  }
}
function getBaggageInfo(baggageInformation, baggageAllowanceDescs) {
  return baggageInformation.map((baggage) => {
    const segment = baggage?.segments;
    const allowanceRef = baggage?.allowance?.ref;
    const allowanceDetail = allowanceRef
      ? baggageAllowanceDescs.find((desc) => desc.id === allowanceRef)
      : null;

    return { segment, allowanceDetail };
  });
}
function getbrandNameInfo(baggageInformation, baggageAllowanceDescs) {
  return baggageInformation.map((baggage) => {
    const allowanceRef = baggage?.ref;
    const allowanceDetail = allowanceRef
      ? baggageAllowanceDescs.find((desc) => desc.id === allowanceRef)
      : null;
    // console.log("brand", allowanceDetail?.brand);

    return allowanceDetail?.brand?.brandName
      ? allowanceDetail?.brand?.brandName
      : allowanceDetail?.brand;
  });
}
function getbrandFeatures(baggageInformation, baggageAllowanceDescs) {
  return baggageInformation.map((baggage) => {
    const allowanceRef = baggage?.ref;
    const allowanceDetail = allowanceRef
      ? baggageAllowanceDescs?.find((desc) => desc.id === allowanceRef)
      : null;
    // console.log("brand", allowanceDetail?.brand);

    return allowanceDetail?.commercialName;
  });
}
function convertDateTime(input) {
  // Parse the input date
  const date = new Date(input);

  // Check if the date is valid
  if (isNaN(date)) {
    throw new Error("Invalid date format");
  }

  // Get the components of the date
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0"); // Months are 0-indexed
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  const seconds = String(date.getUTCSeconds()).padStart(2, "0");

  // Format the output
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
}

function convertToISODateTime(timeString, dateString) {
  // Create a new Date object using the specified date and timelog
  const time = timeString.split("+")[0];
  const dateTimeString = `${dateString}T${time}`;
  // const dateObject = new Date(dateTimeString);

  // // Check if the date is valid
  // if (isNaN(dateObject.getTime())) {
  //   throw new Error("Invalid date or time format");
  // }

  // Return the date in ISO format
  return dateTimeString; // This will return it in the "2024-11-24T14:05:00.000Z" format
}

function convertToISODateTimee(timeString, dateString) {
  const datetimeString = dateString;
  const cleanedString = datetimeString.trim();
  const datePart = cleanedString.split("T")[0];
  const dateTimeString = `${datePart}T${timeString}`;
  // const dateObject = new Date(dateTimeString);

  // // Check if the date is valid
  // if (isNaN(dateObject.getTime())) {
  //   throw new Error("Invalid date or time format");
  // }

  // Return the date in ISO format
  return dateTimeString; // This will return it in the "2024-11-24T14:05:00.000Z" format
}

const cabinTypeMap = {
  P: "Premium First",
  PremiumFirst: "Premium First",
  F: "First",
  First: "First",
  J: "Premium Business",
  PremiumBusiness: "Premium Business",
  C: "Business",
  Business: "Business",
  S: "Premium Economy",
  PremiumEconomy: "Premium Economy",
  Y: "Economy",
  Economy: "Economy",
};

function convertMinutesToISODuration(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60); // Calculate full hours
  const minutes = totalMinutes % 60; // Calculate remaining minutes

  let isoDuration = "PT";

  if (hours > 0) {
    isoDuration += `${hours}H`;
  }

  if (minutes > 0) {
    isoDuration += `${minutes}M`;
  }

  return isoDuration;
}
function generateAuthString(user, group, domain, password) {
  // Create the EPR string
  const epr = `V1:${user}:${group}:${domain}`;

  // Encode EPR and password to Base64
  const base64EPR = Buffer.from(epr).toString("base64");
  const base64Password = Buffer.from(password).toString("base64");

  // Combine into the final string
  const finalAuthString = Buffer.from(
    `${base64EPR}:${base64Password}`
  ).toString("base64");

  // Return the final authorization string
  return finalAuthString;
}

// Example usage
const authString = generateAuthString("704295", "0BJL", "AA", "SSWRES24");
console.log(authString); // Prints the final authorization string

async function getToken() {
  try {
    const requestBody = new URLSearchParams({
      client_id: process.env.SABRE_CLIENT_ID,
      client_secret: process.env.SABRE_CLIENT_SECRET,
      grant_type: "client_credentials",
    });

    const id = process.env.SABRE_CLIENT_ID;
    const password = process.env.SABRE_CLIENT_SECRET;
    const pcc = process.env.SABRE_PCC;
    const authString = generateAuthString(id, pcc, "AA", password);

    const response = await fetch(process.env.SABRE_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${authString}`,
      },
      body: requestBody,
    });

    if (!response.ok) {
      throw new Error("Failed to fetch access token");
    }

    const tokenData = await response.json();
    accessToken = tokenData.access_token;
    const expiresIn = tokenData.expires_in;

    // Calculate the token expiry time and refresh 100 seconds before it expires
    tokenExpiryTime = Date.now() + (expiresIn - 100) * 1000;

    // Set a timeout to refresh the token automatically before it expires
    setTimeout(getToken, (expiresIn - 100) * 1000);
  } catch (error) {
    console.error("Error fetching access token:", error);
    throw new Error("Failed to fetch access token");
  }
}

async function ensureToken() {
  if (!accessToken || Date.now() >= tokenExpiryTime) {
    await getToken();
  }
}

async function getSoapToken() {
  try {
    // SOAP request body
    const body = `<SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/">
      <SOAP-ENV:Header>
          <MessageHeader xmlns="http://www.ebxml.org/namespaces/messageHeader">
              <From>
                  <PartyId>Agency</PartyId>
              </From>
              <To>
                  <PartyId>Sabre_API</PartyId>
              </To>
              <ConversationId>2021.01.DevStudio</ConversationId>
              <Action>SessionCreateRQ</Action>
          </MessageHeader>
          <Security xmlns="http://schemas.xmlsoap.org/ws/2002/12/secext">
              <UsernameToken>
                  <Username>704295</Username>
                  <Password>SSWRES24</Password>
                  <Organization>${SABRE.SABRE_PCC}</Organization>
                  <Domain>AA</Domain>
              </UsernameToken>
          </Security>
      </SOAP-ENV:Header>
      <SOAP-ENV:Body>
          <SessionCreateRQ returnContextID="true" Version="1.0.0" xmlns="http://www.opentravel.org/OTA/2002/11"/>
      </SOAP-ENV:Body>
    </SOAP-ENV:Envelope>`;

    // Make the SOAP request
    const response = await fetch(SABRE.SOAP_URL, {
      method: "POST",
      headers: {
        "Content-Type": "text/xml",
      },
      body: body,
    });

    // Handle non-200 responses
    if (!response.ok) {
      const errorXML = await response.text();
      console.error("SOAP Error Response:", errorXML);
      throw new Error("Failed to fetch SOAP token");
    }

    // Parse the SOAP response
    const responseXML = await response.text();
    const parsedResponse = await xml2js.parseStringPromise(responseXML, {
      explicitArray: false,
    });

    // Extract the BinarySecurityToken
    const tokennn =
      parsedResponse["soap-env:Envelope"]?.["soap-env:Header"]?.[
        "wsse:Security"
      ]?.["wsse:BinarySecurityToken"];
    if (!tokennn) {
      throw new Error("BinarySecurityToken not found in the response");
    }
    soapAccessToken = tokennn._;

    // Save the token (or return it for further use)
    return soapAccessToken;
  } catch (error) {
    console.error("Error fetching SOAP token:", error.message);
    throw new Error(`Failed to fetch SOAP token: ${error.message}`);
  }
}

async function soapensureToken() {
  if (!soapAccessToken || Date.now() >= soapTokenExpiryTime) {
    await getSoapToken();
  }
}

async function postFlightData(flightUrl, requestData) {
  await ensureToken(); // Ensure token is valid
  try {
    const response = await fetch(flightUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestData),
    });
    if (!response.ok) {
      const errorDetails = await response.text();

      throw new Error(`Failed to post flight data. Status: ${errorDetails}`);
    }

    const flightData = await response.json();
    return flightData;
  } catch (error) {
    throw new Error(`Failed to post flight data: ${error}`);
  }
}

async function postSabreFlightData(req, res) {
  await ensureToken();
  const {
    pcc,
    start_date,
    end_date,
    adult,
    children,
    infants,
    dept,
    arrival,
    includedAirlineCodes,
    staffMarkupValue,
    staffMarkupType,
    type,
  } = req.query;

  let airlineLogoMap = {};
  try {
    airlineLogo.forEach(({ arCode, logo, ar }) => {
      airlineLogoMap[arCode] = { ar, logo };
    });
  } catch (error) {
    console.error("Error processing airline logo data:", error);
  }

  const findMakrup = await Markup.findOne({
    api: { $in: ["sabre", "all"] },
    status: "ACTIVE",
  });
  const findagency = await Agency.findById(req.user.agencyId);
  let label = findagency ? findagency.showLabel : null;
  if (findMakrup) {
    let markupType = findMakrup.markupType;
  }

  let data = {
    OTA_AirLowFareSearchRQ: {
      ResponseVersion: "v4",
      ResponseType: "GIR",
      Version: "3",
      POS: {
        Source: [
          {
            PseudoCityCode: `${SABRE.SABRE_PCC}`,
            RequestorID: {
              Type: "1",
              ID: "1",
              CompanyName: { Code: "TN" },
            },
          },
        ],
      },
      AvailableFlightsOnly: true,
      OriginDestinationInformation: [
        {
          RPH: "1",
          DepartureDateTime: `${start_date}T00:00:00`,
          OriginLocation: { LocationCode: `${dept}` },
          DestinationLocation: { LocationCode: `${arrival}` },
        },
      ],
      TravelPreferences: {
        VendorPref: includedAirlineCodes
          ? [{ Code: includedAirlineCodes }]
          : [],
        TPA_Extensions: {
          PreferNDCSourceOnTie: { Value: true },
          DataSources: { NDC: "Disable", ATPCO: "Enable", LCC: "Enable" },
        },
        Baggage: { CarryOnInfo: true },
        ETicketDesired: true,
        MaxStopsQuantity: 5,
      },
      TravelerInfoSummary: {
        PriceRequestInformation: {
          TPA_Extensions: {
            BrandedFareIndicators: {
              SingleBrandedFare: true,
              MultipleBrandedFares: true,
              ReturnBrandAncillaries: true,
            },
          },
        },
        AirTravelerAvail: [
          {
            PassengerTypeQuantity: [{ Code: "ADT", Quantity: Number(adult) }],
          },
        ],
      },
      TPA_Extensions: {
        IntelliSellTransaction: { RequestType: { Name: "50ITINS" } },
      },
    },
  };

  if (Number(children) > 0) {
    data.OTA_AirLowFareSearchRQ.TravelerInfoSummary.AirTravelerAvail[0].PassengerTypeQuantity.push(
      {
        Code: "CNN",
        Quantity: Number(children),
      }
    );
  }
  if (Number(infants) > 0) {
    data.OTA_AirLowFareSearchRQ.TravelerInfoSummary.AirTravelerAvail[0].PassengerTypeQuantity.push(
      {
        Code: "INF",
        Quantity: Number(infants),
      }
    );
  }
  if (end_date) {
    data.OTA_AirLowFareSearchRQ.OriginDestinationInformation.push({
      RPH: "2",
      DepartureDateTime: `${end_date}T00:00:00`,
      OriginLocation: { LocationCode: arrival },
      DestinationLocation: { LocationCode: dept },
    });
  }
  if (type) {
    data.OTA_AirLowFareSearchRQ.TravelPreferences.CabinPref = [
      { Cabin: `${type}`, PreferLevel: "Preferred" },
    ];
  }

  try {
    const flightData = await postFlightData(
      `${SABRE.BASE_URL}/v4/offers/shop`,
      data
    );
    if (flightData.groupedItineraryResponse.statistics.itineraryCount <= 0) {
      return errorResponse(res, "No ticket found", 200);
    }

    const legsDesc = flightData.groupedItineraryResponse.legDescs;
    const scheduleDescs =
      flightData.groupedItineraryResponse.scheduleDescs ?? [];
    const itineraries =
      flightData.groupedItineraryResponse.itineraryGroups[0].itineraries ?? [];
    const taxDescriptions =
      flightData.groupedItineraryResponse.taxSummaryDescs ?? [];
    const groupDescription =
      flightData.groupedItineraryResponse.itineraryGroups[0].groupDescription
        .legDescriptions ?? [];
    const baggageAllowanceDesc =
      flightData?.groupedItineraryResponse.baggageAllowanceDescs;
    const fareComponentDescs =
      flightData?.groupedItineraryResponse.fareComponentDescs;
    const brandFeatureDescs =
      flightData?.groupedItineraryResponse.brandFeatureDescs;
    const processedItineraries = itineraries.map((itinerary) => {
      const uniqueId = v4();
      const departureLeg = legsDesc.find(
        (leg) => leg.id === itinerary.legs[0].ref
      );
      const returnLeg =
        itinerary.legs.length > 1
          ? legsDesc.find((leg) => leg.id === itinerary.legs[1].ref)
          : null;
      const brandedFare = itinerary?.pricingInformation
        ?.map((data) => {
          if (data.fare) {
            let a, b, c, d, e;
            return {
              data: data.fare.passengerInfoList.map((passengerInfo) => {
                const passengerDetails = passengerInfo.passengerInfo;
                const fareComponents = passengerDetails.fareComponents.map(
                  (fareComponent) => {
                    const segments = fareComponent.segments.map(
                      (segmentData) => {
                        return {
                          bookingCode: segmentData.segment.bookingCode,
                          seatsAvailable: segmentData.segment.seatsAvailable,
                        };
                      }
                    );

                    return {
                      ref: fareComponent.ref,
                      beginAirport: fareComponent.beginAirport,
                      endAirport: fareComponent.endAirport,
                      segments,
                    };
                  }
                );

                // Fetch the marketing flight details
                const marketingFlightDetails = data.soldOut?.soldOutLegs?.map(
                  (soldOutLeg) => {
                    return soldOutLeg.soldOutSchedules.map((schedule) => ({
                      brandName: schedule.brandName,
                      programId: schedule.programId,
                      programCode: schedule.programCode,
                      programDescription: schedule.programDescription,
                      programSystemCode: schedule.programSystemCode,
                    }));
                  }
                );

                // Additional required details
                (a =
                  passengerDetails.fareComponents[0].segments[0].segment
                    .seatsAvailable), // Total available seats
                  (b = getBaggageInfo(
                    passengerDetails.baggageInformation,
                    baggageAllowanceDesc
                  )), // Total available seats
                  (c =
                    passengerDetails.fareComponents[0].segments[0].segment
                      .mealCode);
                d = passengerDetails.nonRefundable; // Total available seats
                e = getbrandNameInfo(
                  passengerDetails.fareComponents,
                  fareComponentDescs
                );
                return {
                  fareComponents,
                  passengerType: passengerDetails.passengerType,
                  passengerNumber: passengerDetails.passengerNumber,
                  nonRefundable: passengerDetails.nonRefundable,
                  brandName: getbrandNameInfo(
                    passengerDetails.fareComponents,
                    fareComponentDescs
                  ),

                  baggageInformation: getBaggageInfo(
                    passengerDetails.baggageInformation,
                    baggageAllowanceDesc
                  ),
                  brandFeatures: getbrandFeatures(
                    passengerDetails.fareComponents,
                    brandFeatureDescs
                  ),
                  fare: passengerDetails.passengerTotalFare.totalFare, // Total fare
                  taxAmount: passengerDetails.passengerTotalFare.totalTaxAmount, // Total fare

                  totalSeats:
                    passengerDetails.fareComponents[0].segments[0].segment
                      .seatsAvailable, // Total available seats
                  bookingCode:
                    passengerDetails.fareComponents[0].segments[0].segment
                      .bookingCode, // Total available seats
                  meal: passengerDetails.fareComponents[0].segments[0].segment
                    .mealCode, // Total available seats
                };
              }),
              totalFare: data.fare.totalFare.totalPrice,
              refundable: d,
              meal: c,
              baggage: b,
              seats: a,
              brandName: e,
            };
          }
          return null;
        })
        .filter(Boolean);

      const pricingInfo = itinerary?.pricingInformation?.[0]?.fare;
      const adults = pricingInfo?.passengerInfoList.find(
        (p) => p.passengerInfo.passengerType === "ADT"
      );
      const children = pricingInfo?.passengerInfoList.find(
        (p) => p.passengerInfo.passengerType === "CNN"
      );
      const infants = pricingInfo?.passengerInfoList.find(
        (p) => p.passengerInfo.passengerType === "INF"
      );

      let adultTotalSeatsAvailable = 0;
      let adultMealInfo = [];
      let adultIsRefundable = true;
      let adultCabin = [];
      let adultBookingCode = [];
      let adultBaggage = getBaggageInfo(
        adults.passengerInfo.baggageInformation,
        baggageAllowanceDesc
      );

      // Check if passenger information has refundable status
      adultIsRefundable = !adults?.passengerInfo.nonRefundable;

      // Extract segment details from fareComponents
      adults?.passengerInfo.fareComponents.forEach((fareComponent) => {
        fareComponent.segments.forEach((segmentData) => {
          const segment = segmentData.segment;
          adultTotalSeatsAvailable += segment?.seatsAvailable || 0;
          // Collect meal codes if available
          if (segment?.mealCode) {
            adultMealInfo.push(segment.mealCode);
          }
          if (segment.cabinCode) adultCabin.push(segment.cabinCode);
          if (segment.bookingCode) adultBookingCode.push(segment.bookingCode);
        });
      });
      adults.passengerInfo.passengerInfo;
      ////////////////////////////////////////////////////////////////////////////////////////////////////
      let childTotalSeatsAvailable = 0;
      let childMealInfo = [];
      let childIsRefundable = true;
      let childCabin = [];
      let childBaggage;

      if (children) {
        childBaggage = getBaggageInfo(
          children.passengerInfo.baggageInformation,
          baggageAllowanceDesc
        );
        // Check if passenger information has refundable status
        childIsRefundable = !adults?.passengerInfo.nonRefundable;

        // Extract segment details from fareComponents
        children?.passengerInfo.fareComponents.forEach((fareComponent) => {
          fareComponent.segments.forEach((segmentData) => {
            const segment = segmentData.segment;
            childTotalSeatsAvailable += segment?.seatsAvailable || 0;

            // Collect meal codes if available
            if (segment?.mealCode) {
              childMealInfo.push(segment.mealCode);
            }
            if (segment.cabinCode)
              childCabin.push(
                cabinTypeMap[segment.cabinCode] || segment.cabinCode
              ); // Map cabin code to full name
          });
        });
      }
      let infantTotalSeatsAvailable = 0;
      let infantMealInfo = [];
      let infantIsRefundable = true;
      let infantCabin = [];
      let infantBaggage;
      if (infants) {
        infantBaggage = getBaggageInfo(
          infants.passengerInfo.baggageInformation,
          baggageAllowanceDesc
        );
        // Check if passenger information has refundable status
        infantIsRefundable = !adults?.passengerInfo.nonRefundable;

        // Extract segment details from fareComponents
        infants?.passengerInfo.fareComponents.forEach((fareComponent) => {
          fareComponent.segments.forEach((segmentData) => {
            const segment = segmentData.segment;
            infantTotalSeatsAvailable += segment?.seatsAvailable || 0;

            // Collect meal codes if available
            if (segment?.mealCode) {
              infantMealInfo.push(segment.mealCode);
            }
            if (segment.cabinCode)
              infantCabin.push(
                cabinTypeMap[segment.cabinCode] || segment.cabinCode
              ); // Map cabin code to full name
          });
        });
      }

      const departureFlightDetails = departureLeg.schedules.map((schedule) => {
        return scheduleDescs.find((desc) => desc.id === schedule.ref);
      });
      const returnFlightDetails = returnLeg
        ? returnLeg.schedules.map((schedule) => {
            return scheduleDescs.find((desc) => desc.id === schedule.ref);
          })
        : null;
      let marketingCarrier;

      departureFlightDetails.map((detail) => {
        marketingCarrier = detail.carrier.marketing;
      });

      const airlineData = airlineLogoMap[marketingCarrier] || {
        arCode: marketingCarrier,
        logo: "default_logo_url",
      };
      const departure = departureFlightDetails.map((detail) => ({
        marketingCarrier: detail.carrier.marketing,
        departureTime: convertToISODateTime(detail.departure.time, start_date),
        arrivalTime: convertToISODateTime(detail.arrival.time, start_date),
        departureLocation: detail.departure.airport,
        arrivalLocation: detail.arrival.airport,
        marketingFlightNumber: detail.carrier.marketingFlightNumber,
        marketing: detail.carrier.marketing,
        elapsedTime: convertMinutesToISODuration(detail.elapsedTime),
        stopCount: detail.stopCount,
      }));

      const returnFlight = returnFlightDetails
        ? returnFlightDetails.map((detail) => ({
            departureTime: convertToISODateTime(
              detail.departure.time,
              end_date
            ),
            arrivalTime: convertToISODateTime(detail.arrival.time, end_date),
            departureLocation: detail.departure.airport,
            arrivalLocation: detail.arrival.airport,
            marketingFlightNumber: detail.carrier.marketingFlightNumber,
            marketing: detail.carrier.marketing,
            elapsedTime: convertMinutesToISODuration(detail.elapsedTime),
            stopCount: detail.stopCount,
          }))
        : null;

      const adjustedPrice = calculateAdjustedPrice(
        pricingInfo.totalFare.totalPrice,
        findMakrup,
        staffMarkupValue,
        staffMarkupType
      );

      const ticketTaxes = pricingInfo.passengerInfoList
        .flatMap((p) => p.passengerInfo?.taxes || []) // Use optional chaining and fallback to an empty array
        .map((tax) => {
          const taxDetail = taxDescriptions.find((desc) => desc.id === tax.ref);
          return {
            amount: taxDetail ? taxDetail.amount : 0,
            code: taxDetail ? taxDetail.code : "N/A",
            description: taxDetail ? taxDetail.description : "N/A",
            currency: taxDetail ? taxDetail.currency : "N/A",
            publishedAmount: taxDetail ? taxDetail.publishedAmount : "N/A",
            publishedCurrency: taxDetail ? taxDetail.publishedCurrency : "N/A",
            station: taxDetail ? taxDetail.station : "N/A",
            country: taxDetail ? taxDetail.country : "N/A",
          };
        });
      return {
        api: "sabre",
        uuid: uniqueId,
        brandedFare,
        arCode: airlineData.ar,
        logo: airlineData.logo,
        departure,
        return: returnFlight,
        totalFare: pricingInfo.totalFare.totalPrice,
        passengerTotalFare: adjustedPrice,
        baseFare: pricingInfo.totalFare.equivalentAmount,
        totalTax: pricingInfo.totalFare.totalTaxAmount,
        taxSummaries: ticketTaxes,

        extra: {
          adult: {
            count: adults ? adults.passengerInfo.passengerNumber : 0,
            Price: adults
              ? adults.passengerInfo.passengerTotalFare.totalFare
              : 0,
            isRefundable: adultIsRefundable,
            meal: adultMealInfo.length
              ? adultMealInfo
              : ["No meal info available"],
            cabin: adultCabin,
            totalSeat: adultTotalSeatsAvailable,
            baggage: adultBaggage,
          },
          child: {
            count: children ? children.passengerInfo.passengerNumber : 0,
            Price: children
              ? children.passengerInfo.passengerTotalFare.totalFare
              : null,
            isRefundable: children ? childIsRefundable : null,
            meal: children
              ? childMealInfo.length
                ? childMealInfo
                : ["No meal info available"]
              : null,
            cabin: children ? childCabin : null,
            totalSeat: children ? childTotalSeatsAvailable : null,
            baggage: children ? childBaggage : null,
          },
          infants: {
            count: infants ? infants.passengerInfo.passengerNumber : null,
            Price: infants
              ? infants.passengerInfo.passengerTotalFare.totalFare
              : null,
            isRefundable: infants ? infantIsRefundable : null,
            meal: infants
              ? infantMealInfo.length
                ? infantMealInfo
                : ["No meal info available"]
              : null,
            cabin: infants ? infantCabin : null,
            totalSeat: infants ? infantTotalSeatsAvailable : null,
            baggage: infants ? infantBaggage : null,
          },
        },

        itineraries: [
          {
            departure: departure,
            cabin: adultCabin,
            bookingCode: adultBookingCode,
            return: returnFlight,
            totalFare: pricingInfo.totalFare.totalPrice,
            adjustedPrice,
          },
        ],
      };
    });

    return successResponse(res, "Flight data fetched successfully", {
      ticket: processedItineraries,
    });
  } catch (error) {
    console.error("Error fetching flight data:", error);
    return errorResponse(res, error);
  }
}

function calculateAdjustedPrice(
  price,
  markup,
  staffMarkupValue,
  staffMarkupType
) {
  if (markup) {
    const markupAmount =
      markup.markupType === "percentage"
        ? (price * markup.markupValue) / 100
        : markup.markupValue;
    price += markupAmount;
  }
  if (staffMarkupValue) {
    const staffMarkup =
      staffMarkupType === "percentage"
        ? (price * Number(staffMarkupValue)) / 100
        : Number(staffMarkupValue);
    price += staffMarkup;
  }
  return price;
}

async function postSabreFlightDataM(req, res) {
  await ensureToken();
  let marketingCarrier;
  const {
    pcc,
    adultsCount,
    childrenCount,
    infantsCount,
    dept,
    arrival,
    multicityFlights,
    includedAirlineCodes,
    staffMarkupValue,
    staffMarkupType,
  } = req.body;

  let adjustedPrice = 0;

  // Retrieve markup details
  const findMarkup = await Markup.findOne({
    api: { $in: ["sabre", "all"] },
    status: "ACTIVE",
  });
  let markupType;
  if (findMarkup) {
    markupType = findMarkup.markupType;
  }

  // Prepare airline logo mapping
  let airlineLogoMap = {};
  try {
    airlineLogo.forEach(({ arCode, logo, ar }) => {
      airlineLogoMap[arCode] = { ar, logo };
    });
  } catch (error) {
    console.error("Error processing airline logo data:", error);
  }

  // Set up the data payload for the Sabre API request
  let data = {
    OTA_AirLowFareSearchRQ: {
      ResponseVersion: "v4",
      ResponseType: "GIR",
      Version: "3",
      POS: {
        Source: [
          {
            PseudoCityCode: `${SABRE.SABRE_PCC}`,
            RequestorID: {
              Type: "1",
              ID: "1",
              CompanyName: { Code: "TN" },
            },
          },
        ],
      },
      AvailableFlightsOnly: true,
      OriginDestinationInformation: multicityFlights, // This supports multiple legs
      TravelPreferences: {
        TPA_Extensions: {
          NumTrips: { Number: 10 },
          DataSources: {
            NDC: "Enable",
            ATPCO: "Enable",
            LCC: "Enable",
          },
          PreferNDCSourceOnTie: { Value: true },
        },
        Baggage: { CarryOnInfo: true },
        ETicketDesired: true,
        MaxStopsQuantity: 0,
      },
      TravelerInfoSummary: {
        PriceRequestInformation: {
          TPA_Extensions: {
            BrandedFareIndicators: {
              SingleBrandedFare: true,
              MultipleBrandedFares: true,
              ReturnBrandAncillaries: true,
            },
          },
        },
        AirTravelerAvail: [
          {
            PassengerTypeQuantity: [
              { Code: "ADT", Quantity: Number(adultsCount) },
            ],
          },
        ],
      },
      TPA_Extensions: {
        IntelliSellTransaction: {
          RequestType: { Name: "50ITINS" },
        },
      },
    },
  };

  // Add children and infants if provided
  if (Number(childrenCount) > 0) {
    data.OTA_AirLowFareSearchRQ.TravelerInfoSummary.AirTravelerAvail[0].PassengerTypeQuantity.push(
      {
        Code: "CNN",
        Quantity: Number(childrenCount),
      }
    );
  }
  if (Number(infantsCount) > 0) {
    data.OTA_AirLowFareSearchRQ.TravelerInfoSummary.AirTravelerAvail[0].PassengerTypeQuantity.push(
      {
        Code: "INF",
        Quantity: Number(infantsCount),
      }
    );
  }

  try {
    const flightData = await postFlightData(
      `${SABRE.BASE_URL}/v4/offers/shop`,
      data
    );

    // Extract relevant data for processing
    const { groupedItineraryResponse } = flightData || {};
    const baggageAllowanceDesc =
      groupedItineraryResponse?.baggageAllowanceDescs || [];
    const scheduleDescs = groupedItineraryResponse?.scheduleDescs || [];
    const fareComponentDescs =
      flightData?.groupedItineraryResponse.fareComponentDescs;
    const brandFeatureDescs =
      flightData?.groupedItineraryResponse.brandFeatureDescs;
    const itineraries =
      groupedItineraryResponse?.itineraryGroups?.[0]?.itineraries || [];
    const groupDescription =
      groupedItineraryResponse?.itineraryGroups?.[0]?.groupDescription
        ?.legDescriptions || [];
    const legDescs = groupedItineraryResponse?.legDescs || [];
    // Process each itinerary
    const processedItineraries = itineraries.map((itinerary) => {
      const legs = itinerary?.legs?.map((leg) => leg?.ref) ?? [];

      const pricingInfo = itinerary?.pricingInformation?.[0]?.fare;
      const adults = pricingInfo?.passengerInfoList.find(
        (p) => p.passengerInfo.passengerType === "ADT"
      );
      const children = pricingInfo?.passengerInfoList.find(
        (p) => p.passengerInfo.passengerType === "CNN"
      );
      const infants = pricingInfo?.passengerInfoList.find(
        (p) => p.passengerInfo.passengerType === "INF"
      );
      const brandedFare = itinerary?.pricingInformation
        ?.map((data) => {
          if (data.fare) {
            let a, b, c, d, e;
            return {
              data: data.fare.passengerInfoList.map((passengerInfo) => {
                const passengerDetails = passengerInfo.passengerInfo;
                const fareComponents = passengerDetails.fareComponents.map(
                  (fareComponent) => {
                    const segments = fareComponent.segments.map(
                      (segmentData) => {
                        return {
                          bookingCode: segmentData.segment.bookingCode,
                          seatsAvailable: segmentData.segment.seatsAvailable,
                        };
                      }
                    );

                    return {
                      ref: fareComponent.ref,
                      beginAirport: fareComponent.beginAirport,
                      endAirport: fareComponent.endAirport,
                      segments,
                    };
                  }
                );

                // Fetch the marketing flight details
                const marketingFlightDetails = data.soldOut?.soldOutLegs?.map(
                  (soldOutLeg) => {
                    return soldOutLeg.soldOutSchedules.map((schedule) => ({
                      brandName: schedule.brandName,
                      programId: schedule.programId,
                      programCode: schedule.programCode,
                      programDescription: schedule.programDescription,
                      programSystemCode: schedule.programSystemCode,
                    }));
                  }
                );

                // Additional required details
                (a =
                  passengerDetails.fareComponents[0].segments[0].segment
                    .seatsAvailable), // Total available seats
                  (b = getBaggageInfo(
                    passengerDetails.baggageInformation,
                    baggageAllowanceDesc
                  )), // Total available seats
                  (c =
                    passengerDetails.fareComponents[0].segments[0].segment
                      .mealCode);
                d = passengerDetails.nonRefundable; // Total available seats
                e = getbrandNameInfo(
                  passengerDetails.fareComponents,
                  fareComponentDescs
                );
                return {
                  fareComponents,
                  passengerType: passengerDetails.passengerType,
                  passengerNumber: passengerDetails.passengerNumber,
                  nonRefundable: passengerDetails.nonRefundable,
                  brandName: getbrandNameInfo(
                    passengerDetails.fareComponents,
                    fareComponentDescs
                  ),

                  baggageInformation: getBaggageInfo(
                    passengerDetails.baggageInformation,
                    baggageAllowanceDesc
                  ),
                  brandFeatures: getbrandFeatures(
                    passengerDetails.fareComponents,
                    brandFeatureDescs
                  ),
                  fare: passengerDetails.passengerTotalFare.totalFare, // Total fare
                  taxAmount: passengerDetails.passengerTotalFare.totalTaxAmount, // Total fare

                  totalSeats:
                    passengerDetails.fareComponents[0].segments[0].segment
                      .seatsAvailable, // Total available seats
                  bookingCode:
                    passengerDetails.fareComponents[0].segments[0].segment
                      .bookingCode, // Total available seats
                  meal: passengerDetails.fareComponents[0].segments[0].segment
                    .mealCode, // Total available seats
                };
              }),
              totalFare: data.fare.totalFare.totalPrice,
              refundable: d,
              meal: c,
              baggage: b,
              seats: a,
              brandName: e,
            };
          }
          return null;
        })
        .filter(Boolean);

      // Extract total available seats, meal info, and refundability
      let adultTotalSeatsAvailable = 0;
      let adultMealInfo = [];
      let adultIsRefundable = true;
      let adultBookingCode = [];

      let adultCabin = [];
      let adultBaggage = getBaggageInfo(
        adults.passengerInfo.baggageInformation,
        baggageAllowanceDesc
      );

      // Check if passenger information has refundable status
      adultIsRefundable = !adults?.passengerInfo.nonRefundable;

      // Extract segment details from fareComponents
      adults?.passengerInfo.fareComponents.forEach((fareComponent) => {
        fareComponent.segments.forEach((segmentData) => {
          const segment = segmentData.segment;
          adultTotalSeatsAvailable += segment?.seatsAvailable || 0;

          // Collect meal codes if available
          if (segment?.mealCode) {
            adultMealInfo.push(segment.mealCode);
          }
          if (segment.bookingCode) adultBookingCode.push(segment.bookingCode);

          if (segment?.cabinCode)
            adultCabin.push(
              cabinTypeMap[segment.cabinCode] || segment.cabinCode
            );
        });
      });
      adults.passengerInfo.passengerInfo;
      let childTotalSeatsAvailable = 0;
      let childMealInfo = [];
      let childIsRefundable = true;
      let childCabin = [];
      let childBaggage;

      if (children) {
        childBaggage = getBaggageInfo(
          children.passengerInfo.baggageInformation,
          baggageAllowanceDesc
        );
        // Check if passenger information has refundable status
        childIsRefundable = !adults?.passengerInfo.nonRefundable;

        // Extract segment details from fareComponents
        children?.passengerInfo.fareComponents.forEach((fareComponent) => {
          fareComponent.segments.forEach((segmentData) => {
            const segment = segmentData.segment;
            childTotalSeatsAvailable += segment?.seatsAvailable || 0;

            // Collect meal codes if available
            if (segment?.mealCode) {
              childMealInfo.push(segment.mealCode);
            }
            if (segment?.cabinCode) childCabin.push(segment.cabinCode); // Map cabin code to full name
          });
        });
      }
      let infantTotalSeatsAvailable = 0;
      let infantMealInfo = [];
      let infantIsRefundable = true;
      let infantCabin = [];
      let infantBaggage;
      if (infants) {
        infantBaggage = getBaggageInfo(
          infants.passengerInfo.baggageInformation,
          baggageAllowanceDesc
        );
        // Check if passenger information has refundable status
        infantIsRefundable = !adults?.passengerInfo.nonRefundable;

        // Extract segment details from fareComponents
        infants?.passengerInfo.fareComponents.forEach((fareComponent) => {
          fareComponent.segments.forEach((segmentData) => {
            const segment = segmentData.segment;
            infantTotalSeatsAvailable += segment?.seatsAvailable || 0;

            // Collect meal codes if available
            if (segment?.mealCode) {
              infantMealInfo.push(segment.mealCode);
            }
            if (segment?.cabinCode) infantCabin.push(segment.cabinCode); // Map cabin code to full name
          });
        });
      }
      // Map flight details for each leg in the itinerary
      const flights = legs.map((legRef, index) => {
        const legdesc = legDescs.find((leg) => leg.id === legRef);
        const departureScheduleInfo = scheduleDescs.find((schedule) => {
          if (legdesc.schedules[0].ref === schedule.id) {
            return schedule;
          }
        });
        marketingCarrier = departureScheduleInfo?.carrier?.marketing;
        const airlineData = airlineLogoMap[
          departureScheduleInfo?.carrier?.marketing
        ] || {
          arCode: departureScheduleInfo?.carrier?.marketing,
          logo: "default_logo_url",
        };

        return {
          departure: {
            time: departureScheduleInfo?.departure?.time,
            airport: departureScheduleInfo?.departure?.airport || "N/A",
            terminal: departureScheduleInfo?.departure?.terminal || "N/A",
            date: groupDescription[index].departureDate,
          },
          logo: {
            code: airlineData.ar,
            logo: airlineData.logo,
          },
          arrival: {
            time: departureScheduleInfo?.arrival?.time,
            date: groupDescription[index].departureDate,
            airport: departureScheduleInfo?.arrival?.airport || "N/A",
            terminal: departureScheduleInfo?.arrival?.terminal || "N/A",
          },
          marketingFlightNumber:
            departureScheduleInfo?.carrier?.marketingFlightNumber || "N/A",
          operatingCarrier: departureScheduleInfo?.carrier?.operating,
          operatingFlightNumber:
            departureScheduleInfo?.carrier?.operatingFlightNumber,
          marketing: departureScheduleInfo?.carrier?.marketing || "N/A",
          elapsedTime: convertMinutesToISODuration(
            departureScheduleInfo?.elapsedTime || 0
          ),
          stopCount: departureScheduleInfo?.stopCount || 0,
        };
      });

      // Calculate adjusted price based on markup type
      const basePrice = Number(
        itinerary?.pricingInformation?.[0]?.fare?.totalFare?.totalPrice || 0
      );
      const baseFare = Number(
        itinerary?.pricingInformation?.[0]?.fare?.totalFare?.equivalentAmount ||
          0
      );
      adjustedPrice = Number(
        itinerary?.pricingInformation?.[0]?.fare?.totalFare?.totalPrice || 0
      );
      // if (findMarkup) {
      //   adjustedPrice =
      //     markupType === EMarkupType.percentage
      //       ? basePrice + (basePrice * findMarkup.markupValue) / 100
      //       : basePrice + findMarkup.markupValue;
      // }
      adjustedPrice = calculateAdjustedPrice(
        itinerary?.pricingInformation?.[0]?.fare?.totalFare?.totalPrice,
        findMarkup,
        staffMarkupValue,
        staffMarkupType
      );

      // Fetch airline logo and details
      const airlineData = airlineLogoMap[marketingCarrier] || {
        arCode: marketingCarrier,
        logo: "default_logo_url",
      };

      return {
        api: "sabre",
        flights,
        arCode: airlineData.ar,
        logo: airlineData.logo,
        totalFare: basePrice,
        baseFare: baseFare,
        brandedFare,
        itineraries: flights.map((itinerary) => {
          console.log("itinerary....", itinerary);

          return {
            departure: itinerary,
            cabin: adultCabin,
            bookingCode: adultBookingCode,
            totalFare: basePrice,
            adjustedPrice: basePrice,
          };
        }),
        extra: {
          adult: {
            count: adults ? adults.passengerInfo.passengerNumber : 0,
            Price: adults
              ? adults.passengerInfo.passengerTotalFare.totalFare
              : 0,
            isRefundable: adultIsRefundable,
            meal: adultMealInfo.length
              ? adultMealInfo
              : ["No meal info available"],
            cabin: adultCabin,
            totalSeat: adultTotalSeatsAvailable,
            baggage: adultBaggage,
          },
          child: {
            count: children ? children.passengerInfo.passengerNumber : 0,
            Price: children
              ? children.passengerInfo.passengerTotalFare.totalFare
              : null,
            isRefundable: children ? childIsRefundable : null,
            meal: children
              ? childMealInfo.length
                ? childMealInfo
                : ["No meal info available"]
              : null,
            cabin: children ? childCabin : null,
            totalSeat: children ? childTotalSeatsAvailable : null,
            baggage: children ? childBaggage : null,
          },
          infants: {
            count: infants ? infants.passengerInfo.passengerNumber : null,
            Price: infants
              ? infants.passengerInfo.passengerTotalFare.totalFare
              : null,
            isRefundable: infants ? infantIsRefundable : null,
            meal: infants
              ? infantMealInfo.length
                ? infantMealInfo
                : ["No meal info available"]
              : null,
            cabin: infants ? infantCabin : null,
            totalSeat: infants ? infantTotalSeatsAvailable : null,
            baggage: infants ? infantBaggage : null,
          },
        },
        passengerTotalFare: adjustedPrice,
        taxSummaries:
          groupedItineraryResponse.taxSummaryDescs?.map((tax) => ({
            amount: tax?.amount || 0,
            description: tax?.description || "N/A",
          })) || [],
      };
    });

    return successResponse(res, "Flight data fetched successfully", {
      ticket: processedItineraries,
    });
  } catch (error) {
    console.error("Error fetching flight data:", error);
    return errorResponse(res, error);
  }
}

async function revalidateItinerary(req, res) {
  const { staffMarkupValue, staffMarkupType } = req.body;
  const findMakrup = await Markup.findOne({
    api: { $in: ["sabre", "all"] },
    status: "ACTIVE",
  });

  const findagency = await Agency.findById(req.user.agencyId);
  let label = findagency ? findagency.showLabel : null;
  if (findMakrup) {
    let markupType = findMakrup.markupType;
  }
  try {
    const findMarkup = await Markup.findOne({
      api: { $in: ["sabre", "all"] },
      status: "ACTIVE",
    });
    let markupType;
    if (findMarkup) {
      markupType = findMarkup.markupType;
    }
    let airlineLogoMap = {};
    try {
      airlineLogo.forEach(({ arCode, logo, ar }) => {
        airlineLogoMap[arCode] = { ar, logo };
      });
    } catch (error) {
      console.error("Error processing airline logo data:", error);
    }
    await ensureToken();
    const { adult, children, infants, OriginDestinationInformation } = req.body;

    const SeatsRequested = Number(adult) + Number(children) + Number(infants);
    let body = {
      OTA_AirLowFareSearchRQ: {
        Version: "4",
        POS: {
          Source: [
            {
              PseudoCityCode: `${SABRE.SABRE_PCC}`,
              RequestorID: {
                Type: "1",
                ID: "1",
                CompanyName: {
                  Code: "TN",
                  content: "TN",
                },
              },
            },
          ],
        },
        OriginDestinationInformation: OriginDestinationInformation,
        TravelPreferences: {
          ValidInterlineTicket: true,
          FlightTypePref: {
            MaxConnections: "0",
          },
        },
        TravelerInfoSummary: {
          SeatsRequested: [SeatsRequested],
          AirTravelerAvail: [
            {
              PassengerTypeQuantity: [
                {
                  Code: "ADT",
                  Quantity: Number(adult),
                },
              ],
            },
          ],
        },
        TPA_Extensions: {
          IntelliSellTransaction: {
            RequestType: {
              Name: "50ITINS",
            },
          },
        },
      },
    };

    if (Number(children) > 0) {
      body.OTA_AirLowFareSearchRQ.TravelerInfoSummary.AirTravelerAvail[0].PassengerTypeQuantity.push(
        { Code: "CNN", Quantity: Number(children) }
      );
    }
    if (Number(infants) > 0) {
      body.OTA_AirLowFareSearchRQ.TravelerInfoSummary.AirTravelerAvail[0].PassengerTypeQuantity.push(
        { Code: "INF", Quantity: Number(infants) }
      );
    }
    // return errorResponse(res, body, 404);
    const flightData = await postFlightData(
      `${SABRE.BASE_URL}/v4/shop/flights/revalidate`,
      body
    );
    // return err/orResponse(res, flightData, 404);
    let totalCount = Number(adult) + Number(children) + Number(infants);
    if (flightData.groupedItineraryResponse.statistics.itineraryCount <= 0) {
      return errorResponse(res, "No ticket found", 200);
    }
    if (req.body.type === "Multi City") {
      console.log("Multi City");
      const { groupedItineraryResponse } = flightData || {};
      const baggageAllowanceDesc =
        groupedItineraryResponse?.baggageAllowanceDescs || [];
      const scheduleDescs = groupedItineraryResponse?.scheduleDescs || [];
      const fareComponentDescs =
        flightData?.groupedItineraryResponse.fareComponentDescs;

      const itineraries =
        groupedItineraryResponse?.itineraryGroups?.[0]?.itineraries || [];
      const groupDescription =
        groupedItineraryResponse?.itineraryGroups?.[0]?.groupDescription
          ?.legDescriptions || [];
      const legDescs = groupedItineraryResponse?.legDescs || [];
      // Process each itinerary
      const processedItineraries = itineraries.map((itinerary) => {
        const legs = itinerary?.legs?.map((leg) => leg?.ref) ?? [];

        const pricingInfo = itinerary?.pricingInformation?.[0]?.fare;
        const adults = pricingInfo?.passengerInfoList.find(
          (p) => p.passengerInfo.passengerType === "ADT"
        );
        const children = pricingInfo?.passengerInfoList.find(
          (p) => p.passengerInfo.passengerType === "CNN"
        );
        const infants = pricingInfo?.passengerInfoList.find(
          (p) => p.passengerInfo.passengerType === "INF"
        );

        // Extract total available seats, meal info, and refundability
        let adultTotalSeatsAvailable = 0;
        let adultMealInfo = [];
        let adultIsRefundable = true;
        let adultCabin = [];
        let adultBookingCode = [];
        let adultBaggage = getBaggageInfo(
          adults.passengerInfo.baggageInformation,
          baggageAllowanceDesc
        );

        // Check if passenger information has refundable status
        adultIsRefundable = !adults?.passengerInfo.nonRefundable;

        // Extract segment details from fareComponents
        adults?.passengerInfo.fareComponents.forEach((fareComponent) => {
          fareComponent.segments.forEach((segmentData) => {
            const segment = segmentData.segment;
            adultTotalSeatsAvailable += segment?.seatsAvailable || 0;

            // Collect meal codes if available
            if (segment?.mealCode) {
              adultMealInfo.push(segment.mealCode);
            }
            if (segment.bookingCode) adultBookingCode.push(segment.bookingCode);

            if (segment?.cabinCode)
              adultCabin.push(
                cabinTypeMap[segment.cabinCode] || segment.cabinCode
              );
          });
        });
        adults.passengerInfo.passengerInfo;
        let childTotalSeatsAvailable = 0;
        let childMealInfo = [];
        let childIsRefundable = true;
        let childCabin = [];
        let childBaggage;

        if (children) {
          childBaggage = getBaggageInfo(
            children.passengerInfo.baggageInformation,
            baggageAllowanceDesc
          );
          // Check if passenger information has refundable status
          childIsRefundable = !adults?.passengerInfo.nonRefundable;

          // Extract segment details from fareComponents
          children?.passengerInfo.fareComponents.forEach((fareComponent) => {
            fareComponent.segments.forEach((segmentData) => {
              const segment = segmentData.segment;
              childTotalSeatsAvailable += segment?.seatsAvailable || 0;

              // Collect meal codes if available
              if (segment?.mealCode) {
                childMealInfo.push(segment.mealCode);
              }
              if (segment?.cabinCode) childCabin.push(segment.cabinCode); // Map cabin code to full name
            });
          });
        }
        let infantTotalSeatsAvailable = 0;
        let infantMealInfo = [];
        let infantIsRefundable = true;
        let infantCabin = [];
        let infantBaggage;
        if (infants) {
          infantBaggage = getBaggageInfo(
            infants.passengerInfo.baggageInformation,
            baggageAllowanceDesc
          );
          // Check if passenger information has refundable status
          infantIsRefundable = !adults?.passengerInfo.nonRefundable;

          // Extract segment details from fareComponents
          infants?.passengerInfo.fareComponents.forEach((fareComponent) => {
            fareComponent.segments.forEach((segmentData) => {
              const segment = segmentData.segment;
              infantTotalSeatsAvailable += segment?.seatsAvailable || 0;

              // Collect meal codes if available
              if (segment?.mealCode) {
                infantMealInfo.push(segment.mealCode);
              }
              if (segment?.cabinCode) infantCabin.push(segment.cabinCode); // Map cabin code to full name
            });
          });
        }
        // Map flight details for each leg in the itinerary
        const flights = legs.map((legRef, index) => {
          const legdesc = legDescs.find((leg) => leg.id === legRef);
          const departureScheduleInfo = scheduleDescs.find((schedule) => {
            if (legdesc.schedules[0].ref === schedule.id) {
              return schedule;
            }
          });
          marketingCarrier = departureScheduleInfo?.carrier?.marketing;
          const airlineData = airlineLogoMap[
            departureScheduleInfo?.carrier?.marketing
          ] || {
            arCode: departureScheduleInfo?.carrier?.marketing,
            logo: "default_logo_url",
          };

          return {
            departure: {
              time: departureScheduleInfo?.departure?.time,
              airport: departureScheduleInfo?.departure?.airport || "N/A",
              terminal: departureScheduleInfo?.departure?.terminal || "N/A",
              date: groupDescription[index].departureDate,
            },
            logo: {
              code: airlineData.ar,
              logo: airlineData.logo,
            },
            arrival: {
              time: departureScheduleInfo?.arrival?.time,
              date: groupDescription[index].departureDate,
              airport: departureScheduleInfo?.arrival?.airport || "N/A",
              terminal: departureScheduleInfo?.arrival?.terminal || "N/A",
            },
            marketingFlightNumber:
              departureScheduleInfo?.carrier?.marketingFlightNumber || "N/A",
            operatingCarrier: departureScheduleInfo?.carrier?.operating,
            operatingFlightNumber:
              departureScheduleInfo?.carrier?.operatingFlightNumber,
            marketing: departureScheduleInfo?.carrier?.marketing || "N/A",
            elapsedTime: convertMinutesToISODuration(
              departureScheduleInfo?.elapsedTime || 0
            ),
            stopCount: departureScheduleInfo?.stopCount || 0,
          };
        });

        // Calculate adjusted price based on markup type
        const basePrice = Number(
          itinerary?.pricingInformation?.[0]?.fare?.totalFare?.totalPrice || 0
        );
        const baseFare = Number(
          itinerary?.pricingInformation?.[0]?.fare?.totalFare
            ?.equivalentAmount || 0
        );
        adjustedPrice = Number(
          itinerary?.pricingInformation?.[0]?.fare?.totalFare?.totalPrice || 0
        );
        // if (findMarkup) {
        //   adjustedPrice =
        //     markupType === EMarkupType.percentage
        //       ? basePrice + (basePrice * findMarkup.markupValue) / 100
        //       : basePrice + findMarkup.markupValue;
        // }
        adjustedPrice = calculateAdjustedPrice(
          itinerary?.pricingInformation?.[0]?.fare?.totalFare?.totalPrice,
          findMarkup,
          staffMarkupValue,
          staffMarkupType
        );

        // Fetch airline logo and details
        const airlineData = airlineLogoMap[marketingCarrier] || {
          arCode: marketingCarrier,
          logo: "default_logo_url",
        };

        return {
          api: "sabre",
          flights,
          arCode: airlineData.ar,
          logo: airlineData.logo,
          totalFare: basePrice,
          baseFare: baseFare,
          extra: {
            adult: {
              count: adults ? adults.passengerInfo.passengerNumber : 0,
              Price: adults
                ? adults.passengerInfo.passengerTotalFare.totalFare
                : 0,
              isRefundable: adultIsRefundable,
              meal: adultMealInfo.length
                ? adultMealInfo
                : ["No meal info available"],
              cabin: adultCabin,
              totalSeat: adultTotalSeatsAvailable,
              baggage: adultBaggage,
            },
            child: {
              count: children ? children.passengerInfo.passengerNumber : 0,
              Price: children
                ? children.passengerInfo.passengerTotalFare.totalFare
                : null,
              isRefundable: children ? childIsRefundable : null,
              meal: children
                ? childMealInfo.length
                  ? childMealInfo
                  : ["No meal info available"]
                : null,
              cabin: children ? childCabin : null,
              totalSeat: children ? childTotalSeatsAvailable : null,
              baggage: children ? childBaggage : null,
            },
            infants: {
              count: infants ? infants.passengerInfo.passengerNumber : null,
              Price: infants
                ? infants.passengerInfo.passengerTotalFare.totalFare
                : null,
              isRefundable: infants ? infantIsRefundable : null,
              meal: infants
                ? infantMealInfo.length
                  ? infantMealInfo
                  : ["No meal info available"]
                : null,
              cabin: infants ? infantCabin : null,
              totalSeat: infants ? infantTotalSeatsAvailable : null,
              baggage: infants ? infantBaggage : null,
            },
          },
          itineraries: flights.map((itinerary) => {
            console.log("itinerary....", itinerary);

            return {
              departure: itinerary,
              cabin: adultCabin,
              bookingCode: adultBookingCode,
              totalFare: basePrice,
              count: totalCount,
              adjustedPrice: basePrice,
            };
          }),
          passengerTotalFare: adjustedPrice,
          taxSummaries:
            groupedItineraryResponse.taxSummaryDescs?.map((tax) => ({
              amount: tax?.amount || 0,
              description: tax?.description || "N/A",
            })) || [],
        };
      });

      return successResponse(res, "Flight data fetched successfully", {
        ticket: processedItineraries,
      });
    }
    //////////////////////////////////////////////////////////////////
    // return errorResponse(res, flightData, 404);
    const legsDesc = flightData.groupedItineraryResponse.legDescs;
    const scheduleDescs =
      flightData.groupedItineraryResponse.scheduleDescs ?? [];
    const itineraries =
      flightData.groupedItineraryResponse.itineraryGroups[0].itineraries ?? [];
    const taxDescriptions =
      flightData.groupedItineraryResponse.taxSummaryDescs ?? [];
    const groupDescription =
      flightData.groupedItineraryResponse.itineraryGroups[0].groupDescription
        .legDescriptions ?? [];
    const fareComponentDescs =
      flightData?.groupedItineraryResponse.fareComponentDescs;
    const baggageAllowanceDesc =
      flightData?.groupedItineraryResponse.baggageAllowanceDescs;
    const processedItineraries = itineraries.map((itinerary) => {
      const uniqueId = v4();
      const departureLeg = legsDesc.find(
        (leg) => leg.id === itinerary.legs[0].ref
      );
      const returnLeg =
        itinerary.legs.length > 1
          ? legsDesc.find((leg) => leg.id === itinerary.legs[1].ref)
          : null;
      const pricingInfo = itinerary?.pricingInformation?.[0]?.fare;
      const adults = pricingInfo?.passengerInfoList.find(
        (p) => p.passengerInfo.passengerType === "ADT"
      );
      const children = pricingInfo?.passengerInfoList.find(
        (p) => p.passengerInfo.passengerType === "CNN"
      );
      const infants = pricingInfo?.passengerInfoList.find(
        (p) => p.passengerInfo.passengerType === "INF"
      );

      let adultTotalSeatsAvailable = 0;
      let adultMealInfo = [];
      let adultIsRefundable = true;
      let adultCabin = [];
      let adultBookingCode = [];
      let adultBaggage = getBaggageInfo(
        adults.passengerInfo.baggageInformation,
        baggageAllowanceDesc
      );

      // Check if passenger information has refundable status
      adultIsRefundable = !adults?.passengerInfo.nonRefundable;

      // Extract segment details from fareComponents
      adults?.passengerInfo.fareComponents.forEach((fareComponent) => {
        fareComponent.segments.forEach((segmentData) => {
          const segment = segmentData.segment;
          adultTotalSeatsAvailable += segment?.seatsAvailable || 0;
          // Collect meal codes if available
          if (segment?.mealCode) {
            adultMealInfo.push(segment.mealCode);
          }
          if (segment.cabinCode) adultCabin.push(segment.cabinCode);
          if (segment.bookingCode) adultBookingCode.push(segment.bookingCode);
        });
      });
      adults.passengerInfo.passengerInfo;
      ////////////////////////////////////////////////////////////////////////////////////////////////////
      let childTotalSeatsAvailable = 0;
      let childMealInfo = [];
      let childIsRefundable = true;
      let childCabin = [];
      let childBaggage;

      if (children) {
        console.log("Child", children);
        childBaggage = getBaggageInfo(
          children.passengerInfo.baggageInformation,
          baggageAllowanceDesc
        );
        // Check if passenger information has refundable status
        childIsRefundable = !adults?.passengerInfo.nonRefundable;

        // Extract segment details from fareComponents
        children?.passengerInfo.fareComponents.forEach((fareComponent) => {
          fareComponent.segments.forEach((segmentData) => {
            const segment = segmentData.segment;
            childTotalSeatsAvailable += segment?.seatsAvailable || 0;

            // Collect meal codes if available
            if (segment?.mealCode) {
              childMealInfo.push(segment.mealCode);
            }
            if (segment.cabinCode)
              childCabin.push(
                cabinTypeMap[segment.cabinCode] || segment.cabinCode
              ); // Map cabin code to full name
          });
        });
      }
      let infantTotalSeatsAvailable = 0;
      let infantMealInfo = [];
      let infantIsRefundable = true;
      let infantCabin = [];
      let infantBaggage;
      if (infants) {
        infantBaggage = getBaggageInfo(
          infants.passengerInfo.baggageInformation,
          baggageAllowanceDesc
        );
        // Check if passenger information has refundable status
        infantIsRefundable = !adults?.passengerInfo.nonRefundable;

        // Extract segment details from fareComponents
        infants?.passengerInfo.fareComponents.forEach((fareComponent) => {
          fareComponent.segments.forEach((segmentData) => {
            const segment = segmentData.segment;
            infantTotalSeatsAvailable += segment?.seatsAvailable || 0;

            // Collect meal codes if available
            if (segment?.mealCode) {
              infantMealInfo.push(segment.mealCode);
            }
            if (segment.cabinCode)
              infantCabin.push(
                cabinTypeMap[segment.cabinCode] || segment.cabinCode
              ); // Map cabin code to full name
          });
        });
      }

      const departureFlightDetails = departureLeg.schedules.map((schedule) => {
        return scheduleDescs.find((desc) => desc.id === schedule.ref);
      });
      const returnFlightDetails = returnLeg
        ? returnLeg.schedules.map((schedule) => {
            return scheduleDescs.find((desc) => desc.id === schedule.ref);
          })
        : null;
      let marketingCarrier;

      departureFlightDetails.map((detail) => {
        marketingCarrier = detail.carrier.marketing;
      });

      const airlineData = airlineLogoMap[marketingCarrier] || {
        arCode: marketingCarrier,
        logo: "default_logo_url",
      };
      const departure = departureFlightDetails.map((detail, index) => ({
        marketingCarrier: detail.carrier.marketing,
        departureTime: convertToISODateTime(
          detail.departure.time,
          groupDescription[index]?.departureDate
        ),
        arrivalTime: convertToISODateTime(
          detail.arrival.time,
          groupDescription[index]?.departureDate
        ),
        departureLocation: detail.departure.airport,
        arrivalLocation: detail.arrival.airport,
        marketingFlightNumber: detail.carrier.marketingFlightNumber,
        marketing: detail.carrier.marketing,
        elapsedTime: convertMinutesToISODuration(detail.elapsedTime),
        stopCount: detail.stopCount,
      }));

      const returnFlight = returnFlightDetails
        ? returnFlightDetails.map((detail, index) => ({
            departureTime: convertToISODateTime(
              detail.departure.time,
              groupDescription[index + 1].departureDate
            ),
            arrivalTime: convertToISODateTime(
              detail.arrival.time,
              groupDescription[index + 1].departureDate
            ),
            marketingCarrier: detail.carrier.marketing,
            departureLocation: detail.departure.airport,
            arrivalLocation: detail.arrival.airport,
            marketingFlightNumber: detail.carrier.marketingFlightNumber,
            marketing: detail.carrier.marketing,
            elapsedTime: convertMinutesToISODuration(detail.elapsedTime),
            stopCount: detail.stopCount,
          }))
        : null;

      const adjustedPrice = calculateAdjustedPrice(
        pricingInfo.totalFare.totalPrice,
        findMakrup,
        staffMarkupValue,
        staffMarkupType
      );
      const ticketTaxes = pricingInfo.passengerInfoList
        .flatMap((p) => p.passengerInfo.taxes)
        .map((tax) => {
          const taxDetail = taxDescriptions.find(
            (desc) => desc?.id === tax?.ref
          );
          return {
            amount: taxDetail ? taxDetail.amount : 0,
            code: taxDetail ? taxDetail.code : "N/A",
            description: taxDetail ? taxDetail.description : "N/A",
            currency: taxDetail ? taxDetail.currency : "N/A",
            publishedAmount: taxDetail ? taxDetail.publishedAmount : "N/A",
            publishedCurrency: taxDetail ? taxDetail.publishedCurrency : "N/A",
            station: taxDetail ? taxDetail.station : "N/A",
            country: taxDetail ? taxDetail.country : "N/A",
          };
        });
      return {
        api: "sabre",
        uuid: uniqueId,
        arCode: airlineData.ar,
        logo: airlineData.logo,
        departure,
        return: returnFlight,
        totalFare: pricingInfo.totalFare.totalPrice,
        passengerTotalFare: adjustedPrice,
        baseFare: pricingInfo.totalFare.equivalentAmount,
        totalTax: pricingInfo.totalFare.totalTaxAmount,
        taxSummaries: ticketTaxes,

        extra: {
          adult: {
            count: adults ? adults.passengerInfo.passengerNumber : 0,
            Price: adults
              ? adults.passengerInfo.passengerTotalFare.totalFare
              : 0,
            isRefundable: adultIsRefundable,
            meal: adultMealInfo.length
              ? adultMealInfo
              : ["No meal info available"],
            cabin: adultCabin,
            totalSeat: adultTotalSeatsAvailable,
            baggage: adultBaggage,
          },
          child: {
            count: children ? children.passengerInfo.passengerNumber : 0,
            Price: children
              ? children.passengerInfo.passengerTotalFare.totalFare
              : null,
            isRefundable: children ? childIsRefundable : null,
            meal: children
              ? childMealInfo.length
                ? childMealInfo
                : ["No meal info available"]
              : null,
            cabin: children ? childCabin : null,
            totalSeat: children ? childTotalSeatsAvailable : null,
            baggage: children ? childBaggage : null,
          },
          infants: {
            count: infants ? infants.passengerInfo.passengerNumber : null,
            Price: infants
              ? infants.passengerInfo.passengerTotalFare.totalFare
              : null,
            isRefundable: infants ? infantIsRefundable : null,
            meal: infants
              ? infantMealInfo.length
                ? infantMealInfo
                : ["No meal info available"]
              : null,
            cabin: infants ? infantCabin : null,
            totalSeat: infants ? infantTotalSeatsAvailable : null,
            baggage: infants ? infantBaggage : null,
          },
        },

        itineraries: [
          {
            departure: departure,
            cabin: adultCabin,
            bookingCode: adultBookingCode,
            return: returnFlight,
            totalFare: pricingInfo.totalFare.totalPrice,
            adjustedPrice,
          },
        ],
      };
    });

    return successResponse(res, "Flight data fetched successfully", {
      ticket: processedItineraries,
    });
  } catch (error) {
    console.error("Error fetching flight data:", error);
    return errorResponse(res, error);
  }
}

function cleanDateString(dateString) {
  // Check if the string ends with 'Z' and remove it
  if (dateString.endsWith("Z")) {
    dateString = dateString.slice(0, -1); // Remove the last character ('Z')
  }

  // Check if the string contains '+' and remove everything after it
  if (dateString.includes("+")) {
    dateString = dateString.split("+")[0]; // Keep everything before '+'
  }

  return dateString;
}

async function brandedFares(req, res) {
  try {
    await soapensureToken();

    const sabreBody = `<?xml version="1.0" encoding="UTF-8"?>
    <soap-env:Envelope xmlns:soap-env="http://schemas.xmlsoap.org/soap/envelope/">
        <soap-env:Header>
            <wsse:Security xmlns:wsse="http://schemas.xmlsoap.org/ws/2002/12/secext">
                <wsse:BinarySecurityToken>${soapAccessToken}</wsse:BinarySecurityToken>
            </wsse:Security>
        </soap-env:Header>
        <soap-env:Body>
            <AllBrandsPricingRQ Version="1.1.4" xmlns="http://webservices.sabre.com/sabreXML/2003/07">
                <PriceRequestInformation>
                    <PassengerTypes>
                        <PassengerType Code="ADT" Count="2"/>
                    </PassengerTypes>
                </PriceRequestInformation>
            </AllBrandsPricingRQ>
        </soap-env:Body>
    </soap-env:Envelope>`;

    console.log("Request Body:", sabreBody);

    const soapResponse = await fetch(SABRE.SOAP_URL, {
      method: "POST",
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        Authorization: `Bearer ${soapAccessToken}`,
      },
      body: sabreBody,
    });

    const responseText = await soapResponse.text();
    console.log("Raw SOAP Response:", responseText);

    if (!soapResponse.ok) {
      throw new Error(
        `SOAP request failed with status ${soapResponse.status}: ${responseText}`
      );
    }

    // Parse the SOAP response
    const parser = new xml2js.Parser({ explicitArray: false });
    const parsedResponse = await parser.parseStringPromise(responseText);

    const allBrandsPricingRS =
      parsedResponse["soap-env:Envelope"]?.["soap-env:Body"]
        ?.AllBrandsPricingRS;

    if (!allBrandsPricingRS) {
      throw new Error("Invalid SOAP response structure");
    }

    return res.json({ status: "success", data: allBrandsPricingRS });
  } catch (error) {
    console.error("Error:", error.message);
    return res.status(500).json({
      status: "fail",
      error: error.message,
      message: "Internal Server Error",
    });
  }
}

async function postSabreCityData(req, res) {
  const { city } = req.query;
  await ensureToken(); // Ensure token is valid
  try {
    const response = await fetch(
      `${SABRE.BASE_URL}/v2/geo/autocomplete?query=${city}&category=AIR&limit=10&clientId=704295`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );
    if (!response.ok) {
      const errorDetails = await response.text();
      throw new Error("ERROR", errorDetails.message);
    }
    const data = await response.json();
    const formattedData = data.grouped["category:AIR"].doclist.docs;

    return successResponse(
      res,
      "City data fetched successfully",
      formattedData
    );
  } catch (error) {
    return errorResponse(res, error);
  }
}
function formatDate(dateString) {
  /**
   * Converts a date from YYYY-MM-DD format to DDMONYY format.
   *
   * @param {string} dateString - The input date as a string in YYYY-MM-DD format.
   * @returns {string} - The formatted date in DDMONYY format, or an error message if invalid.
   */
  try {
    // Check if dateString is valid
    if (!dateString || typeof dateString !== "string") {
      throw new Error(
        "Invalid input. Please provide a valid date string in YYYY-MM-DD format."
      );
    }

    // Split the input into components
    const [year, month, day] = dateString.split("-");

    // Validate input components
    if (
      !year ||
      !month ||
      !day ||
      year.length !== 4 ||
      month.length !== 2 ||
      day.length !== 2
    ) {
      throw new Error("Invalid date format. Please use YYYY-MM-DD.");
    }

    // Array of month abbreviations
    const months = [
      "JAN",
      "FEB",
      "MAR",
      "APR",
      "MAY",
      "JUN",
      "JUL",
      "AUG",
      "SEP",
      "OCT",
      "NOV",
      "DEC",
    ];

    // Convert month to name and ensure it's valid
    const monthIndex = parseInt(month, 10) - 1;
    if (monthIndex < 0 || monthIndex > 11) {
      throw new Error("Invalid month.");
    }
    const monthName = months[monthIndex];

    // Shorten the year to two digits
    const shortYear = year.slice(-2);

    // Return formatted string
    return `${day}${monthName}${shortYear}`;
  } catch (error) {
    return error.message;
  }
}

async function createBooking(req, res) {
  try {
    await ensureToken();
    let infant_firstName, infant_lastname, infant_DOB, child_DOB, child_index;

    const { data } = req.body;
    // if (
    //   !data ||
    //   !Array.isArray(data.flightOffers) ||
    //   data.flightOffers.length === 0
    // ) {
    //   return errorResponse(
    //     res,
    //     "Invalid or missing flight offers in the request.",
    //     400
    //   );
    // }

    // if (!Array.isArray(data.travelers) || data.travelers.length === 0) {
    //   return errorResponse(
    //     res,
    //     "Invalid or missing travelers in the request.",
    //     400
    //   );
    // }

    // Extract key data
    const flightOffers = data.flightOffers;
    console.log("flightOffers", flightOffers);
    const travelers = data.travelers;
    let count = 0;
    data.travelers.map((data) => {
      if (data.travelerType !== "INFANT") {
        count = count + 1;
      }
    });
    const contact = data.travelers[0].contact;
    let nada = [];
    let returnFlight = [];
    flightOffers.forEach((offer, index) => {
      if (offer.return) {
        offer.return.forEach((segment, segmentIndex) => {
          const arr1 = {
            DepartureDateTime: segment.departureTime.split("+")[0],
            ArrivalDateTime: segment.arrivalTime,
            FlightNumber: String(segment.marketingFlightNumber),
            NumberInParty: count.toString(),
            ResBookDesigCode: "Y",

            // ResBookDesigCode: offer.bookingCode[0],
            MarriageGrp: "O",
            Status: "NN",
            DestinationLocation: {
              LocationCode: segment.arrivalLocation,
            },
            MarketingAirline: {
              Code: segment.marketingCarrier,
              FlightNumber: String(segment.marketingFlightNumber),
            },
            OriginLocation: {
              LocationCode: segment.departureLocation,
            },
          };

          returnFlight.push(arr1);
        });
      }
    });
    flightOffers.forEach((offer, index) => {
      offer.departure.forEach((segment, segmentIndex) => {
        const arr1 = {
          DepartureDateTime: segment.departureTime.split("+")[0],
          ArrivalDateTime: segment.arrivalTime,
          FlightNumber: String(segment.marketingFlightNumber),
          NumberInParty: count.toString(),
          ResBookDesigCode: "Y",

          // ResBookDesigCode: offer.bookingCode[0],
          Status: "NN",
          DestinationLocation: {
            LocationCode: segment.arrivalLocation,
          },
          MarketingAirline: {
            Code: segment.marketingCarrier,
            FlightNumber: String(segment.marketingFlightNumber),
          },
          OriginLocation: {
            LocationCode: segment.departureLocation,
          },
        };

        nada.push(arr1);
      });
    });
    // Fetch agency and markup details
    const agency = await Agency.findById(req.user.agencyId);
    const findMarkup = await Markup.findOne({ api: { $in: ["sabre", "all"] } });
    const markupType = findMarkup?.markupType || "none";

    // Booking price calculations
    const price = flightOffers[0]?.totalFare || 0;
    let adjustedPrice = flightOffers[0]?.adjustedPrice || price;
    if (findMarkup?.airlines?.includes(flightOffers[0]?.marketing)) {
      adjustedPrice =
        markupType === "percentage"
          ? adjustedPrice + (adjustedPrice * findMarkup.markupValue) / 100
          : adjustedPrice + findMarkup.markupValue;
    }

    if (Number(agency.cashLimit) < adjustedPrice) {
      return errorResponse(
        res,
        "Insufficient balance. Please recharge your account.",
        404
      );
    }

    // Prepare passenger details
    const passengerNames = travelers.map((passenger, index) => {
      infant_firstName =
        getGenderCode(passenger.travelerType) === "INF"
          ? passenger.name.firstName.replace(" Mstr", "")
          : null;

      infant_lastname =
        getGenderCode(passenger.travelerType) === "INF"
          ? passenger.name.lastName
          : null;
      {
        passenger.travelerType === "INFANT"
          ? (infant_DOB = formatDate(passenger.dateOfBirth))
          : null;
      }
      {
        passenger.travelerType === "CHILD"
          ? (child_DOB = formatDate(passenger.dateOfBirth))
          : null;
      }
      {
        passenger.travelerType === "CHILD"
          ? (child_index = `${index + 1}.1`)
          : null;
      }
      return {
        NameNumber: `${index + 1}.1`,
        GivenName:
          getGenderCode(passenger.travelerType) === "INF"
            ? "INF"
            : passenger.name.firstName,

        Surname: passenger.name.lastName,
        // NameReference: `${passenger.name.firstName}${[index + 1]}`,
        PassengerType: getGenderCode(passenger.travelerType),
        NameReference:
          getGenderCode(passenger.travelerType) === "CNN"
            ? `C${calculateAgeInYears(passenger.dateOfBirth)}`
            : getGenderCode(passenger.travelerType) === "INF"
            ? `I${calculateAgeInMonths(passenger.dateOfBirth)}`
            : `A${calculateAgeInYears(passenger.dateOfBirth)}`,

        // Gender: passenger.gender || "M",
        Infant: getGenderCode(passenger.travelerType) === "INF" ? true : false,
      };
    });

    const specialReqDetails = {
      SpecialService: {
        SpecialServiceInfo: {
          SecureFlight: travelers.map((passenger, index) => ({
            SegmentNumber: "A",
            PersonName: {
              NameNumber:
                getGenderCode(passenger.travelerType) === "INF"
                  ? "1.1"
                  : `${index + 1}.1`,
              GivenName:
                getGenderCode(passenger.travelerType) === "INF"
                  ? "INF"
                  : passenger.name.firstName,
              DateOfBirth: passenger.dateOfBirth,
              Surname: passenger.name.lastName,
              // NameReference: `${passenger.name.firstName}${[index + 1]}`,
              Gender:
                getGenderCode(passenger.travelerType) === "INF"
                  ? "FI"
                  : passenger.gender?.charAt(0)?.toUpperCase(),
            },
          })),
          Service: [
            // {
            //   SSR_Code: "OTHS",
            //   Text: "CC Nada MANZOOR",
            //   PersonName: {
            //     NameNumber: "1.1",
            //   },
            //   SegmentNumber: "1",
            // },

            ...(infant_firstName
              ? [
                  {
                    SSR_Code: "INFT",
                    Text: `${infant_lastname}/${infant_firstName}/${infant_DOB}`,
                    PersonName: {
                      NameNumber: "1.1",
                    },
                  },
                ]
              : []),
            ...(child_DOB
              ? [
                  {
                    SSR_Code: "CHLD",
                    Text: `${child_DOB}`,
                    PersonName: { NameNumber: child_index },
                  },
                ]
              : []),
            // {
            //   SSR_Code: "OTHS",
            //   Text: "CC Ali MANZOOR",
            //   PersonName: {
            //     NameNumber: "1.1",
            //   },
            //   SegmentNumber: "1",
            // },
            {
              SSR_Code: "CTCM",
              // Text: `${contact.phones?.[0].number}`,
              Text: `3003790375`,
              PersonName: {
                NameNumber: "1.1",
              },
            },

            {
              SSR_Code: "CTCE",
              Text: `${data.emailAddress}`,
              PersonName: {
                NameNumber: "1.1",
              },
            },
          ],
          AdvancePassenger: travelers.map((passenger, index) => ({
            Document: {
              IssueCountry: passenger.documents?.[0]?.issuanceCountry,
              NationalityCountry: passenger.documents?.[0]?.nationality,
              ExpirationDate: passenger.documents?.[0]?.expiryDate,
              Number: passenger.documents?.[0]?.number,
              Type: passenger.documents?.[0]?.documentType,
            },
            PersonName: {
              NameNumber: `${index + 1}.1`,
              GivenName:
                getGenderCode(passenger.travelerType) === "INF"
                  ? passenger.name.firstName.replace("Mstr", "INF")
                  : passenger.name.firstName,
              Surname: passenger.name.lastName,
              LapChild:
                getGenderCode(passenger.travelerType) === "INF" ? true : false,
              Gender:
                getGenderCode(passenger.travelerType) === "INF"
                  ? `${passenger.gender?.charAt(0)?.toUpperCase()}I`
                  : passenger.gender?.charAt(0)?.toUpperCase(),
              DateOfBirth: passenger.dateOfBirth,
            },
            SegmentNumber: "A",
          })),
        },
      },
      // AddRemark: {
      //   RemarkInfo: {
      //     FOP_Remark: [
      //       {
      //         Type: "CASH",
      //       },
      //     ],
      //   },
      // },
    };
    /////////////////////////////////////////////////////////////////////////
    // Booking request payload
    const bookingRequest = {
      CreatePassengerNameRecordRQ: {
        version: "2.4.0",
        targetCity: `${SABRE.SABRE_PCC}`,
        haltOnAirPriceError: true,
        TravelItineraryAddInfo: {
          AgencyInfo: {
            Ticketing: { TicketType: "7TAW" },
            Address: {
              AddressLine: agency.address,
              CityName: agency.city,
              PostalCode: agency.poBoxNumber,
              VendorPrefs: {
                Airline: {
                  Hosted: true,
                },
              },
            },
          },
          CustomerInfo: {
            ContactNumbers: {
              ContactNumber: [
                {
                  NameNumber: "1.1",
                  Phone: "817-555-1212",
                  PhoneUseType: "9",
                },
              ],
            },
            PersonName: passengerNames,
            Email: [
              {
                Address: data.emailAddress,
                NameNumber: "1.1",
              },
            ],
          },
        },
        SpecialReqDetails: specialReqDetails,
        AirBook: {
          RetryRebook: {
            Option: true,
          },
          OriginDestinationInformation: {
            FlightSegment: [...nada, ...returnFlight],
          },
          RedisplayReservation: {
            NumAttempts: 5,
            WaitInterval: 100,
          },
        },
        AirPrice: [
          {
            PriceRequestInformation: {
              Retain: true,
              OptionalQualifiers: {
                FOP_Qualifiers: {
                  BasicFOP: {
                    Type: "CA",
                  },
                },
                PricingQualifiers: {
                  PassengerType: travelers.map((data) => ({
                    Code: getGenderCode(data.travelerType),
                    Quantity: "1",
                  })),
                },
              },
            },
          },
        ],
        PostProcessing: {
          EndTransaction: {
            Source: { ReceivedFrom: agency.agencyName || "API" },
            Email: {
              Ind: true,
            },
            // Email: {
            //   Itinerary: {
            //     PDF: {
            //       Ind: true,
            //     },
            //     Ind: true,
            //   },
            //   PersonName: {
            //     NameNumber: "1.1",
            //   },
            //   Ind: true,
            // },
          },
          RedisplayReservation: {},
          PricingInterval: {
            waitInterval: 100,
          },
        },
      },
    };
    // return errorResponse(res, bookingRequest, 404);

    // Send booking request to Sabre API
    const response = await fetch(
      `${SABRE.BASE_URL}/v2.4.0/passenger/records?mode=create`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(bookingRequest),
      }
    );
    const bookingData = await response.json();
    if (
      !response.ok ||
      bookingData.CreatePassengerNameRecordRS.ApplicationResults.status !==
        "Complete"
    ) {
      return errorResponse(res, bookingData, 404);
      return errorResponse(res, bookingRequest, 404);
    }

    const bookingId = bookingData.CreatePassengerNameRecordRS.ItineraryRef.ID;

    const newBooking = new Booking({
      type: "flight",
      api: "Sabre",
      userId: req.user._id,
      id: bookingId,
      status: ETicketStatus.HOLD,
      agencyId: req.user.agencyId || null,
      createdBy: req.user.role || null,
      originalPrice: price,
      finalPrice: adjustedPrice,
      markupType: markupType,
      markupAmount: findMarkup.markupValue,
      deptTime: flightOffers[0]?.departureTime || "",
      arrivalTime: flightOffers[0]?.arrivalTime || "",
      travelers: travelers.map((passenger, index) => ({
        id: `${index + 1}.1`,
        dateOfBirth: passenger.dateOfBirth,
        gender: passenger.gender,
        name: passenger.name,

        documents: [
          {
            number: passenger.documents?.[index]?.number || "",
            issuanceCountry:
              passenger.documents?.[index]?.issuanceLocation || "",
            nationality: passenger.documents?.[index]?.nationality || "",
            expiryDate: passenger.documents?.[index]?.expiryDate || "",
            issuanceDate: passenger.documents?.[index]?.issuanceDate,
            birthPlace: passenger.documents?.[index]?.birthPlace,
            documentType: "P",
          },
        ],
        contact: {
          phones: [
            { number: contact?.phones[0]?.number, deviceType: "MOBILE" },
          ],
          email: contact?.emailAddress,
        },
      })),
      flightOffers: [
        {
          itineraries: nada.map((data) => ({
            segments: [
              {
                departure: {
                  iataCode: data.OriginLocation.LocationCode,
                  at: data.DepartureDateTime,
                },
                arrival: {
                  iataCode: data.DestinationLocation.LocationCode,
                  at: data.ArrivalDateTime,
                },
                carrierCode: data.MarketingAirline.FlightNumber,
                number: data.MarketingAirline.FlightNumber,

                operating: {
                  carrierCode: data.MarketingAirline.Code,
                },
              },
            ],
          })),
        },
      ],
      contacts: [
        {
          addresseeName: { firstName: contact?.firstName || "N/A" },
          phones: contact?.phones || [],
        },
      ],
    });

    await newBooking.save();

    // Update agency cash limit
    // await Agency.findByIdAndUpdate(
    //   agency._id,
    //   { $inc: { cashLimit: -adjustedPrice } },
    //   { new: true, runValidators: true }
    // );

    return successResponse(res, "Flight booked successfully", bookingRequest);
  } catch (error) {
    console.error("Error in createBooking:", error);
    return errorResponse(res, error);
  }
}
async function createBookingM(req, res) {
  try {
    await ensureToken();
    let infant_firstName, infant_lastname, infant_DOB, child_DOB, child_index;

    const { data } = req.body;
    // if (
    //   !data ||
    //   !Array.isArray(data.flightOffers) ||
    //   data.flightOffers.length === 0
    // ) {
    //   return errorResponse(
    //     res,
    //     "Invalid or missing flight offers in the request.",
    //     400
    //   );
    // }

    // if (!Array.isArray(data.travelers) || data.travelers.length === 0) {
    //   return errorResponse(
    //     res,
    //     "Invalid or missing travelers in the request.",
    //     400
    //   );
    // }

    // Extract key data
    const flightOffers = data.flightOffers;
    console.log("flightOffers", flightOffers);
    const travelers = data.travelers;
    let count = 0;
    data.travelers.map((data) => {
      if (data.travelerType !== "INFANT") {
        count = count + 1;
      }
    });
    const contact = data.travelers[0].contact;
    let nada = [];

    flightOffers.forEach((offer, index) => {
      const arr1 = {
        DepartureDateTime: `${offer.departure.departure.date}T${
          offer.departure.departure.time.split("+")[0]
        }`,
        ArrivalDateTime: `${offer.departure.arrival.date}T${
          offer.departure.arrival.time.split("+")[0]
        }`,
        FlightNumber: String(offer.departure.marketingFlightNumber),
        NumberInParty: offer.count.toString(),
        // ResBookDesigCode: "Y",

        ResBookDesigCode: offer.departure.bookingCode[0],
        Status: "NN",
        DestinationLocation: {
          LocationCode: offer.departure.arrival.airport,
        },
        MarketingAirline: {
          Code: offer.departure.marketing,
          FlightNumber: String(offer.departure.marketingFlightNumber),
        },
        OriginLocation: {
          LocationCode: offer.departure.departure.airport,
        },
      };

      nada.push(arr1);
    });
    // Fetch agency and markup details
    const agency = await Agency.findById(req.user.agencyId);
    const findMarkup = await Markup.findOne({ api: { $in: ["sabre", "all"] } });
    const markupType = findMarkup?.markupType || "none";

    // Booking price calculations
    const price = flightOffers[0]?.totalFare || 0;
    let adjustedPrice = flightOffers[0]?.adjustedPrice || price;
    if (findMarkup?.airlines?.includes(flightOffers[0]?.marketing)) {
      adjustedPrice =
        markupType === "percentage"
          ? adjustedPrice + (adjustedPrice * findMarkup.markupValue) / 100
          : adjustedPrice + findMarkup.markupValue;
    }

    if (Number(agency.cashLimit) < adjustedPrice) {
      return errorResponse(
        res,
        "Insufficient balance. Please recharge your account.",
        404
      );
    }

    // Prepare passenger details
    const passengerNames = travelers.map((passenger, index) => {
      infant_firstName =
        getGenderCode(passenger.travelerType) === "INF"
          ? passenger.name.firstName.replace(" Mstr", "")
          : null;

      infant_lastname =
        getGenderCode(passenger.travelerType) === "INF"
          ? passenger.name.lastName
          : null;
      {
        passenger.travelerType === "INFANT"
          ? (infant_DOB = formatDate(passenger.dateOfBirth))
          : null;
      }
      {
        passenger.travelerType === "CHILD"
          ? (child_DOB = formatDate(passenger.dateOfBirth))
          : null;
      }
      {
        passenger.travelerType === "CHILD"
          ? (child_index = `${index + 1}.1`)
          : null;
      }
      return {
        NameNumber: `${index + 1}.1`,
        GivenName:
          getGenderCode(passenger.travelerType) === "INF"
            ? "INF"
            : passenger.name.firstName,

        Surname: passenger.name.lastName,
        // NameReference: `${passenger.name.firstName}${[index + 1]}`,
        PassengerType: getGenderCode(passenger.travelerType),
        NameReference:
          getGenderCode(passenger.travelerType) === "CNN"
            ? `C${calculateAgeInYears(passenger.dateOfBirth)}`
            : getGenderCode(passenger.travelerType) === "INF"
            ? `I${calculateAgeInMonths(passenger.dateOfBirth)}`
            : `A${calculateAgeInYears(passenger.dateOfBirth)}`,

        // Gender: passenger.gender || "M",
        Infant: getGenderCode(passenger.travelerType) === "INF" ? true : false,
      };
    });

    const specialReqDetails = {
      SpecialService: {
        SpecialServiceInfo: {
          SecureFlight: travelers.map((passenger, index) => ({
            SegmentNumber: "A",
            PersonName: {
              NameNumber:
                getGenderCode(passenger.travelerType) === "INF"
                  ? "1.1"
                  : `${index + 1}.1`,
              GivenName:
                getGenderCode(passenger.travelerType) === "INF"
                  ? "INF"
                  : passenger.name.firstName,
              DateOfBirth: passenger.dateOfBirth,
              Surname: passenger.name.lastName,
              // NameReference: `${passenger.name.firstName}${[index + 1]}`,
              Gender:
                getGenderCode(passenger.travelerType) === "INF"
                  ? "FI"
                  : passenger.gender?.charAt(0)?.toUpperCase(),
            },
          })),
          Service: [
            // {
            //   SSR_Code: "OTHS",
            //   Text: "CC Nada MANZOOR",
            //   PersonName: {
            //     NameNumber: "1.1",
            //   },
            //   SegmentNumber: "1",
            // },

            ...(infant_firstName
              ? [
                  {
                    SSR_Code: "INFT",
                    Text: `${infant_lastname}/${infant_firstName}/${infant_DOB}`,
                    PersonName: {
                      NameNumber: "1.1",
                    },
                  },
                ]
              : []),
            ...(child_DOB
              ? [
                  {
                    SSR_Code: "CHLD",
                    Text: `${child_DOB}`,
                    PersonName: { NameNumber: child_index },
                  },
                ]
              : []),
            // {
            //   SSR_Code: "OTHS",
            //   Text: "CC Ali MANZOOR",
            //   PersonName: {
            //     NameNumber: "1.1",
            //   },
            //   SegmentNumber: "1",
            // },
            {
              SSR_Code: "CTCM",
              // Text: `${contact.phones?.[0].number}`,
              Text: `3003790375`,
              PersonName: {
                NameNumber: "1.1",
              },
            },

            {
              SSR_Code: "CTCE",
              Text: `${data.emailAddress}`,
              PersonName: {
                NameNumber: "1.1",
              },
            },
          ],
          AdvancePassenger: travelers.map((passenger, index) => ({
            Document: {
              IssueCountry: passenger.documents?.[0]?.issuanceCountry,
              NationalityCountry: passenger.documents?.[0]?.nationality,
              ExpirationDate: passenger.documents?.[0]?.expiryDate,
              Number: passenger.documents?.[0]?.number,
              Type: passenger.documents?.[0]?.documentType,
            },
            PersonName: {
              NameNumber: `${index + 1}.1`,
              GivenName:
                getGenderCode(passenger.travelerType) === "INF"
                  ? passenger.name.firstName.replace("Mstr", "INF")
                  : passenger.name.firstName,
              Surname: passenger.name.lastName,
              LapChild:
                getGenderCode(passenger.travelerType) === "INF" ? true : false,
              Gender:
                getGenderCode(passenger.travelerType) === "INF"
                  ? `${passenger.gender?.charAt(0)?.toUpperCase()}I`
                  : passenger.gender?.charAt(0)?.toUpperCase(),
              DateOfBirth: passenger.dateOfBirth,
            },
            SegmentNumber: "A",
          })),
        },
      },
      // AddRemark: {
      //   RemarkInfo: {
      //     FOP_Remark: [
      //       {
      //         Type: "CASH",
      //       },
      //     ],
      //   },
      // },
    };
    /////////////////////////////////////////////////////////////////////////
    // Booking request payload
    const bookingRequest = {
      CreatePassengerNameRecordRQ: {
        version: "2.4.0",
        targetCity: `${SABRE.SABRE_PCC}`,
        haltOnAirPriceError: true,
        TravelItineraryAddInfo: {
          AgencyInfo: {
            Ticketing: { TicketType: "7TAW" },
            Address: {
              AddressLine: agency.address,
              CityName: agency.city,
              PostalCode: agency.poBoxNumber,
              VendorPrefs: {
                Airline: {
                  Hosted: true,
                },
              },
            },
          },
          CustomerInfo: {
            ContactNumbers: {
              ContactNumber: [
                {
                  NameNumber: "1.1",
                  Phone: "817-555-1212",
                  PhoneUseType: "9",
                },
              ],
            },
            PersonName: passengerNames,
            Email: [
              {
                Address: data.emailAddress,
                NameNumber: "1.1",
              },
            ],
          },
        },
        SpecialReqDetails: specialReqDetails,
        AirBook: {
          RetryRebook: {
            Option: true,
          },
          OriginDestinationInformation: {
            FlightSegment: [...nada],
          },
          RedisplayReservation: {
            NumAttempts: 5,
            WaitInterval: 100,
          },
        },
        AirPrice: [
          {
            PriceRequestInformation: {
              Retain: true,
              OptionalQualifiers: {
                FOP_Qualifiers: {
                  BasicFOP: {
                    Type: "CA",
                  },
                },
                PricingQualifiers: {
                  PassengerType: travelers.map((data) => ({
                    Code: getGenderCode(data.travelerType),
                    Quantity: "1",
                  })),
                },
              },
            },
          },
        ],
        PostProcessing: {
          EndTransaction: {
            Source: { ReceivedFrom: agency.agencyName || "API" },
            Email: {
              Ind: true,
            },
            // Email: {
            //   Itinerary: {
            //     PDF: {
            //       Ind: true,
            //     },
            //     Ind: true,
            //   },
            //   PersonName: {
            //     NameNumber: "1.1",
            //   },
            //   Ind: true,
            // },
          },
          RedisplayReservation: {},
          PricingInterval: {
            waitInterval: 100,
          },
        },
      },
    };
    // return errorResponse(res, bookingRequest, 404);

    // Send booking request to Sabre API
    const response = await fetch(
      `${SABRE.BASE_URL}/v2.4.0/passenger/records?mode=create`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(bookingRequest),
      }
    );
    const bookingData = await response.json();
    if (
      !response.ok ||
      bookingData.CreatePassengerNameRecordRS.ApplicationResults.status !==
        "Complete"
    ) {
      return errorResponse(res, bookingData, 404);
      return errorResponse(res, bookingRequest, 404);
    }

    const bookingId = bookingData.CreatePassengerNameRecordRS.ItineraryRef.ID;

    const newBooking = new Booking({
      type: "flight",
      api: "Sabre",
      userId: req.user._id,
      id: bookingId,
      status: ETicketStatus.HOLD,
      agencyId: req.user.agencyId || null,
      createdBy: req.user.role || null,
      originalPrice: price,
      finalPrice: adjustedPrice,
      markupType: markupType,
      markupAmount: findMarkup.markupValue,
      deptTime: flightOffers[0]?.departureTime || "",
      arrivalTime: flightOffers[0]?.arrivalTime || "",
      travelers: travelers.map((passenger, index) => ({
        id: `${index + 1}.1`,
        dateOfBirth: passenger.dateOfBirth,
        gender: passenger.gender,
        name: passenger.name,

        documents: [
          {
            number: passenger.documents?.[index]?.number || "",
            issuanceCountry:
              passenger.documents?.[index]?.issuanceLocation || "",
            nationality: passenger.documents?.[index]?.nationality || "",
            expiryDate: passenger.documents?.[index]?.expiryDate || "",
            issuanceDate: passenger.documents?.[index]?.issuanceDate,
            birthPlace: passenger.documents?.[index]?.birthPlace,
            documentType: "P",
          },
        ],
        contact: {
          phones: [
            { number: contact?.phones[0]?.number, deviceType: "MOBILE" },
          ],
          email: contact?.emailAddress,
        },
      })),
      flightOffers: [
        {
          itineraries: nada.map((data) => ({
            segments: [
              {
                departure: {
                  iataCode: data.OriginLocation.LocationCode,
                  at: data.DepartureDateTime,
                },
                arrival: {
                  iataCode: data.DestinationLocation.LocationCode,
                  at: data.ArrivalDateTime,
                },
                carrierCode: data.MarketingAirline.FlightNumber,
                number: data.MarketingAirline.FlightNumber,

                operating: {
                  carrierCode: data.MarketingAirline.Code,
                },
              },
            ],
          })),
        },
      ],
      contacts: [
        {
          addresseeName: { firstName: contact?.firstName || "N/A" },
          phones: contact?.phones || [],
        },
      ],
    });

    await newBooking.save();

    // Update agency cash limit
    // await Agency.findByIdAndUpdate(
    //   agency._id,
    //   { $inc: { cashLimit: -adjustedPrice } },
    //   { new: true, runValidators: true }
    // );

    return successResponse(res, "Flight booked successfully", bookingRequest);
  } catch (error) {
    console.error("Error in createBooking:", error);
    return errorResponse(res, error);
  }
}
async function finalizeBooking(req, res) {
  try {
    const agency = await Agency.findById(req.user.agencyId);
    const { pnr } = req.body;
    const data = {
      EndTransactionRQ: {
        version: "1.3.0", // API version (adjust if needed)
        EndTransaction: {
          Source: {
            ReceivedFrom: `${agency.agencyName}`, // Agency name for the booking source
          },
          Reservation: {
            PNR: `${pnr}`, // PNR for the reservation to confirm
            // Payment: paymentInfo, // Payment information for finalizing the booking
          },
          Email: {
            Itinerary: {
              PDF: { Ind: true }, // Email itinerary PDF
              Ind: true, // Enable email for itinerary
            },
            Ind: true, // Enable email notifications for confirmation
          },
          Ticketing: {
            IssueTicket: true, // Indicate that ticketing should be processed
            PaymentMethod: "CC", // Payment method (e.g., Credit Card)
          },
        },
      },
    };
    let nada = {
      agency: {
        contactInfo: {
          emails: ["alasamtravelpk@gmail.com"],
        },
      },
    };
    const amadeusResponse = await fetch(`${SABRE.BASE_URL}/v1.3.0/air/ticket`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });

    const bookingData = await amadeusResponse.json();
  } catch (error) {}
}

async function deleteBooking(req, res) {
  try {
    console.log("pnr", req.body.pnr);

    await ensureToken();

    const { pnr } = req.body;
    const booking = await Booking.findOne({ id: pnr });
    console.log(booking);
    if (!booking) {
      return errorResponse(res, "Booking not found", 404);
    }
    console.log("bookingId", booking.id);
    const body = {
      confirmationId: `${booking.id}`,
      // flightTicketOperation: "VOID",
      errorHandlingPolicy: "HALT_ON_ERROR",
      retrieveBooking: true,
      cancelAll: true,
      notification: {
        email: "INVOICE",
      },
    };
    const amadeusResponse = await fetch(
      `${SABRE.BASE_URL}/v1/trip/orders/cancelBooking`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }
    );
    const errorDetails = await amadeusResponse.text();

    console.log("error", errorDetails);
    console.log("error", errorDetails);
    if (!amadeusResponse.ok) {
      // const errorDetails = await amadeusResponse.text();
      return errorResponse(
        res,
        `Failed to delete booking: ${amadeusResponse.status} ${amadeusResponse.statusText}. Details: ${errorDetails}`,
        amadeusResponse.status
      );
    }
    if (errorDetails.type === "NO_ITEMS_CANCELLED") {
      return errorResponse(
        res,
        `Failed to delete booking: ${amadeusResponse.status} ${amadeusResponse.statusText}. Details: ${errorDetails}`,
        amadeusResponse.status
      );
    }
    // const agency = await Agency.findById(booking.agencyId);
    // if (!agency) {
    //   return errorResponse(res, "Agency not found", 404);
    // }

    // // Return credit to the agency's cash limit
    // agency.cashLimit += Number(booking.finalPrice);
    // await agency.save();

    // // Delete booking from database
    // await booking.deleteOne();
    await Booking.findByIdAndUpdate(
      booking._id,
      {
        status: ETicketStatus.CANCELLED,
      },
      { new: true }
    );
    return successResponse(res, errorDetails, 200);
  } catch (error) {
    console.error("Error deleting booking:", error);
    return errorResponse(res, error.message || "An error occurred", 500);
  }
}

async function issueTicket(req, res) {
  try {
    const { otp, userId, commission } = req.body;
    const user = await User.findById(userId);
    const agency = await Agency.findById(req.user.agencyId);

    // const otpValidationResult = await handleOtpAttempts(user, otp);

    // if (!otpValidationResult.success) {
    //   return res.status(otpValidationResult.status).json({
    //     error: otpValidationResult.message,
    //   });
    // }
    await ensureToken();
    const { country_code, pnr, number } = req.body;

    const findBookings = await Booking.findOne({ id: pnr });
    if (Number(agency.cashLimit) < Number(findBookings.finalPrice)) {
      return errorResponse(
        res,
        "Insufficient balance. Please recharge your account.",
        404
      );
    }
    if (
      req.user.id !== findBookings.uniqueId &&
      req.user.role !== EUserRole.SUPERADMIN
    ) {
      return errorResponse(
        res,
        "only the user created ticket can issue it",
        404
      );
    }
    const travellers = findBookings.travelers;
    const data = {
      AirTicketRQ: {
        DesignatePrinter: {
          Printers: {
            Ticket: {
              CountryCode: "PK",
            },
            Hardcopy: {
              LNIATA: "BB7ECE",
            },
          },
        },
        Itinerary: {
          ID: pnr,
        },
        Ticketing: [
          {
            PricingQualifiers: {
              PriceQuote: [
                {
                  NameSelect: travellers.map((data, index) => ({
                    NameNumber: Number(`${index + 1}.1`),
                  })),
                  Record: [
                    {
                      Number: 1,
                      Reissue: false,
                    },
                  ],
                },
              ],
            },
            FOP_Qualifiers: {
              BasicFOP: {
                Type: "CA",
              },
            },
          },
        ],
        PostProcessing: {
          EndTransaction: {
            Source: {
              ReceivedFrom: `${SABRE.SABRE_PCC}`,
            },
            Email: {
              eTicket: {
                PDF: {
                  Ind: false,
                },
                Ind: true,
              },
              // PersonName: {
              //   NameNumber: "1.1",
              // },
              // PersonName: {
              //   NameNumber: "2.1",
              // },
              Ind: true,
            },
          },
        },
      },
    };

    const amadeusResponse = await fetch(`${SABRE.BASE_URL}/v1.3.0/air/ticket`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });

    const bookingData = await amadeusResponse.json();
    // let bookingData?.AirTicketRS?.ApplicationResults?.status =complete
    // const errorDetails = await amadeusResponse.text();
    // if (!bookingData.ok) {
    //   return errorResponse(res, "Failed to issue ticket", errorDetails);
    // }
    // Check if ticketing was successful
    if (bookingData?.AirTicketRS?.ApplicationResults?.status === "Complete") {
      const findbooking = await Booking.findOne({ id: pnr });
      if (!findbooking) {
        return errorResponse(res, "Data not available in the database", 404);
      }
      // console.log("bookingData", bookingData);
      const updatedTravelers = findbooking.travelers.map((traveler, index) => {
        console.log(
          "TICKET NUMBER",
          bookingData.AirTicketRS?.Summary?.[index]?.DocumentNumber
        );
        const ticketInfo =
          bookingData.AirTicketRS?.Summary?.[index]?.DocumentNumber;
        return {
          ...traveler._doc,
          ticketNumber: ticketInfo,
        };
      });
      console.log("updatedTravelers", updatedTravelers);
      console.log(" findbooking._id,", findbooking._id);

      const updatebooking = await Booking.findByIdAndUpdate(
        findbooking._id,
        {
          commission: commission ? commission : 0,
          status: ETicketStatus.COMFIRMED,
          isTicketed: true,
          travelers: updatedTravelers,
        },
        { new: true, runValidators: true }
      );
      console.log("detucting the amount from the wallet...... ");
      await Agency.findByIdAndUpdate(
        agency._id,
        { $inc: { cashLimit: -Number(findBookings.finalPrice) } },
        { new: true, runValidators: true }
      );

      return successResponse(res, "Ticket issued successfully", updatebooking);
    } else {
      // Log bookingData if available for troubleshooting
      console.error("Ticket issuance failed:", bookingData.AirTicketRS);
      return errorResponse(res, bookingData, 404);
    }
  } catch (error) {
    console.error("Error in issueTicket:", error); // Log detailed error
    return errorResponse(res, error);
  }
}

async function repriceOrder(req, res) {
  try {
    const { otp, userId } = req.body;
    const user = await User.findById(userId);
    const agency = await Agency.findById(req.user.agencyId);

    // const otpValidationResult = await handleOtpAttempts(user, otp);

    // if (!otpValidationResult.success) {
    //   return res.status(otpValidationResult.status).json({
    //     error: otpValidationResult.message,
    //   });
    // }
    await ensureToken();
    const { country_code, pnr, number } = req.body;

    // const findBookings = await Booking.findOne({ id: pnr });
    // if (Number(agency.cashLimit) < Number(findBookings.finalPrice)) {
    //   return errorResponse(
    //     res,
    //     "Insufficient balance. Please recharge your account.",
    //     404
    //   );
    // }
    // const travellers = findBookings.travelers;
    const data = {
      request: {
        orderId: `${pnr}`,
      },
    };

    const amadeusResponse = await fetch(
      `${SABRE.BASE_URL}/v1/offers/repriceOrder`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      }
    );
    console.log("sabre reprice", amadeusResponse);
    const bookingData = await amadeusResponse.json();
    // let bookingData?.AirTicketRS?.ApplicationResults?.status =complete
    // const errorDetails = await amadeusResponse.text();
    // if (!bookingData.ok) {
    //   return errorResponse(res, "Failed to issue ticket", errorDetails);
    // }
    // Check if ticketing was successful
    if (bookingData?.AirTicketRS?.ApplicationResults?.status === "Complete") {
      const findbooking = await Booking.findOne({ id: pnr });
      if (!findbooking) {
        return errorResponse(res, "Data not available in the database", 404);
      }
      // console.log("bookingData", bookingData);
      const updatedTravelers = findbooking.travelers.map((traveler, index) => {
        console.log(
          "TICKET NUMBER",
          bookingData.AirTicketRS?.Summary?.[index]?.DocumentNumber
        );
        const ticketInfo =
          bookingData.AirTicketRS?.Summary?.[index]?.DocumentNumber;
        return {
          ...traveler._doc,
          ticketNumber: ticketInfo,
        };
      });
      console.log("updatedTravelers", updatedTravelers);
      console.log(" findbooking._id,", findbooking._id);

      const updatebooking = await Booking.findByIdAndUpdate(
        findbooking._id,
        {
          status: ETicketStatus.COMFIRMED,
          isTicketed: true,
          travelers: updatedTravelers,
        },
        { new: true, runValidators: true }
      );
      console.log("detucting the amount from the wallet...... ");
      await Agency.findByIdAndUpdate(
        agency._id,
        { $inc: { cashLimit: -Number(findBookings.finalPrice) } },
        { new: true, runValidators: true }
      );

      return successResponse(res, "Ticket issued successfully", updatebooking);
    } else {
      // Log bookingData if available for troubleshooting
      console.error("Ticket issuance failed:", bookingData.AirTicketRS);
      return errorResponse(res, bookingData, 404);
    }
  } catch (error) {
    console.error("Error in issueTicket:", error); // Log detailed error
    return errorResponse(res, error);
  }
}

async function refundFlightTickets(req, res) {
  try {
    await ensureToken();

    const { bookingId } = req.body;

    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return errorResponse(res, "Booking not found", 404);
    }

    // const ticketNumbers = booking.travelers
    //   .map((traveler) => traveler.ticketNumber)
    //   .filter((ticketNumber) => ticketNumber); // Ensure only valid ticket numbers are included
    const data = {
      errorHandlingPolicy: "HALT_ON_ERROR",
      targetPcc: `${SABRE.SABRE_PCC}`,
      // tickets: ticketNumbers.map((ticketNumber) => ({ number: ticketNumber })),
      notification: {
        email: "INVOICE",
      },
      confirmationId: pnr,
      designatePrinters: [
        {
          ticket: {
            address: "BB7ECE",
            countryCode: "PK",
            // "spacing": "1"
          },
        },
      ],
    };
    console.log("body", data);

    const response = await fetch(
      `${SABRE.BASE_URL}/v1/trip/orders/refundFlightTickets`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      }
    );

    // Parse the response
    const amadeusResponse = await response.json();
    console.log("bookingData", amadeusResponse);

    if (!response.ok) {
      return errorResponse(
        res,
        `Failed to void PNR: ${response.status} ${
          response.statusText
        }. Details: ${JSON.stringify(amadeusResponse)}`,
        response.status
      );
    }
    await Booking.findByIdAndUpdate(
      bookingId,
      {
        status: ETicketStatus.REFUNDED,
      },
      { new: true }
    );
    return successResponse(
      res,
      "refundFlightTickets successfully",
      amadeusResponse
    );
  } catch (error) {
    return errorResponse(res, error);
  }
}

async function voidFlightTickets(req, res) {
  try {
    await ensureToken();

    const { pnr } = req.body;

    const booking = await Booking.findOne({ id: pnr });
    if (!booking) {
      return errorResponse(res, "Booking not found", 404);
    }

    const ticketNumbers = booking.travelers
      .map((traveler) => traveler.ticketNumber)
      .filter((ticketNumber) => ticketNumber); // Ensure only valid ticket numbers are included
    const data = {
      // tickets: ticketNumbers.map((ticketNumber) => ({ number: ticketNumber })),
      errorHandlingPolicy: "HALT_ON_ERROR",
      notification: {
        email: "INVOICE",
      },
      confirmationId: pnr,
      designatePrinters: [
        {
          ticket: {
            address: "BB7ECE",
            countryCode: "PK",
            // "spacing": "1"
          },
        },
      ],
    };
    console.log("body", data);

    const response = await fetch(
      `${SABRE.BASE_URL}/v1/trip/orders/voidFlightTickets`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      }
    );

    // Parse the response
    const amadeusResponse = await response.json();
    console.log("bookingData", amadeusResponse);

    if (!response.ok) {
      return errorResponse(
        res,
        `Failed to void PNR: ${response.status} ${
          response.statusText
        }. Details: ${JSON.stringify(amadeusResponse)}`,
        response.status
      );
    }
    await Booking.findByIdAndUpdate(
      booking._id,
      {
        status: ETicketStatus.VOIDED,
      },
      { new: true }
    );
    return successResponse(
      res,
      "PNR voidFlightTickets successfully",
      amadeusResponse
    );
  } catch (error) {
    return errorResponse(res, error);
  }
}

async function checkFlightTickets(req, res) {
  try {
    await ensureToken();

    const { bookingId } = req.params;

    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return errorResponse(res, "Booking not found", 404);
    }

    const ticketNumbers = booking.travelers
      .map((traveler) => traveler.ticketNumber)
      .filter((ticketNumber) => ticketNumber); // Ensure only valid ticket numbers are included
    const data = {
      tickets: ticketNumbers.map((ticketNumber) => ({ number: ticketNumber })),
    };
    console.log("body", data);
    // Make the request to refundFlightTickets
    const response = await fetch(
      `${SABRE.BASE_URL}/v1/trip/orders/checkFlightTickets`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      }
    );

    // Parse the response
    const amadeusResponse = await response.json();
    console.log("bookingData", amadeusResponse);

    if (!response.ok) {
      return errorResponse(
        res,
        `Failed to void PNR: ${response.status} ${
          response.statusText
        }. Details: ${JSON.stringify(amadeusResponse)}`,
        response.status
      );
    }

    return successResponse(
      res,
      "PNR checkFlightTickets successfully",
      amadeusResponse
    );
  } catch (error) {
    return errorResponse(res, error);
  }
}

async function viewItinary(req, res) {
  try {
    await ensureToken();

    const { pnr } = req.body;

    const booking = await Booking.findOne({ id: pnr }).populate({
      path: "agencyId",
      select:
        "agencyName phoneNumber address city country timeZone poBoxNumber defaultCurrency agencyEmail logo",
    });
    if (!booking) {
      return errorResponse(res, "Booking not found", 404);
    }
    const data = {
      confirmationId: `${pnr}`,
    };

    const response = await fetch(
      `${SABRE.BASE_URL}/v1/trip/orders/getBooking `,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      }
    );
    const amadeusResponse = await response.json();
    // return errorResponse(res, amadeusResponse, 404);
    if (amadeusResponse.errors?.[0]?.category === "ERROR") {
      return errorResponse(res, amadeusResponse.errors, 400);
    }
    if (!response.ok) {
      return errorResponse(
        res,
        `${amadeusResponse.message}`,
        amadeusResponse.status
      );
    }
    amadeusResponse.reference = booking._id;
    amadeusResponse.agency = booking.agencyId;
    // const ticketData = {
    //   bookingId: amadeusResponse.bookingId,
    //   isTicketed: amadeusResponse.isTicketed,

    //   dates: {
    //     startDate: amadeusResponse.startDate,
    //     endDate: amadeusResponse.endDate,
    //   },
    //   traveler: amadeusResponse.travelers.map((traveler) => ({
    //     name: `${traveler.givenName} ${traveler.surname}`,
    //     type: traveler.type,
    //     nationalId: traveler.identityDocuments[0]?.documentNumber || "N/A",
    //   })),
    //   flight: amadeusResponse.flights.map((flight) => ({
    //     flightNumber: flight.flightNumber,
    //     airline: flight.airlineName,
    //     from: flight.fromAirportCode,
    //     to: flight.toAirportCode,
    //     departure: `${flight.departureDate} ${flight.departureTime}`,
    //     arrival: `${flight.arrivalDate} ${flight.arrivalTime}`,
    //     cabinType: flight.cabinTypeName,
    //   })),
    //   baggage: {
    //     cabin:
    //       amadeusResponse.fareOffers[0]?.cabinBaggageAllowance
    //         ?.totalWeightInKilograms || 0,
    //     checked:
    //       amadeusResponse.fareOffers[0]?.checkedBaggageAllowance
    //         ?.totalWeightInKilograms || 0,
    //   },
    //   fare: {
    //     total: `${amadeusResponse.fares[0]?.totals.total} ${amadeusResponse.fares[0]?.totals.currencyCode}`,
    //     taxes: amadeusResponse.fares[0]?.taxBreakdown.map((tax) => ({
    //       code: tax.taxCode,
    //       amount: `${tax.taxAmount.amount} ${tax.taxAmount.currencyCode}`,
    //     })),
    //   },
    //   specialServices: amadeusResponse.specialServices?.map((service) => ({
    //     code: service.code,
    //     message: service.message,
    //     status: service.statusName,
    //   })),
    // };
    return successResponse(res, "view PNR successfully", {
      data: amadeusResponse,
    });
  } catch (error) {
    return errorResponse(res, error);
  }
}
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
    console.log("body", data);

    const response = await fetch(
      `${SABRE.BASE_URL}/v1/trip/orders/getBooking`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      }
    );

    // Parse the response
    const amadeusResponse = await response.json();
    console.log(amadeusResponse);

    if (!response.ok) {
      // Check for specific error from Amadeus

      // Generic API error
      return errorResponse(
        res,
        `Failed to get Booking: ${response.status} ${
          response.statusText
        }. Details: ${JSON.stringify(amadeusResponse)}`,
        response.status
      );
    }
    if (
      amadeusResponse.errors &&
      amadeusResponse.errors.some(
        (error) =>
          error.type === "BOOKING_NOT_FOUND" &&
          error.description === "Booking cannot be found"
      )
    ) {
      return errorResponse(res, `Booking not found on this  account`, 404);
    }
    if (
      amadeusResponse.errors &&
      amadeusResponse.errors.some(
        (error) => error.type === "UNAUTHORIZED_ACCESS"
      )
    ) {
      return errorResponse(res, amadeusResponse.errors[0].description, 404);
    }

    if (findBooking.status === "hold" && amadeusResponse.isTicketed === false) {
      return successResponse(res, "the status is same i.e hold", 204);
    }
    if (
      findBooking.status === "confirmed" &&
      amadeusResponse.isTicketed === false
    ) {
      return successResponse(
        res,

        {
          message: "ticket is on hold but db contains confirmed status",
          ticketNumber: null,
          status: "hold",
        },
        200
      );
    }
    const status =
      amadeusResponse?.flightTickets[amadeusResponse?.flightTickets?.length - 1]
        .ticketStatusName;
    if (findBooking.status === "hold" && status === "Issued") {
      const ticketNumber = amadeusResponse.flightTickets.map((data) => ({
        ticket: data.number,
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
    if (findBooking.status === "hold" && status === "Voided") {
      const ticketNumber = amadeusResponse.flightTickets.map((data) => ({
        ticket: data.number,
      }));
      return successResponse(
        res,

        {
          message: "ticket is Voided but db contains hold status",
          ticketNumber,
          status: "voided",
        },
        200
      );
    }
    if (findBooking.status === "confirmed" && status === "Voided") {
      const ticketNumber = amadeusResponse.flightTickets.map((data) => ({
        ticket: data.number,
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
    if (findBooking.status === "confirmed" && status === "Issued") {
      return successResponse(res, "the status is same i.e confirmed", 204);
    }
    if (findBooking.status === "voided" && status === "Issued") {
      const ticketNumber = amadeusResponse.flightTickets.map((data) => ({
        ticket: data.number,
      }));
      return successResponse(
        res,

        {
          message: "ticket is Issued but db contains voided status",
          ticketNumber,
          status: "confirmed",
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
          message: "ticket is hold but db contains voided status",
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
        "ticket is hold but db contains confirmed status",
        200
      );
    } else {
      return errorResponse(
        res,
        "error occured contact administration department",
        400
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
    console.log("ticket", ticket);

    const findBooking = await Booking.findOne({ id: pnr });
    if (!findBooking) {
      return errorResponse(res, "Booking not found with the given PNR", 404);
    }
    console.log("Booking", findBooking);
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
    console.log("updatedTravelers", updatedTravelers);
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
    const { pnr, staffMarkupValue, staffMarkupType } = req.body;

    console.log(pnr);
    const findBookings = await Booking.findOne({ id: pnr });
    if (findBookings) {
      return errorResponse(res, "PNR already exixts", 400);
    }
    let airlineLogoMap = {};
    try {
      airlineLogo.forEach(({ arCode, logo, ar }) => {
        airlineLogoMap[arCode] = { ar, logo };
      });
    } catch (error) {
      console.error("Error processing airline logo data:", error);
    }
    const findMakrup = await Markup.findOne({
      api: { $in: ["sabre", "all"] },
      status: "ACTIVE",
    });
    if (findMakrup) {
      let markupType = findMakrup.markupType;
    }
    const findBooking = await Booking.findOne({ id: pnr });
    const findAgency = await Agency.findOne({ _id: req.user.agencyId });

    // if (findBooking) {
    //   return errorResponse(res, "PNR already exists in the database", 200);
    // }

    const data = {
      confirmationId: `${pnr}`,
      targetPcc: `${SABRE.SABRE_PCC}`,
    };

    const response = await fetch(
      `${SABRE.BASE_URL}/v1/trip/orders/getBooking`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      }
    );

    const amadeusResponse = await response.json();

    // Handle warnings and errors
    if (amadeusResponse.errors) {
      const hasWarnings = amadeusResponse.errors.some(
        (error) => error.category === "WARNING"
      );
      const hasErrors = amadeusResponse.errors.some(
        (error) => error.category !== "WARNING"
      );

      if (hasErrors) {
        const errors = amadeusResponse.errors.filter(
          (error) => error.category !== "WARNING"
        );
        console.error("Errors from Sabre API:", errors);
        return errorResponse(res, errors, 404);
      }

      if (hasWarnings) {
        console.warn("Warnings from Sabre API:", amadeusResponse.errors);
      }
    }
    if (!amadeusResponse.flights) {
      return errorResponse(res, "No flight available", 404);
    }
    if (!amadeusResponse.fareRules) {
      return errorResponse(res, "Price quote not available", 404);
    }
    if (!amadeusResponse.payments.flightTotals) {
      return errorResponse(res, "No price quote available", 404);
    }
    let totalFare = 0;

    amadeusResponse.fares.forEach((fare) => {
      totalFare += parseFloat(fare.totals.total);
    });
    let basePrice = 0;
    basePrice = amadeusResponse?.fares
      ? parseFloat(amadeusResponse?.fares?.[0]?.totals.total)
      : 0;
    const adjustedPrice = calculateAdjustedPrice(
      totalFare,
      findMakrup,
      staffMarkupValue || 0,
      staffMarkupType || 0
    );
    function calculateMarkups(staffMarkupValue, staffMarkupType, agencyMarkup) {
      let totalMarkup = 0;

      // Add agency markup if provided
      if (agencyMarkup) {
        const agencyMarkupAmount =
          agencyMarkup.type === "percentage"
            ? (totalMarkup * Number(agencyMarkup.value)) / 100
            : Number(agencyMarkup.value);
        totalMarkup += agencyMarkupAmount;
      }

      // Add staff markup if provided
      if (staffMarkupValue) {
        const staffMarkupAmount =
          staffMarkupType === "percentage"
            ? (totalMarkup * Number(staffMarkupValue)) / 100
            : Number(staffMarkupValue);
        totalMarkup += staffMarkupAmount;
      }

      // Return the combined markup
      return totalMarkup.toFixed(2); // Format to two decimal places
    }

    // Add adjusted price to the response
    amadeusResponse.markup = calculateMarkups(
      findMakrup,
      staffMarkupValue || 0,
      staffMarkupType || 0
    );
    amadeusResponse.fares[0].totals.total = adjustedPrice.toFixed(3);

    if (amadeusResponse.flights) {
      amadeusResponse.flights.forEach((flight) => {
        const airlineData = airlineLogoMap[flight.operatingAirlineCode] || {
          arCode: flight.airlineCode,
          logo: "default_logo_url",
        };
        flight.logo = airlineData.logo;
      });
    }

    return successResponse(res, "Import PNR from Sabre API", amadeusResponse);
  } catch (error) {
    return errorResponse(res, error);
  }
}

async function modifyPNR(req, res) {
  try {
    await ensureToken();
    const agency = await Agency.findById(req.user.agencyId);

    const { pnr, documentDetails, staffMarkupValue, staffMarkupType } =
      req.body;
    const { bookingSignature, travelers, request } = req.body.data;

    let markupType, markupAmount;
    const findBooking = await Booking.findOne({ id: pnr });
    // if (findBooking) {
    //   return errorResponse(res, "PNR already exixts", 400);
    // }
    // Fetch agency details
    const findAgency = await Agency.findOne({ _id: req.user.agencyId });

    // Fetch markup details
    const findMakrup = await Markup.findOne({
      api: { $in: ["sabre", "all"] },
      status: "ACTIVE",
    });

    if (findMakrup) {
      markupType = findMakrup.markupType;
      markupAmount = findMakrup.markupValue;
    }

    // Prepare the data object
    const data = {
      confirmationId: request?.confirmationId || null,
      bookingSignature,
      targetPcc: "0BJL",
      before: {},
      after: {
        payments: {
          formsOfPayment: [{ type: "CASH" }],
        },
        travelers: Array.isArray(travelers)
          ? travelers.map((data, index) => ({
              givenName: data.givenName,
              surname: data.surname,
              type: data.type,
              passengerCode: data.passengerCode,
              birthDate: documentDetails?.[index]?.dateOfBirth || null,
              identityDocuments: documentDetails?.[index]
                ? [
                    {
                      residenceCountryCode:
                        documentDetails[index]?.validityCountry || "",
                      gender: documentDetails[index]?.gender || "",
                      issuingCountryCode:
                        documentDetails[index]?.issuanceCountry || "",
                      documentType: documentDetails[index]?.documentType || "",
                      documentNumber: documentDetails[index]?.number || "",
                      expiryDate: documentDetails[index]?.expiryDate || "",
                      isPrimaryDocumentHolder:
                        documentDetails[index]?.holder || false,
                      givenName: data.givenName,
                      surname: data.surname,
                      birthDate: documentDetails[index]?.dateOfBirth || "",
                    },
                  ]
                : [],
            }))
          : [],
      },
      retrieveBooking: true,
      receivedFrom: findAgency?.agencyName || "Unknown Agency",
    };

    if (!data.confirmationId) {
      return errorResponse(res, "Missing confirmation ID", 400);
    }

    // Call Sabre API
    const response = await fetch(
      `${SABRE.BASE_URL}/v1/trip/orders/modifyBooking`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      }
    );

    const sabreResponse = await response.json();
    if (sabreResponse.errors) {
      return errorResponse(res, sabreResponse.errors, 400);
    }
    // return successResponse(res, sabreResponse, sabreResponse);
    const flightOffers = {
      itineraries: {
        segments: [],
      },
    };
    if (!response.ok) {
      return errorResponse(
        res,
        `Failed to modify booking: ${response.status} ${
          response.statusText
        }. Details: ${JSON.stringify(sabreResponse)}`,
        response.status
      );
    }
    const bookingId = sabreResponse.bookingId;
    // Process response
    let status = null,
      ticketing,
      ticketNumber;
    if (sabreResponse.isTicketed === false) {
      status = "hold";
      ticketNumber = null;
      ticketing = false;
    } else if (sabreResponse.isTicketed === true) {
      const sabreStatus =
        sabreResponse?.flightTickets?.[sabreResponse.flightTickets.length - 1]
          ?.ticketStatusName || "";

      if (sabreStatus === "Issued") {
        ticketNumber = sabreResponse.flightTickets.map((data) => ({
          ticket: data.number,
        }));
        status = "confirmed";
        ticketing = true;
      } else if (sabreStatus === "Voided") {
        ticketNumber = sabreResponse.flightTickets.map((data) => ({
          ticket: data.number,
        }));
        status = "voided";
        ticketing = true;
      }
    }

    const traveler = Array.isArray(sabreResponse.travelers)
      ? sabreResponse.travelers.map((traveler, index) => ({
          id: `${index + 1}`,
          dateOfBirth: traveler.identityDocuments[0].birthDate,
          gender: traveler.identityDocuments[0].gender,
          name: {
            firstName: traveler.givenName,
            lastName: traveler.surname,
          },
          documents: Array.isArray(traveler.identityDocuments)
            ? traveler.identityDocuments.map((doc) => ({
                number: doc.documentNumber,
                issuanceCountry: doc.issuingCountryCode,
                nationality: doc.residenceCountryCode,
                expiryDate: doc.expiryDate,
                // issuanceDate: doc.issuanceDate,
                // birthPlace: doc.birthPlace,
                documentType: doc.documentType,
                holder: doc.isPrimaryDocumentHolder,
              }))
            : [],
        }))
      : [];

    if (Array.isArray(sabreResponse.flights)) {
      sabreResponse.flights.forEach((flight) => {
        flightOffers.itineraries.segments.push({
          departure: {
            iataCode: flight.fromAirportCode,
            at: `${flight.departureDate}T${flight.departureTime}`,
          },
          arrival: {
            iataCode: flight.toAirportCode,
            at: `${flight.arrivalDate}T${flight.arrivalTime}`,
          },
          carrierCode: flight.flightNumber,
          number: flight.flightNumber,
          aircraft: {
            code: flight.aircraftTypeCode,
          },
          operating: {
            carrierCode: flight.operatingAirlineCode,
          },
        });
      });
    }

    const price = Array.isArray(sabreResponse.payments?.flightTotals)
      ? sabreResponse.payments.flightTotals.map((price) => ({
          currency: price.currencyCode,
          total: price.total,
          base: price.subtotal,
          grandTotal: price.total,
        }))
      : [];

    let basePrice = parseFloat(sabreResponse?.fares?.[0]?.totals?.total || 0);
    const adjustedPrice = calculateAdjustedPrice(
      basePrice,
      findMakrup,
      staffMarkupValue || 0,
      staffMarkupType || 0
    );

    // Save booking to database
    const newBooking = new Booking({
      type: "flight",
      api: "Sabre",
      id: bookingId,
      isTicketed: sabreResponse.isTicketed,
      status,
      orignalPrice: basePrice,
      finalPrice: adjustedPrice,
      markupType,
      markupAmount,
      travelers: traveler,
      flightOffers,
      price,
    });
    console.log("booking", bookingId, newBooking, sabreResponse);
    await newBooking.save();
    // const findBookings = await Booking.findOne({ id: pnr });
    // if (Number(agency.cashLimit) < Number(findBookings.finalPrice)) {
    //   return errorResponse(
    //     res,
    //     "Insufficient balance. Please recharge your account.",
    //     404
    //   );
    // }
    // console.log("dataaa", req.user._id, findBookings.uniqueId);
    // if (req.user._id !== findBookings.uniqueId) {
    //   return errorResponse(
    //     res,
    //     "only the user created ticket can issue it",
    //     404
    //   );
    // }
    // const travellers = findBookings.travelers;
    // const datas = {
    //   AirTicketRQ: {
    //     DesignatePrinter: {
    //       Printers: {
    //         Ticket: {
    //           CountryCode: "PK",
    //         },
    //         Hardcopy: {
    //           LNIATA: "BB7ECE",
    //         },
    //       },
    //     },
    //     Itinerary: {
    //       ID: pnr,
    //     },
    //     Ticketing: [
    //       {
    //         PricingQualifiers: {
    //           PriceQuote: [
    //             {
    //               NameSelect: travellers.map((data, index) => ({
    //                 NameNumber: Number(`${index + 1}.1`),
    //               })),
    //               Record: [
    //                 {
    //                   Number: 1,
    //                   Reissue: false,
    //                 },
    //               ],
    //             },
    //           ],
    //         },
    //         FOP_Qualifiers: {
    //           BasicFOP: {
    //             Type: "CA",
    //           },
    //         },
    //       },
    //     ],
    //     PostProcessing: {
    //       EndTransaction: {
    //         Source: {
    //           ReceivedFrom: `${SABRE.SABRE_PCC}`,
    //         },
    //         Email: {
    //           eTicket: {
    //             PDF: {
    //               Ind: false,
    //             },
    //             Ind: true,
    //           },
    //           // PersonName: {
    //           //   NameNumber: "1.1",
    //           // },
    //           // PersonName: {
    //           //   NameNumber: "2.1",
    //           // },
    //           Ind: true,
    //         },
    //       },
    //     },
    //   },
    // };

    // const amadeusResponse = await fetch(`${SABRE.BASE_URL}/v1.3.0/air/ticket`, {
    //   method: "POST",
    //   headers: {
    //     Authorization: `Bearer ${accessToken}`,
    //     "Content-Type": "application/json",
    //   },
    //   body: JSON.stringify(datas),
    // });

    // const bookingData = await amadeusResponse.json();
    // return successResponse(res, "bookingData", bookingData);
    // // let bookingData?.AirTicketRS?.ApplicationResults?.status =complete
    // // const errorDetails = await amadeusResponse.text();
    // // if (!bookingData.ok) {
    // //   return errorResponse(res, "Failed to issue ticket", errorDetails);
    // // }
    // // Check if ticketing was successful
    // if (bookingData?.AirTicketRS?.ApplicationResults?.status === "Complete") {
    //   const findbooking = await Booking.findOne({ id: pnr });
    //   if (!findbooking) {
    //     return errorResponse(res, "Data not available in the database", 404);
    //   }
    //   // console.log("bookingData", bookingData);
    //   const updatedTravelers = findbooking.travelers.map((traveler, index) => {
    //     console.log(
    //       "TICKET NUMBER",
    //       bookingData.AirTicketRS?.Summary?.[index]?.DocumentNumber
    //     );
    //     const ticketInfo =
    //       bookingData.AirTicketRS?.Summary?.[index]?.DocumentNumber;
    //     return {
    //       ...traveler._doc,
    //       ticketNumber: ticketInfo,
    //     };
    //   });
    //   console.log("updatedTravelers", updatedTravelers);
    //   console.log(" findbooking._id,", findbooking._id);

    //   const updatebooking = await Booking.findByIdAndUpdate(
    //     findbooking._id,
    //     {
    //       commission: commission ? commission : 0,
    //       status: ETicketStatus.COMFIRMED,
    //       isTicketed: true,
    //       travelers: updatedTravelers,
    //     },
    //     { new: true, runValidators: true }
    //   );
    //   console.log("detucting the amount from the wallet...... ");
    //   await Agency.findByIdAndUpdate(
    //     agency._id,
    //     { $inc: { cashLimit: -Number(findBookings.finalPrice) } },
    //     { new: true, runValidators: true }
    //   );

    //   return successResponse(res, "Ticket issued successfully", updatebooking);
    // } else {
    //   // Log bookingData if available for troubleshooting
    //   console.error("Ticket issuance failed:", bookingData.AirTicketRS);
    //   return errorResponse(res, bookingData, 404);
    // }
    return successResponse(res, "PNR imported Successfully", sabreResponse);
  } catch (error) {
    console.error("Error in modifyPNR:", error);
    return errorResponse(res, error);
  }
}

module.exports = {
  postSabreFlightData,
  postSabreCityData,
  createBooking,
  postSabreFlightDataM,
  deleteBooking,
  brandedFares,
  revalidateItinerary,
  issueTicket,
  refundFlightTickets,
  voidFlightTickets,
  viewItinary,
  checkFlightTickets,
  updatePNR,
  updateStatus,
  importPNR,
  modifyPNR,
  repriceOrder,
  createBookingM,
};
