// Creating a Leaflet map centered on Washington State
var map = L.map('map', {zoomSnap: 0.05}).setView([47.297, -120.74], 7.55); // zoomSnap allows fractional zoom levels for smoother zooming

// Add the OpenStreetMap tile layer (map embed)
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { // xyz are placeholders Leaflet fills in automatically
    maxZoom: 19,
    attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>' // attribution is required by OpenStreetMap licensing!
}).addTo(map);

// Filled from exported JSON (will store prediction data loaded from JSON)
const dailyPredictions = {}; // probability of outage per county
const dailyReasons = {}; // explanation text for predictions

// Dictionary mapping county names to NOAA weather forecast links
// When a county is clicked on the map, this link opens
// Can potentially be improved further by automating the centroids, but for Washington State this is sufficient
const countyLinks = {
    "King": "https://forecast.weather.gov/MapClick.php?lat=47.490898457286626&lon=-121.83595726271486",
    "Pierce": "https://forecast.weather.gov/MapClick.php?lat=47.0377&lon=-122.1374",
    "Snohomish": "https://forecast.weather.gov/MapClick.php?lat=48.046&lon=-121.7222",
    "Yakima": "https://forecast.weather.gov/MapClick.php?lat=46.457&lon=-120.7385",
    "Whitman": "https://forecast.weather.gov/MapClick.php?lat=46.9012&lon=-117.523",
    "Whatcom": "https://forecast.weather.gov/MapClick.php?lat=48.8297&lon=-121.873",
    "Walla Walla": "https://forecast.weather.gov/MapClick.php?lat=46.2298&lon=-118.4785",
    "Wahkiakum": "https://forecast.weather.gov/MapClick.php?lat=46.2914&lon=-123.4335",
    "Thurston": "https://forecast.weather.gov/MapClick.php?lat=46.9296&lon=-122.8322",
    "Stevens": "https://forecast.weather.gov/MapClick.php?lat=48.3991&lon=-117.8551",
    "Spokane": "https://forecast.weather.gov/MapClick.php?lat=47.6207&lon=-117.404",
    "Skamania": "https://forecast.weather.gov/MapClick.php?lat=46.0229&lon=-121.9147",
    "Skagit": "https://forecast.weather.gov/MapClick.php?lat=48.4821&lon=-121.8013",
    "San Juan": "https://forecast.weather.gov/MapClick.php?lat=48.5633&lon=-122.978",
    "Pend Oreille": "https://forecast.weather.gov/MapClick.php?lat=48.5323&lon=-117.274",
    "Pacific": "https://forecast.weather.gov/MapClick.php?lat=46.5513&lon=-123.7789",
    "Okanogan": "https://forecast.weather.gov/MapClick.php?lat=48.5488&lon=-119.7409",
    "Mason": "https://forecast.weather.gov/MapClick.php?lat=47.3505&lon=-123.1831",
    "Lincoln": "https://forecast.weather.gov/MapClick.php?lat=47.5762&lon=-118.4188",
    "Lewis": "https://forecast.weather.gov/MapClick.php?lat=46.5777&lon=-122.3924",
    "Klickitat": "https://forecast.weather.gov/MapClick.php?lat=45.8738&lon=-120.7892",
    "Kittitas": "https://forecast.weather.gov/MapClick.php?lat=47.1242&lon=-120.6797",
    "Kitsap": "https://forecast.weather.gov/MapClick.php?lat=47.6397&lon=-122.6492",
    "Jefferson": "https://forecast.weather.gov/MapClick.php?lat=47.7765&lon=-123.5743",
    "Island": "https://forecast.weather.gov/MapClick.php?lat=48.1629&lon=-122.5752",
    "Grays Harbor": "https://forecast.weather.gov/MapClick.php?lat=47.1444&lon=-123.8285",
    "Grant": "https://forecast.weather.gov/MapClick.php?lat=47.2056&lon=-119.4518",
    "Garfield": "https://forecast.weather.gov/MapClick.php?lat=46.4315&lon=-117.5452",
    "Franklin": "https://forecast.weather.gov/MapClick.php?lat=46.5347&lon=-118.8988",
    "Ferry": "https://forecast.weather.gov/MapClick.php?lat=48.4702&lon=-118.5166",
    "Douglas": "https://forecast.weather.gov/MapClick.php?lat=47.7361&lon=-119.6917",
    "Cowlitz": "https://forecast.weather.gov/MapClick.php?lat=46.1933&lon=-122.6809",
    "Columbia": "https://forecast.weather.gov/MapClick.php?lat=46.2976&lon=-117.9079",
    "Clark": "https://forecast.weather.gov/MapClick.php?lat=45.7792&lon=-122.4825",
    "Clallam": "https://forecast.weather.gov/MapClick.php?lat=48.1104&lon=-123.9344",
    "Chelan": "https://forecast.weather.gov/MapClick.php?lat=47.8691&lon=-120.6189",
    "Benton": "https://forecast.weather.gov/MapClick.php?lat=46.2398&lon=-119.5111",
    "Asotin": "https://forecast.weather.gov/MapClick.php?lat=46.1918&lon=-117.2031",
    "Adams": "https://forecast.weather.gov/MapClick.php?lat=46.9833&lon=-118.5606"
}
// Convert outage probability into a color for the map
function getColor(d) {
    if (d === null || d === undefined) return '#9e9e9e'; // Missing data -> gray
    return d > 0.9 ? '#610000' : // Higher probability -> darker red
        d > 0.7 ? '#7e0000' :
            d > 0.5 ? '#d80000' :
                d > 0.3 ? '#e3311a' :
                    d > 0.2 ? '#ff6e1d' :
                        d > 0.1 ? '#fbe361' :
                            '#8cff7a'; // Lower probability -> green
}

// Styling function applied to each county polygon!
// Leaflet calls this automatically for each GeoJSON feature
function style(feature) {
    const countyName = feature.properties.JURISDICT_LABEL_NM; // extract county name from GeoJSON properties
    const predictionValue = dailyPredictions[countyName]; // look up prediction value for that county
    return {
        fillColor: getColor(predictionValue), // color based on predicted risk
        weight: 2,
        opacity: 1,
        color: 'white',
        dashArray: '3',
        fillOpacity: 0.65 // translucent fill :)
    };
}

let geojsonLayer; // GeoJSON layer variable (stores all county shapes)
var info = L.control(); // create an information control (hovering info panel)

// Called when the info panel is added to the map
info.onAdd = function () {
    this._div = L.DomUtil.create('div', 'info'); // create HTML container for the panel
    this.update();
    return this._div;
};

// Update the hover panel when the mouse moves over a county
info.update = function (props) {
    if (!props) {
        this._div.innerHTML = '<h4>Outage Prediction per County</h4>Hover over a county'; // if out of bounds, show default text
        return;
    }

    const countyName = props.JURISDICT_LABEL_NM; // extract county name
    const val = dailyPredictions[countyName]; // retrieve prediction...
    const reason = dailyReasons[countyName] || ""; // ...and explanation

    // Display risk percentage and reason
    this._div.innerHTML =
        '<h4>Outage Prediction per County</h4>' +
        '<b>' + countyName + '</b><br />' +
        (val !== undefined ? (val * 100).toFixed(0) + '% Risk' : 'No data') +
        (reason ? '<br /> <span id="reason">' + reason + '</span>' : '');
};

info.addTo(map); // add the info panel to the map

// Highlight a county when the mouse moves over it (changed to be lower opacity instead of high for visualization purposes)
function highlightFeature(e) {
    var layer = e.target;
    // Change border style to highlight the county
    layer.setStyle({
        weight: 4,
        color: '#585e6e',
        dashArray: '',
        fillOpacity: 0.15
    });
    layer.bringToFront(); // making sure the highlighted layer shows up above others
    info.update(layer.feature.properties); // update hover panel
}

// Reset county style when the mouse leaves
function resetHighlight(e) {
    geojsonLayer.resetStyle(e.target);
    info.update();
}

// Update the map when new prediction data is loaded
function updateMap(newData) {
    Object.keys(newData).forEach(county => {
        // Handle two possible JSON formats
        if (typeof newData[county] === 'number') { // county -> probability
            dailyPredictions[county] = newData[county];
            dailyReasons[county] = ""; // (no reason)
        } else { // county -> {probability, reason}
            dailyPredictions[county] = newData[county].probability ?? 0; // "nullish coalescing" (??) to prevent undefined values
            dailyReasons[county] = newData[county].reason ?? ""; // x ?? y, if x = null then return y, otherwise return x
        }
    });

    // Update county colors
    if (geojsonLayer) {
        geojsonLayer.setStyle(style);
    }
    info.update();
}

// Load prediction data exported from the machine learning model
async function loadPredictionData() {
    try {
        // Fetch JSON predictions
        const response = await fetch(`county_outage_risk_wa.json?t=${Date.now()}`); // Date.now() prevents browser caching to always get fresh data
        const data = await response.json();
        const predictions = data.predictions || {};

        // clear old values (previous prediction data) first
        Object.keys(dailyPredictions).forEach(k => delete dailyPredictions[k]);
        Object.keys(dailyReasons).forEach(k => delete dailyReasons[k]);

        // Update map with new predictions
        updateMap(predictions);
        updateMetricsDisplay();

        console.log('Loaded prediction data:', data);
    } catch (err) { // Logging errors in case they occur
        console.error('Failed to load prediction data:', err);
    }
}

// Load the GeoJSON file containing the geographic boundaries of all WA counties
fetch('WA_County_Boundaries.geojson')
    .then(response => response.json()) // convert the response into usable JSON data
    .then(data => { // create the map layer once the GeoJSON data is loaded
        geojsonLayer = L.geoJson(data, { // convert GeoJSON features into Leaflet map polygons
            style: style, // apply the styling function defined earlier (risk -> colors)
            onEachFeature: function (feature, layer) { // onEachFeature runs once for every county polygon. Used to attach events and tooltips
                layer.bindTooltip("Click for more weather info!", { // add tooltip text when hovering over the county
                    sticky: true, // tooltip follows cursor
                    direction: 'auto',
                    className: 'tooltipTM'
                });

                layer.on({ // add mouse interaction events
                    mouseover: highlightFeature, // when the mouse enters a county
                    mouseout: resetHighlight, // when the mouse leaves a county
                    click: function () { // when the county is clicked
                        const countyName = feature.properties.JURISDICT_LABEL_NM; // get county name from GeoJSON

                        // Look up NOAA forecast link for that county (listed in earlier dictionary), or go to default link for Washington State
                        const url = countyLinks[countyName] || "https://forecast.weather.gov/MapClick.php?lat=47.4113&lon=-120.5563";
                        window.open(url, '_blank'); // open in new browser tab
                    }
                });
            }
        }).addTo(map); // add the counties layer to the map

        geojsonLayer.setStyle(style); // apply styling immediately (in case predictions load first)
    })
    .catch(err => { // error handling if the GeoJSON file fails to load
        console.error('Failed to load GeoJSON:', err);
    });

// Load prediction data from the model JSON file (fills in county colors and metrics)
loadPredictionData();

// Create a legend control at the bottom right corner
var legend = L.control({ position: 'bottomright' });

// Called when the legend is added to the map
legend.onAdd = function () {
    var div = L.DomUtil.create('div', 'info legend'), // create the HTML container for the legend
        levels = [0, 0.1, 0.2, 0.3, 0.5, 0.7, 0.9]; // risk probability thresholds used in the map color scale

    div.innerHTML += '<h4>Risk Level</h4>'; // legend title

    // Loop through risk levels and create legend entries
    for (var i = 0; i < levels.length; i++) {
        div.innerHTML +=
            '<i style="background:' + getColor(levels[i] + 0.01) + '"></i> ' + // small colored square
            (levels[i] * 100) + // convert probability into percentage (* 100) for display
            (levels[i + 1] ? '&ndash;' + (levels[i + 1] * 100) + '%<br>' : '%+'); // show the range for each color band
    }

    return div; // return the legend element so Leaflet can display it
};

// Add legend to map
legend.addTo(map);