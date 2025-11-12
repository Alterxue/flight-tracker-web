const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");
const cors = require("cors")({origin:true});
admin.initializeApp();

exports.getLiveFlights = functions.https.onRequest((request, response) => {
  cors(request, response, async () => {
    const bbox = request.query.bbox;
    if (!bbox) {
      response.status(400).send({error: "Missing bbox query parameter."});
      return;
    }
    
    const [lomin, lamin, lomax, lamax] = bbox.split(",").map(v => parseFloat(v));
    
    // Validate bbox parameters
    if (isNaN(lomin) || isNaN(lamin) || isNaN(lomax) || isNaN(lamax)) {
      response.status(400).send({error: "Invalid bbox format. Expected: west,south,east,north"});
      return;
    }
    
    // Validate coordinate ranges
    if (lomin < -180 || lomin > 180 || lomax < -180 || lomax > 180 ||
        lamin < -90 || lamin > 90 || lamax < -90 || lamax > 90) {
      response.status(400).send({error: "Coordinates out of valid range"});
      return;
    }
    
    console.log("Parsed bbox:", {lomin, lamin, lomax, lamax});
    
    // Get OpenSky credentials from environment variables (for v2)
    const OPENSKY_USER = process.env.OPENSKY_USER;
    const OPENSKY_PASS = process.env.OPENSKY_PASS;
    const authHeader = OPENSKY_USER && OPENSKY_PASS ?
      "Basic " + Buffer.from(OPENSKY_USER + ":" + OPENSKY_PASS).toString("base64") :
      null;

    const url = `https://opensky-network.org/api/states/all?lamin=${lamin}&lomin=${lomin}&lamax=${lamax}&lomax=${lomax}`;
    console.log("Requesting URL:", url);
    try {
      const headers = {};
      if (authHeader) {
        headers["Authorization"] = authHeader;
        console.log("Using authenticated request");
      } else {
        console.log("Using anonymous request (rate limited)");
      }
      
      const apiResponse = await axios.get(url, {
        headers,
        timeout: 10000, // 10 second timeout
      });
      
      console.log(`Successfully fetched ${apiResponse.data.states?.length || 0} flights`);
      response.status(200).send(apiResponse.data);
    } catch (error) {
      console.error("Error fetching from OpenSky:", error.message);
      if (error.response) {
        console.error("Error status:", error.response.status);
        console.error("Error data:", error.response.data);
        
        // Return more specific error messages
        if (error.response.status === 429) {
          response.status(429).send({
            error: "Rate limit exceeded. Please wait before making another request.",
            details: "OpenSky Network has strict rate limits. Consider adding authentication credentials."
          });
          return;
        } else if (error.response.status === 401) {
          response.status(500).send({
            error: "Authentication failed with OpenSky Network",
            details: "Please check OPENSKY_USER and OPENSKY_PASS environment variables"
          });
          return;
        }
      }
      
      response.status(500).send({
        error: "Failed to fetch data from OpenSky.",
        details: error.message
      });
    }
  });
});

// New function to search flight by callsign
exports.searchFlightByCallsign = functions.https.onRequest((request, response) => {
  cors(request, response, async () => {
    const callsign = request.query.callsign;
    if (!callsign) {
      response.status(400).send({error: "Missing callsign query parameter."});
      return;
    }
    
    console.log("Searching for callsign:", callsign);
    
    // Get OpenSky credentials from environment variables
    const OPENSKY_USER = process.env.OPENSKY_USER;
    const OPENSKY_PASS = process.env.OPENSKY_PASS;
    const authHeader = OPENSKY_USER && OPENSKY_PASS ?
      "Basic " + Buffer.from(OPENSKY_USER + ":" + OPENSKY_PASS).toString("base64") :
      null;

    // OpenSky API endpoint for all states (we'll filter client-side)
    const url = `https://opensky-network.org/api/states/all`;
    console.log("Requesting URL:", url);
    
    try {
      const headers = {};
      if (authHeader) {
        headers["Authorization"] = authHeader;
        console.log("Using authenticated request");
      } else {
        console.log("Using anonymous request (rate limited)");
      }
      
      const apiResponse = await axios.get(url, {
        headers,
        timeout: 15000, // 15 second timeout
      });
      
      // Filter flights by callsign
      const allFlights = apiResponse.data.states || [];
      const matchedFlights = allFlights.filter(flight => {
        const flightCallsign = flight[1] ? flight[1].trim().toUpperCase() : '';
        return flightCallsign.includes(callsign.trim().toUpperCase());
      });
      
      console.log(`Found ${matchedFlights.length} flights matching callsign: ${callsign}`);
      
      response.status(200).send({
        time: apiResponse.data.time,
        states: matchedFlights
      });
    } catch (error) {
      console.error("Error fetching from OpenSky:", error.message);
      if (error.response) {
        console.error("Error status:", error.response.status);
        console.error("Error data:", error.response.data);
        
        if (error.response.status === 429) {
          response.status(429).send({
            error: "Rate limit exceeded. Please wait before making another request.",
            details: "OpenSky Network has strict rate limits."
          });
          return;
        } else if (error.response.status === 401) {
          response.status(500).send({
            error: "Authentication failed with OpenSky Network",
            details: "Please check credentials"
          });
          return;
        }
      }
      
      response.status(500).send({
        error: "Failed to search flight.",
        details: error.message
      });
    }
  });
});