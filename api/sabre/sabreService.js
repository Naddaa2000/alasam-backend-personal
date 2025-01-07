const { SABRE } = require("../../config/config");
const { appendToFile } = require("../../lib/utils/fileUtils");
let accessToken = "";
let tokenExpiryTime = 0;
async function getToken() {
  try {
    console.log("here");
    const requestBody = new URLSearchParams({
      client_id: SABRE.CLIENT_ID,
      client_secret: SABRE.CLIENT_SECRET,
      grant_type: "client_credentials",
    });
    const response = await fetch(SABRE.TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic VmpFNk5qTXdPRFV4T2psWE0wUTZRVUU9OmMzSjNjbVZ6T1RrPQ==`,
      },
      body: requestBody,
    });

    if (!response.ok) {
      throw new Error("Failed to fetch access token");
    }

    const tokenData = await response.json();
    accessToken = tokenData.access_token;
    const expiresIn = tokenData.expires_in;
    console.log("access token", accessToken);
    tokenExpiryTime = Date.now() + (expiresIn - 100) * 1000;

    setTimeout(getToken, (expiresIn - 100) * 1000);
  } catch (error) {
    console.log("Error getting token", error);
  }
}

async function ensureToken() {
  if (!accessToken || Date.now() >= tokenExpiryTime) {
    await getToken();
  }
}

async function postFlightData(flightUrl, requestData) {
  await ensureToken();

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
      throw new Error(
        `Failed to post flight data. Status: ${response.status} ${response.statusText}`
      );
    }

    const flightData = await response.json();
    return flightData;
  } catch (error) {
    throw new Error(`Failed to post flight data: ${error.message}`);
  }
}

module.exports = {
  postFlightData,
};
