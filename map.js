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

// helper function to format time
function formatTime(minutes) {
  const date = new Date(0, 0, 0, 0, minutes); // Set hours & minutes
  return date.toLocaleString("en-US", { timeStyle: "short" }); // Format as HH:MM AM/PM
}

// function to update time label
function computeStationTraffic(stations, timeFilter = -1) {
  const departures = d3.rollup(
    filterByMinute(departuresByMinute, timeFilter),
    (v) => v.length,
    (d) => d.start_station_id
  );

  const arrivals = d3.rollup(
    filterByMinute(arrivalsByMinute, timeFilter),
    (v) => v.length,
    (d) => d.end_station_id
  );

  return stations.map((station) => {
    let id = station.short_name;
    station.arrivals = arrivals.get(id) ?? 0;
    station.departures = departures.get(id) ?? 0;
    station.totalTraffic = station.arrivals + station.departures;
    return station;
  });
}

// helper function to get minutes since midnight
function minutesSinceMidnight(date) {
  return date.getHours() * 60 + date.getMinutes();
}

// helper function to filter trips by minute
function filterByMinute(tripsByMinute, minute) {
  if (minute === -1) {
    // return all trips if no time is selected
    return tripsByMinute.flat();
  }

  // Normalize min and max to minute range
  let minMinute = (minute - 60 + 1440) % 1440;
  let maxMinute = (minute + 60) % 1440;

  // filter time range
  if (minMinute > maxMinute) {
    let beforeMidnight = tripsByMinute.slice(minMinute);
    let afterMidnight = tripsByMinute.slice(0, maxMinute);
    return beforeMidnight.concat(afterMidnight).flat();
  } else {
    return tripsByMinute.slice(minMinute, maxMinute).flat();
  }
}

let departuresByMinute = Array.from({ length: 1440 }, () => []);
let arrivalsByMinute = Array.from({ length: 1440 }, () => []);

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

  let trips = await d3.csv(
    "https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv",
    (trip) => {
      trip.started_at = new Date(trip.started_at);
      trip.ended_at = new Date(trip.ended_at);

      let startedMinutes = minutesSinceMidnight(trip.started_at);
      let endedMinutes = minutesSinceMidnight(trip.ended_at);

      departuresByMinute[startedMinutes].push(trip);
      arrivalsByMinute[endedMinutes].push(trip);

      return trip;
    }
  );

  let stations = computeStationTraffic(jsonData.data.stations);
  console.log("Stations Array:", stations);

  console.log("Stations with Traffic Data:", stations);

  const radiusScale = d3
    .scaleSqrt()
    .domain([0, d3.max(stations, (d) => d.totalTraffic)])
    .range([0, 25]);

  let stationFlow = d3.scaleQuantize().domain([0, 1]).range([0, 0.5, 1]);

  const svg = d3.select("#map").select("svg");
  const circles = svg
    .selectAll("circle")
    .data(stations, (d) => d.short_name)
    .enter()
    .append("circle")
    .attr("r", (d) => radiusScale(d.totalTraffic))
    .attr("fill", "steelblue")
    .attr("stroke", "white")
    .attr("stroke-width", 1)
    .attr("opacity", 0.6)
    .style("--departure-ratio", (d) =>
      stationFlow(d.departures / d.totalTraffic)
    )
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

  const timeSlider = document.getElementById("time-slider");
  const selectedTime = document.getElementById("selected-time");
  const anyTimeLabel = document.getElementById("any-time");

  // function to update time label
  function updateTimeDisplay() {
    let timeFilter = Number(timeSlider.value);

    if (timeFilter === -1) {
      selectedTime.textContent = "";
      anyTimeLabel.style.display = "block";
    } else {
      selectedTime.textContent = formatTime(timeFilter);
      anyTimeLabel.style.display = "none";
    }

    updateScatterPlot(timeFilter);
  }

  function updateScatterPlot(timeFilter) {
    // recompute station traffic based on the filtered trips
    const filteredStations = computeStationTraffic(stations, timeFilter);

    timeFilter === -1 ? radiusScale.range([0, 25]) : radiusScale.range([3, 50]);

    // update the scatterplot by adjusting the radius of circles
    circles
      .data(filteredStations, (d) => d.short_name)
      .join("circle")
      .attr("r", (d) => radiusScale(d.totalTraffic))
      .style("--departure-ratio", (d) =>
        stationFlow(d.departures / d.totalTraffic)
      );
  }

  // update time label on slider change
  timeSlider.addEventListener("input", updateTimeDisplay);
  updateTimeDisplay();
});
