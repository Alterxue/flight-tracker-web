import React,{useRef ,useEffect,useState, useCallback} from 'react'
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import './App.css';
import axios from 'axios'
mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN;
const function_url = "https://getliveflights-m7umd3azqq-uc.a.run.app";

// Airline ICAO code mapping (Common airlines)
const airlineMapping = {
  'CCA': 'Air China',
  'CSN': 'China Southern Airlines',
  'CES': 'China Eastern Airlines',
  'CHH': 'Hainan Airlines',
  'CSC': 'Sichuan Airlines',
  'CXA': 'Xiamen Airlines',
  'CDC': 'Chengdu Airlines',
  'CBJ': 'Capital Airlines',
  'CYZ': 'China Postal Airlines',
  'SZX': 'Shenzhen Airlines',
  'AFL': 'Aeroflot',
  'AFR': 'Air France',
  'AAL': 'American Airlines',
  'ANA': 'All Nippon Airways',
  'BAW': 'British Airways',
  'CPA': 'Cathay Pacific',
  'DAL': 'Delta Air Lines',
  'DLH': 'Lufthansa',
  'EZY': 'easyJet',
  'ETH': 'Ethiopian Airlines',
  'FDX': 'FedEx',
  'JAL': 'Japan Airlines',
  'KAL': 'Korean Air',
  'KLM': 'KLM Royal Dutch Airlines',
  'QFA': 'Qantas',
  'QTR': 'Qatar Airways',
  'RYR': 'Ryanair',
  'SIA': 'Singapore Airlines',
  'SWA': 'Southwest Airlines',
  'THY': 'Turkish Airlines',
  'UAE': 'Emirates',
  'UAL': 'United Airlines',
  'UPS': 'UPS',
  'VIR': 'Virgin Atlantic',
};

// Extract airline info from callsign
const getAirlineInfo = (callsign) => {
  if (!callsign || callsign === 'N/A') return 'Unknown';
  const prefix = callsign.substring(0, 3).toUpperCase();
  return airlineMapping[prefix] || `${prefix} (Unknown)`;
};

function App(){
  const mapContainer = useRef(null);
  const map = useRef(null);
  const [lng,setlng] = useState(10);
  const [lat,setlat] = useState(45);
  const [zoom,setzoom] = useState(1.5);
  const [flights,setFlights] = useState([]);
  const [flightGeoJson,setFlightGeoJson] = useState({
    type: 'FeatureCollection',
    features: []
  });
  const [filterText, setFilterText] = useState('');
  
  // Apply filter to map layer - supports both airline code and airline name
  const applyFilter = useCallback((filterValue) => {
    if (!map.current || !map.current.getLayer('live-flights-layer')) return;
    
    if (!filterValue || filterValue.trim() === '') {
      // Show all flights
      map.current.setFilter('live-flights-layer', null);
    } else {
      const upperFilter = filterValue.toUpperCase().trim();
      
      // Check if input matches an airline name, get its code
      let matchedCodes = [];
      Object.entries(airlineMapping).forEach(([code, name]) => {
        if (name.toUpperCase().includes(upperFilter) || code.toUpperCase().includes(upperFilter)) {
          matchedCodes.push(code);
        }
      });
      
      if (matchedCodes.length > 0) {
        // Filter by matched airline codes
        const filters = matchedCodes.map(code => 
          ['>=', ['index-of', code, ['upcase', ['get', 'callsign']]], 0]
        );
        map.current.setFilter('live-flights-layer', [
          'any',
          ...filters
        ]);
      } else {
        // Filter by callsign prefix (direct match)
        map.current.setFilter('live-flights-layer', [
          'all',
          ['has', 'callsign'],
          ['>=', ['index-of', upperFilter, ['upcase', ['get', 'callsign']]], 0]
        ]);
      }
    }
  }, []);
  const fetchFlights = useCallback(async()=>{
    if (!map.current) return; 
    const bounds = map.current.getBounds();
    const bbox = [
      bounds.getWest(),
      bounds.getSouth(),
      bounds.getEast(),
      bounds.getNorth()
    ].join(',');
    
    try {
      const response = await axios.get(function_url, {
        params: { 
          bbox: bbox
        }
      });
      const flightData = response.data.states || [];
      const features = flightData.map(flight => {
        return {
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [flight[5], flight[6]]
          },
          properties: {
            icao24: flight[0],
            callsign: flight[1] ? flight[1].trim() : 'N/A',
            origin_country: flight[2] || 'Unknown',
            time_position: flight[3],
            last_contact: flight[4],
            longitude: flight[5],
            latitude: flight[6],
            baro_altitude: flight[7], 
            on_ground: flight[8],
            velocity: flight[9],        
            true_track: flight[10] || 0,
            vertical_rate: flight[11],
            geo_altitude: flight[13]  
          }
        };
      }).filter(f => f.geometry.coordinates[0] && f.geometry.coordinates[1]);
      setFlightGeoJson({
        type: 'FeatureCollection',
        features: features
      });

      console.log(`Fetched ${features.length} flights for current view.`);

    } catch (error) {
      console.error("failure to get datas:", error);
      
      // Show user-friendly error message
      if (error.response) {
        if (error.response.status === 429) {
          console.warn("⚠️ Rate limit exceeded. Waiting before next request...");
        } else if (error.response.data?.details) {
          console.error("Error details:", error.response.data.details);
        }
      }
      
      // Return empty dataset on error to prevent crashes
      setFlightGeoJson({
        type: 'FeatureCollection',
        features: []
      });
    }
  },[]);
  useEffect(()=>{
    if(map.current) return;
    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [10,45],
      zoom: 4
    });
    map.current.addControl(new mapboxgl.NavigationControl(),'top-right');

    map.current.on('load',()=>{
      map.current.loadImage(
        '/plane-icon.png',
        (error,image)=>{
          if(error) throw error;
          map.current.addImage('plane-icon',image);
          map.current.addSource('live-flights',{
            type:'geojson',
            data:{
              type:'FeatureCollection',
              features:[]
            }
          });
          map.current.addLayer({
            id:'live-flights-layer',
            type: 'symbol',
            source: 'live-flights',
            layout:{
              'icon-image': 'plane-icon',
              'icon-size': 0.05,
              'icon-rotate': ['get','true_track'],
              'icon-allow-overlap': true,
              'icon-ignore-placement': true
            }
          });
          map.current.on('click', 'live-flights-layer', (e) => {
            if (!e.features || e.features.length === 0) {
              console.log('No features clicked');
              return;
            }
            
            const feature = e.features[0];
            const callsign = feature.properties.callsign || 'N/A';
            const icao24 = feature.properties.icao24 || 'Unknown';
            const origin_country = feature.properties.origin_country || 'Unknown';
            const baro_altitude = feature.properties.baro_altitude;
            const geo_altitude = feature.properties.geo_altitude;
            const velocity = feature.properties.velocity;
            const on_ground = feature.properties.on_ground;
            const coordinates = feature.geometry.coordinates.slice();

            const airline = getAirlineInfo(callsign);

            const altitude_m = baro_altitude !== null && baro_altitude !== undefined 
              ? baro_altitude 
              : (geo_altitude !== null && geo_altitude !== undefined ? geo_altitude : 0);
            
            const altitude_ft = Math.round(altitude_m * 3.28084);
            
            const speed_kmh = velocity !== null && velocity !== undefined 
              ? Math.round(velocity * 3.6) 
              : 0;
            
            console.log('Clicked flight:', {
              callsign, 
              airline,
              icao24, 
              origin_country,
              altitude_m, 
              altitude_ft,
              speed_kmh,
              on_ground,
              coordinates
            });
            
            // make sure we have got the correct lat and lon
            while (Math.abs(e.lngLat.lng - coordinates[0]) > 180) {
              coordinates[0] += e.lngLat.lng > coordinates[0] ? 360 : -360;
            }
            
            const statusText = on_ground ? '🛬 On Ground' : '✈️ In Flight';
            const altitudeDisplay = on_ground 
              ? 'Ground' 
              : `${altitude_ft.toLocaleString()} ft (${Math.round(altitude_m)} m)`;
            
            new mapboxgl.Popup({
              closeButton: true,
              closeOnClick: true,
              maxWidth: '350px'
            })
              .setLngLat(coordinates)
              .setHTML(`
                <div style="min-width: 280px; padding: 5px;">
                  <h3 style="margin: 0 0 12px 0; color: #4a9eff; font-size: 20px; font-weight: bold; border-bottom: 2px solid #4a9eff; padding-bottom: 8px;">
                    ✈️ ${callsign}
                  </h3>
                  
                  <div style="background: rgba(74, 158, 255, 0.1); padding: 8px; border-radius: 5px; margin-bottom: 10px;">
                    <p style="margin: 3px 0; font-size: 14px; color: #4a9eff;">
                      <strong>🏢 Airline:</strong> ${airline}
                    </p>
                  </div>
                  
                  <p style="margin: 8px 0; font-size: 14px;">
                    <strong>📍 Status:</strong> ${statusText}
                  </p>
                  
                  <p style="margin: 8px 0; font-size: 14px;">
                    <strong>📏 Altitude:</strong> ${altitudeDisplay}
                  </p>
                  
                  <p style="margin: 8px 0; font-size: 14px;">
                    <strong>⚡ Speed:</strong> ${speed_kmh} km/h
                  </p>
                  
                  <p style="margin: 8px 0; font-size: 14px;">
                    <strong>🌍 Country:</strong> ${origin_country}
                  </p>
                  
                  <hr style="border: none; border-top: 1px solid #333; margin: 10px 0;">
                  
                  <p style="margin: 5px 0; font-size: 11px; color: #888; font-style: italic;">
                    ⚠️ Route info requires paid API
                  </p>
                  
                  <p style="margin: 8px 0; font-size: 12px; color: #999;">
                    <strong>ICAO24:</strong> ${icao24}
                  </p>
                </div>
              `)
              .addTo(map.current);
            });
          map.current.on('mouseenter', 'live-flights-layer', () => {
            map.current.getCanvas().style.cursor = 'pointer';
          });
          map.current.on('mouseleave', 'live-flights-layer', () => {
            map.current.getCanvas().style.cursor = '';
          });

          fetchFlights();

          const intervalId = setInterval(fetchFlights, 15000); // 15 seconds

          map.current.on('moveend', fetchFlights);

          return () => {
            clearInterval(intervalId);
          };
        }
      );
    });
  },[fetchFlights,flightGeoJson]);
  
  useEffect(()=>{
    if(map.current && map.current.getSource('live-flights')){
      map.current.getSource('live-flights').setData(flightGeoJson);
    }
  },[flightGeoJson]);

  return(
    <div>
        <div ref={mapContainer} className='map-container'/>
        
        {/* Filter Box */}
        <div className="filter-box">
          <div className="filter-header">
            <span className="filter-icon">🔍</span>
            <span className="filter-title">Filter Flights</span>
          </div>
          <input
            type="text"
            placeholder="Enter airline name or code (e.g., British Airways, BAW)"
            value={filterText}
            onChange={(e) => {
              const value = e.target.value;
              setFilterText(value);
              applyFilter(value);
            }}
            className="filter-input"
          />
          {filterText && (
            <button 
              className="clear-filter-btn"
              onClick={() => {
                setFilterText('');
                applyFilter('');
              }}
            >
              ✕ Clear
            </button>
          )}
          <div className="filter-examples">
            <small>Quick filters:</small>
            {[
              {code: 'BAW', name: 'British Airways'}, 
              {code: 'CCA', name: 'Air China'}, 
              {code: 'AFL', name: 'Aeroflot'},
              {code: 'Lufthansa', name: 'Lufthansa'},
              {code: 'Emirates', name: 'Emirates'}
            ].map(item => (
              <button
                key={item.code}
                className="example-btn"
                onClick={() => {
                  setFilterText(item.code);
                  applyFilter(item.code);
                }}
                title={item.name}
              >
                {item.code}
              </button>
            ))}
          </div>
        </div>
    </div>
  )
}
export default App;