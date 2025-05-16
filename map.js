import mapboxgl from "https://cdn.jsdelivr.net/npm/mapbox-gl@2.15.0/+esm";
import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm";

console.log("Mapbox GL JS Loaded:", mapboxgl);

// mapbox access token
mapboxgl.accessToken =
  "pk.eyJ1IjoicmthdGFiYXQiLCJhIjoiY21hb2U3bHczMDRhZzJrcTI2MWIwN24yOCJ9.xJcA3D-Kx1dMYlMX0T6XCg";

// helper function to get coordinates
function getCoords(station) {
  const point = new mapboxgl.LngLat(+station.lon, +station.lat); // Convert lon/lat to Mapbox LngLat
  const { x, y } = map.project(point); // Project to pixel coordinates
  return { cx: x, cy: y }; // Return as object for use in SVG attributes
}

// initialize map
const map = new mapboxgl.Map({
  container: "map", // id of div container
  // style: 'mapbox://styles/mapbox/streets-v12',
  // style: "mapbox://styles/rkatabat/cmar8bm69006501rfhu0igkkv",
  style: "mapbox://styles/mapbox/navigation-guidance-night-v3",
  center: [-71.09415, 42.36027], // lon, lat
  zoom: 12,
  minZoom: 5,
  maxZoom: 18,
});

const bikeLaneStyle = {
  "line-color": "green",
  "line-width": 4,
  "line-opacity": 0.4,
};
// alternate bike lane style
// paint: {
//   "line-color": "#32D400", // A bright green using hex code
//   "line-width": 5, // Thicker lines
//   "line-opacity": 0.6, // Slightly less transparent
// },

map.on("load", async () => {
  // boston bike lanes
  map.addSource("boston_route", {
    type: "geojson",
    data: "https://bostonopendata-boston.opendata.arcgis.com/datasets/boston::existing-bike-network-2022.geojson",
  });
  map.addLayer({
    id: "bike-lanes",
    type: "line",
    source: "boston_route",
    paint: bikeLaneStyle,
  });

  // cambridge bike lanes
  map.addSource("cambridge_route", {
    type: "geojson",
    data: "https://raw.githubusercontent.com/cambridgegis/cambridgegis_data/main/Recreation/Bike_Facilities/RECREATION_BikeFacilities.geojson",
  });
  map.addLayer({
    id: "cambridge-bike-lanes",
    type: "line",
    source: "cambridge_route",
    paint: bikeLaneStyle,
  });

  // bike station locations
  let jsonData;
  try {
    const jsonurl =
      "https://dsc106.com/labs/lab07/data/bluebikes-stations.json";

    jsonData = await d3.json(jsonurl);
    console.log("Loaded JSON data:", jsonData);
  } catch (error) {
    console.error("Error loading JSON:", error);
  }

  let trips;
  try {
    const tripsurl =
      "https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv";

    trips = await d3.csv(tripsurl);
    console.log("Loaded Trips data:", trips);
  } catch (error) {
    console.error("Error loading Trips:", error);
  }

  const departures = d3.rollup(
    trips,
    (v) => v.length,
    (d) => d.start_station_id
  );

  const arrivals = d3.rollup(
    trips,
    (v) => v.length,
    (d) => d.end_station_id
  );

  let stations = jsonData.data.stations;
  console.log("Stations Array:", stations);

  stations = stations.map((station) => {
    let id = station.short_name;
    station.arrivals = arrivals.get(id) ?? 0;
    station.departures = departures.get(id) ?? 0;
    station.totalTraffic = station.arrivals + station.departures;
    return station;
  });

  console.log("Stations with Traffic Data:", stations);

  const radiusScale = d3
    .scaleSqrt()
    .domain([0, d3.max(stations, (d) => d.totalTraffic)])
    .range([0, 25]);

  const svg = d3.select("#map").select("svg");
  const circles = svg
    .selectAll("circle")
    .data(stations)
    .enter()
    .append("circle")
    .attr("r", (d) => radiusScale(d.totalTraffic))
    .attr("fill", "steelblue")
    .attr("stroke", "white")
    .attr("stroke-width", 1)
    .attr("opacity", 0.6)
    .each(function (d) {
      d3.select(this)
        .append("title")
        .text(
          `${d.totalTraffic} trips (${d.departures} departures, ${d.arrivals} arrivals)`
        );
    });

  function updatePositions() {
    circles
      .attr("cx", (d) => getCoords(d).cx)
      .attr("cy", (d) => getCoords(d).cy);
  }

  // initial position update
  updatePositions();

  map.on("move", updatePositions);
  map.on("zoom", updatePositions);
  map.on("resize", updatePositions);
  map.on("moveend", updatePositions);
});
