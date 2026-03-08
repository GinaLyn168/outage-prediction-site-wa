var map = L.map('map', {zoomSnap: 0.05}).setView([47.297, -120.74], 7.55);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
}).addTo(map);

// Filled from exported JSON
const dailyPredictions = {};
const dailyReasons = {};
let modelMetrics = null;
let generatedAt = null;

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

function getColor(d) {
    if (d === null || d === undefined) return '#9e9e9e';
    return d > 0.9 ? '#610000' :
        d > 0.7 ? '#7e0000' :
            d > 0.5 ? '#d80000' :
                d > 0.3 ? '#e3311a' :
                    d > 0.2 ? '#ff6e1d' :
                        d > 0.1 ? '#fbe361' :
                            '#8cff7a';
}

function style(feature) {
    const countyName = feature.properties.JURISDICT_LABEL_NM;
    const predictionValue = dailyPredictions[countyName];
    return {
        fillColor: getColor(predictionValue),
        weight: 2,
        opacity: 1,
        color: 'white',
        dashArray: '3',
        fillOpacity: 0.65
    };
}

let geojsonLayer;
var info = L.control();

info.onAdd = function () {
    this._div = L.DomUtil.create('div', 'info');
    this.update();
    return this._div;
};

info.update = function (props) {
    if (!props) {
        this._div.innerHTML = '<h4>Outage Prediction</h4>Hover over a county';
        return;
    }

    const countyName = props.JURISDICT_LABEL_NM;
    const val = dailyPredictions[countyName];
    const reason = dailyReasons[countyName] || "";

    this._div.innerHTML =
        '<h4>Outage Prediction</h4>' +
        '<b>' + countyName + '</b><br />' +
        (val !== undefined ? (val * 100).toFixed(0) + '% Risk' : 'No data') +
        (reason ? '<br /> <span id="reason">' + reason + '</span>' : '');
};

info.addTo(map);

function highlightFeature(e) {
    var layer = e.target;
    layer.setStyle({
        weight: 4,
        color: '#585e6e',
        dashArray: '',
        fillOpacity: 0.85
    });
    layer.bringToFront();
    info.update(layer.feature.properties);
}

function resetHighlight(e) {
    geojsonLayer.resetStyle(e.target);
    info.update();
}

function updateMap(newData) {
    Object.keys(newData).forEach(county => {
        if (typeof newData[county] === 'number') {
            dailyPredictions[county] = newData[county];
            dailyReasons[county] = "";
        } else {
            dailyPredictions[county] = newData[county].probability ?? 0;
            dailyReasons[county] = newData[county].reason ?? "";
        }
    });

    if (geojsonLayer) {
        geojsonLayer.setStyle(style);
    }

    info.update();
}

function updateMetricsDisplay() {
    const el = document.getElementById('model-metrics');
    if (!el || !modelMetrics) return;

    el.innerHTML = `
        <strong>Model Performance</strong><br>
        AUC: ${modelMetrics.auc}<br>
        Recall: ${modelMetrics.recall}<br>
        Accuracy: ${modelMetrics.accuracy}
        ${generatedAt ? `<br><span style="font-size: 12px;">Updated: ${generatedAt}</span>` : ''}
    `;
}

async function loadPredictionData() {
    try {
        const response = await fetch('county_outage_risk_wa.json');
        const data = await response.json();

        generatedAt = data.generated_at || null;
        modelMetrics = data.metrics || null;

        const predictions = data.predictions || {};
        updateMap(predictions);
        updateMetricsDisplay();

        console.log('Loaded prediction data:', data);
    } catch (err) {
        console.error('Failed to load prediction data:', err);
    }
}

fetch('WA_County_Boundaries.geojson')
    .then(response => response.json())
    .then(data => {
        geojsonLayer = L.geoJson(data, {
            style: style,
            onEachFeature: function (feature, layer) {
                layer.bindTooltip("Click for more weather info!", {
                    sticky: true,
                    direction: 'auto',
                    className: 'tooltipTM'
                });

                layer.on({
                    mouseover: highlightFeature,
                    mouseout: resetHighlight,
                    click: function () {
                        const countyName = feature.properties.JURISDICT_LABEL_NM;
                        const url = countyLinks[countyName] || "https://forecast.weather.gov/MapClick.php?lat=47.4113&lon=-120.5563";
                        window.open(url, '_blank');
                    }
                });
            }
        }).addTo(map);

        geojsonLayer.setStyle(style);
    })
    .catch(err => {
        console.error('Failed to load GeoJSON:', err);
    });

loadPredictionData();

var legend = L.control({ position: 'bottomright' });

legend.onAdd = function () {
    var div = L.DomUtil.create('div', 'info legend'),
        levels = [0, 0.1, 0.2, 0.3, 0.5, 0.7, 0.9];

    div.innerHTML += '<h4>Risk Level</h4>';

    for (var i = 0; i < levels.length; i++) {
        div.innerHTML +=
            '<i style="background:' + getColor(levels[i] + 0.01) + '"></i> ' +
            (levels[i] * 100) +
            (levels[i + 1] ? '&ndash;' + (levels[i + 1] * 100) + '%<br>' : '%+');
    }

    return div;
};

legend.addTo(map);