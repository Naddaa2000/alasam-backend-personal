const { required } = require("joi");
const mongoose = require("mongoose");
const { Schema } = mongoose;
const {
  EUserRole,
  UserStatus,
  DeleteStatus,
  DB_Tables,
  ETicketStatus,
} = require("../../lib/utils/enum");

const bookingSchema = new Schema(
  {
    type: String,
    api: String,
    id: String,
    createdby: String,
    userId: { type: mongoose.Types.ObjectId, ref: DB_Tables.USER },
    commission: {
      required: false,
      default: 0,
      type: Number,
    },
    status: {
      type: String,
      default: ETicketStatus.HOLD,
      enum: [ETicketStatus],
    },
    isTicketed: {
      type: Boolean,
      default: false,
    },
    // ticketNumber: {
    //   type: Number,
    //   default: 0,
    // },
    agencyId: { type: mongoose.Types.ObjectId, ref: DB_Tables.AGENCY },
    queuingOfficeId: String,
    orignalPrice: { type: Number, required: false },
    finalPrice: {
      type: Number,
      required: false,
    },
    markupType: {
      type: String,
    },
    markupAmount: {
      type: Number,
    },

    associatedRecords: [
      {
        reference: { type: String, default: "" },
        creationDate: { type: Date, default: Date.now },
        originSystemCode: { type: String, default: "" },
        flightOfferId: { type: String, default: "" },
      },
    ],
    flightOffers: [
      {
        type: { type: String, default: "flight-offer" },
        id: { type: String, default: "" },
        source: { type: String, default: "" },
        instantTicketingRequired: { type: Boolean, default: false },
        nonHomogeneous: { type: Boolean, default: false },
        oneWay: { type: Boolean, default: false },
        isUpsellOffer: { type: Boolean, default: false },
        lastTicketingDate: { type: String, default: "" },
        lastTicketingDateTime: { type: String, default: "" },
        numberOfBookableSeats: { type: Number, default: 0 },
        itineraries: [
          {
            duration: { type: String, default: "" },
            segments: [
              {
                departure: {
                  iataCode: { type: String, default: "" },
                  terminal: { type: String, default: "" },
                  at: { type: String, default: "" },
                },
                arrival: {
                  iataCode: { type: String, default: "" },
                  terminal: { type: String, default: "" },
                  at: { type: String, default: "" },
                },
                carrierCode: { type: String, default: "" },
                number: { type: String, default: "" },
                aircraft: {
                  code: { type: String, default: "" },
                },
                operating: {
                  carrierCode: { type: String, default: "" },
                },
                duration: { type: String, default: "" },
                id: { type: String, default: "" },
                numberOfStops: { type: Number, default: 0 },
                blacklistedInEU: { type: Boolean, default: false },
              },
            ],
          },
        ],
        price: {
          currency: { type: String, default: "" },
          total: { type: String, default: "" },
          base: { type: String, default: "" },
          fees: [
            {
              amount: { type: String, default: "" },
              type: { type: String, default: "" },
            },
          ],
          grandTotal: { type: String, default: "" },
        },
        pricingOptions: {
          fareType: [{ type: String, default: "" }],
          includedCheckedBagsOnly: { type: Boolean, default: false },
        },
        validatingAirlineCodes: [{ type: String, default: "" }],
        travelerPricings: [
          {
            travelerId: { type: String, default: "" },
            fareOption: { type: String, default: "" },
            travelerType: { type: String, default: "" },
            price: {
              currency: { type: String, default: "" },
              total: { type: String, default: "" },
              base: { type: String, default: "" },
            },
            fareDetailsBySegment: [
              {
                segmentId: { type: String, default: "" },
                cabin: { type: String, default: "" },
                fareBasis: { type: String, default: "" },
                brandedFare: { type: String, default: "" },
                brandedFareLabel: { type: String, default: "" },
                class: { type: String, default: "" },
                includedCheckedBags: {
                  weight: { type: Number, default: 0 },
                  weightUnit: { type: String, default: "" },
                },
                amenities: [
                  {
                    description: { type: String, default: "" },
                    isChargeable: { type: Boolean, default: false },
                    amenityType: { type: String, default: "" },
                    amenityProvider: {
                      name: { type: String, default: "" },
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
    ],

    travelers: [
      {
        id: { type: String, default: "" },
        dateOfBirth: { type: Date, default: Date.now },
        gender: { type: String, default: "" },
        name: {
          firstName: { type: String, default: "" },
          lastName: { type: String, default: "" },
        },
        documents: [
          {
            number: { type: String, default: "" },
            issuanceDate: { type: Date, default: Date.now },
            expiryDate: { type: Date, default: Date.now },
            issuanceCountry: { type: String, default: "" },
            issuanceLocation: { type: String, default: "" },
            nationality: { type: String, default: "" },
            birthPlace: { type: String, default: "" },
            documentType: { type: String, default: "" },
            holder: { type: Boolean, default: false },
          },
        ],
        contact: {
          purpose: { type: String, default: "" },
          phones: [
            {
              deviceType: { type: String, default: "" },
              countryCallingCode: { type: String, default: "" },
              number: { type: String, default: "" },
            },
          ],
          emailAddress: { type: String, default: "" },
        },
        ticketNumber: { type: String, default: "" },
      },
    ],
    remarks: {
      general: [
        {
          subType: { type: String, default: "" },
          text: { type: String, default: "" },
        },
      ],
    },
    ticketingAgreement: {
      option: { type: String, default: "" },
      delay: { type: String, default: "" },
    },
    automatedProcess: [
      {
        code: { type: String, default: "" },
        queue: {
          number: { type: String, default: "" },
          category: { type: String, default: "" },
        },
        officeId: { type: String, default: "" },
      },
    ],
    contacts: [
      {
        addresseeName: {
          firstName: { type: String, default: "" },
        },
        address: {
          lines: [{ type: String, default: "" }],
          postalCode: { type: String, default: "" },
          countryCode: { type: String, default: "" },
          cityName: { type: String, default: "" },
        },
        purpose: { type: String, default: "" },
        phones: [
          {
            deviceType: { type: String, default: "" },
            countryCallingCode: { type: String, default: "" },
            number: { type: String, default: "" },
          },
        ],
        companyName: { type: String, default: "" },
        emailAddress: { type: String, default: "" },
      },
    ],
    dictionaries: {
      locations: {
        type: Map,
        of: {
          cityCode: { type: String, default: "" },
          countryCode: { type: String, default: "" },
        },
      },
    },
  },
  {
    timestamps: { createdAt: "createdAt", updatedAt: "updatedAt" },
  }
);

const Booking = mongoose.model("Booking", bookingSchema);

module.exports = Booking;
