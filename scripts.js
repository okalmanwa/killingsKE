/**
 * Select the HTML tooltip & description box.
 */
const tooltip = d3.select("#tooltip");
const description = d3.select("#description");
const buttons = d3.select("#buttons");

const body = d3.select("body");
const margins = { top: 50, right: 20, bottom: 10, left: 5 };
const svg = d3.select("svg#canvas");

const width = +svg.attr("width");
const height = +svg.attr("height");

const mapwidth = width - (margins.left + margins.right);
const mapHeight = height - (margins.top + margins.bottom);

let map = svg.append("g")
    .attr("transform", `translate(${margins.left},${margins.top})`);

let projection;
let geoPath;
let countiesGeoJSON;
let k = 1;

// Variable to track the currently zoomed county
let currentZoomedCounty = null;

// Define minimum and maximum radius for dots
const MIN_RADIUS = 2;
const MAX_RADIUS = 10;

/**
 * Calculate radius with bounds.
 * @returns {number} The calculated radius.
 */
function calculateRadius() {
    const baseRadius = 4 / k;
    return Math.max(MIN_RADIUS, Math.min(baseRadius, MAX_RADIUS));
}

/**
 * Update dimensions based on window size.
 */
function updateDimensions() {
    const container = d3.select("#map-container").node();
    const newWidth = container.getBoundingClientRect().width;
    const newHeight = container.getBoundingClientRect().height;

    svg.attr("width", newWidth)
        .attr("height", newHeight)
        .attr("viewBox", `0 0 ${newWidth} ${newHeight}`)
        .attr("preserveAspectRatio", "xMidYMid meet");

    const newMapWidth = newWidth - (margins.left + margins.right);
    const newMapHeight = newHeight - (margins.top + margins.bottom);

    // Update map group position
    map.attr("transform", `translate(${margins.left},${margins.top})`);

    // Update projection and geoPath
    if (countiesGeoJSON) {
        projection = d3.geoMercator().fitSize([newMapWidth, newMapHeight], countiesGeoJSON);
        geoPath = d3.geoPath().projection(projection);

        // Update county paths
        map.selectAll("path.county")
            .attr("d", geoPath);

        // Update border mesh
        map.select(".mesh-border")
            .attr("d", geoPath)
            .style("stroke-width", 1 / k);

        // Update people circles positions and radius
        map.selectAll("circle.person")
            .attr("cx", d => projection(d.randomPoint)[0])
            .attr("cy", d => projection(d.randomPoint)[1])
            .attr("r", () => calculateRadius());
    }
}



// Handle window resize
window.addEventListener("resize", updateDimensions);

/**
 * Load data and render the map.
 */
const loadData = async function () {
    let kenya = await d3.json('./datasets/kenya.topojson');
    countiesGeoJSON = topojson.feature(kenya, kenya.objects.KENADM1gbOpen);
    projection = d3.geoMercator().fitSize([mapwidth, mapHeight], countiesGeoJSON);
    geoPath = d3.geoPath().projection(projection);

    let zoomIdentity = d3.zoomIdentity;
    k = zoomIdentity.k;

    // Draw the map with individual county paths
    map.selectAll("path.county")
        .data(countiesGeoJSON.features)
        .join("path")
        .attr("d", geoPath)
        .attr("class", "county")
        .attr("countyName", d => d.properties.shapeName)
        .on("mouseover", function () {
            d3.select(this).attr("fill", "white");
        })
        .on("mouseout", function () {
            d3.select(this).attr("fill", "#ccc");
        });

    // Add mesh for county borders
    let borderMesh = topojson.mesh(kenya, kenya.objects.KENADM1gbOpen);
    map.append("path")
        .datum(borderMesh)
        .attr("class", "mesh-border")
        .attr("d", geoPath)
        .attr("fill", "none")
        .attr("stroke", "black")
        .style("stroke-width", 1 / k);

    // Create a mapping from county names to their geometries
    const countyMap = {};
    countiesGeoJSON.features.forEach(function (feature) {
        countyMap[feature.properties.shapeName.toLowerCase()] = feature;
    });
    const countyNames = [
        "Baringo", "Bomet", "Bungoma", "Busia", "Elgeyo-Marakwet", "Embu", "Garissa",
        "Homa Bay", "Isiolo", "Kajiado", "Kakamega", "Kericho", "Kiambu", "Kilifi",
        "Kirinyaga", "Kisii", "Kisumu", "Kitui", "Kwale", "Laikipia", "Lamu",
        "Machakos", "Makueni", "Mandera", "Marsabit", "Meru", "Migori", "Mombasa",
        "Murang'a", "Nairobi", "Nakuru", "Nandi", "Narok", "Nyamira", "Nyandarua",
        "Nyeri", "Samburu", "Siaya", "Taita-Taveta", "Tana River", "Tharaka-Nithi",
        "Trans Nzoia", "Turkana", "Uasin Gishu", "Vihiga", "Wajir", "West Pokot"
    ];

    // Load missing persons data
    let missingPersonsData = await d3.json("./datasets/missing_voices_detailed_data.json");

    // Remove those who aren't yet confirmed dead
    missingPersonsData = missingPersonsData.filter(person => person["Manner of Death"] !== "MISSING THEN FOUND" && person["Manner of Death"] !== "MISSING");

    /**
     * Extract and append county information to each data entry.
     * @param {Array} data - The missing persons data.
     * @param {Array} countyNames - List of county names to match against.
     */
    const extractAndAppendCounty = (data, countyNames) => {
        data.forEach(entry => {
            const location = entry.Location.toLowerCase();
            const county = countyNames.find(countyName => location.includes(countyName.toLowerCase()));
            entry.county = county || "unknown";
        });
    };
    let years = ["2021", "2022", "2023"];

    // Create filter buttons
    buttons.append("button")
        .text("Clear Filter")
        .attr("id", "clear-filter")
        .on("click", () => {
            showPeople(missingPersonsData, null); // Passing null to show all data
        });

    years.forEach(year => {
        buttons.append("button")
            .text(year)
            .attr("id", year)
            .on("click", () => {
                showPeople(missingPersonsData, parseInt(year));
            });
    });

    /**
     * Extract and append year each event took place for filtering purposes.
     * @param {Array} data - The missing persons data.
     * @param {Array} years - The years we have the data for.
     * Also creates a set for the methods of murder.
     */
    const causeOfDeath = new Set();
    const extractTheYear = (data, years) => {
        data.forEach(entry => {
            const year = years.find(currWord => entry["Date of Incident"].includes(currWord)); // Checks if any word in the incident date matches the years
            entry.year = parseInt(year) || "unknown";
            causeOfDeath.add(entry["Manner of Death"]);
        });
    };

    extractAndAppendCounty(missingPersonsData, countyNames);
    extractTheYear(missingPersonsData, years);

    // Filter out entries with unknown person data
    missingPersonsData = missingPersonsData.filter(person => person.county !== "unknown" && person["Manner of Death"] !== "MISSING THEN FOUND" && person["Manner of Death"] !== "MISSING");

    /**
     * Generate a random point within a given polygon (county).
     * @param {Object} countyFeature - GeoJSON feature of a county.
     * @returns {Array} Random point coordinates within the county.
     */
    function randomPointInCounty(countyFeature) {
        const bounds = d3.geoBounds(countyFeature);
        const minX = bounds[0][0];
        const minY = bounds[0][1];
        const maxX = bounds[1][0];
        const maxY = bounds[1][1];
        let point;
        do {
            const x = minX + Math.random() * (maxX - minX);
            const y = minY + Math.random() * (maxY - minY);
            point = [x, y];
        } while (!d3.geoContains(countyFeature, point)); // Check if the point is within the polygon
        return point;
    }

    // Add random points to each data entry
    missingPersonsData.forEach(d => {
        const countyName = d.county.toLowerCase();
        const countyFeature = countyMap[countyName];
        const randomPoint = randomPointInCounty(countyFeature);
        d.randomPoint = randomPoint;
    });

    // Define gradients and filters once to prevent multiple definitions
    const defs = svg.append("defs");

    /**
     * Blood gradient with a highlight effect.
     */
    const gradient = defs.append("radialGradient")
        .attr("id", "blood-gradient")
        .attr("cx", "50%")
        .attr("cy", "50%")
        .attr("r", "50%");

    gradient.append("stop")
        .attr("offset", "0%")
        .attr("stop-color", "#FF4D4D"); 

    gradient.append("stop")
        .attr("offset", "50%")
        .attr("stop-color", "#FF0000"); 

    gradient.append("stop")
        .attr("offset", "85%")
        .attr("stop-color", "#8A0303"); 

    gradient.append("stop")
        .attr("offset", "100%")
        .attr("stop-color", "#4A0101"); // Deepest red edge

    /**
     * Shadow filter with dynamic blur and offset.
     */
    const filter = defs.append("filter")
        .attr("id", "blood-shadow")
        .attr("x", "-50%")
        .attr("y", "-50%")
        .attr("width", "200%")
        .attr("height", "200%");

    filter.append("feGaussianBlur")
        .attr("in", "SourceAlpha")
        .attr("stdDeviation", 4); 

    filter.append("feOffset")
        .attr("dx", 3)
        .attr("dy", 3);

    filter.append("feMerge")
        .selectAll("feMergeNode")
        .data(["blur", "SourceGraphic"])
        .join("feMergeNode")
        .attr("in", d => d);

    const glowFilter = defs.append("filter")
        .attr("id", "blood-glow")
        .attr("x", "-50%")
        .attr("y", "-50%")
        .attr("width", "200%")
        .attr("height", "200%");

    glowFilter.append("feGaussianBlur")
        .attr("stdDeviation", 6)
        .attr("result", "coloredBlur");

    const feMerge = glowFilter.append("feMerge");
    feMerge.append("feMergeNode").attr("in", "coloredBlur");
    feMerge.append("feMergeNode").attr("in", "SourceGraphic");


    /**
     * Display people (missing persons) on the map.
     * @param {Array} data - The missing persons data.
     * @param {Number|null} year - The year to filter by. If null, show all.
     */
    function showPeople(data, year) {
        if (year != null) data = data.filter(d => d.year === year);
        // Plot the data points as enhanced droplets
        map.selectAll("circle.person")
            .data(data, d => d.Name) // Use a unique key if possible
            .join(
                enter => enter.append("circle")
                    .attr("class", "person")
                    .attr("cx", d => projection(d.randomPoint)[0])
                    .attr("cy", d => projection(d.randomPoint)[1])
                    .attr("r", () => calculateRadius()) 
                    .style("fill", "url(#blood-gradient)")
                    .style("filter", "url(#blood-shadow), url(#blood-glow)")
                    .style("opacity", 0.8)
                    .style("pointer-events", "all") // Ensure entire circle is clickable
                    .on("mouseover", function (event, d) {
                        tooltip.html(`
                            <strong>Name:</strong> ${d.Name}<br/>
                            <strong>Location:</strong> ${d.Location}<br/>
                            <strong>Cause of Death:</strong> ${d["Manner of Death"]}<br/>
                            <strong>Perpetrator:</strong> ${d["Perpetrator"]}<br/>
                        `)
                            .style("visibility", "visible")
                            .style("opacity", 1);

                        // Highlight the person
                        d3.select(this)
                            .style("opacity", 1)
                            .attr("stroke", "black")
                            .attr("stroke-width", 1 / k);
                    })
                    .on("mousemove", function (event) {
                        // Get the position of the mouse relative to the page
                        const padding = 10;
                        let left = event.pageX + padding;
                        let top = event.pageY + padding;

                        const tooltipNode = tooltip.node();
                        const tooltipWidth = tooltipNode.offsetWidth;
                        const tooltipHeight = tooltipNode.offsetHeight;

                        if (left + tooltipWidth > window.innerWidth) {
                            left = event.pageX - tooltipWidth - padding + 50;
                        }

                        // Prevent tooltip from going off the bottom edge
                        if (top + tooltipHeight > window.innerHeight) {
                            top = event.pageY - tooltipHeight - padding - 50;
                        }

                        // Position the tooltip
                        tooltip.style("left", `${left}px`)
                            .style("top", `${top}px`);
                    })
                    .on("mouseout", function () {
                        // Hide the tooltip
                        tooltip.style("visibility", "hidden")
                            .style("opacity", 0);

                        // Reset circle appearance
                        d3.select(this)
                            .attr("r", () => calculateRadius())
                            .attr("stroke", "none")
                            .style("opacity", 0.8);
                    })
                    .on("click", function (event, d) {
                        if (k === 1) { // Check if currently not zoomed in
                            const countyName = d.county.toLowerCase();
                            const countyFeature = countyMap[countyName];
                            if (countyFeature) {
                                const countyPath = map.selectAll("path.county")//isolate the specific county clicked on
                                    .filter(cd => cd.properties.shapeName.toLowerCase() === countyName)
                                    .node();

                                if (countyPath) {
                                    clicked(event, countyFeature, countyPath);
                                } else {
                                    console.warn(`County path for "${countyName}" not found.`);
                                }
                            } else {
                                console.warn(`County "${countyName}" not found in countyMap.`);
                            }

                            tooltip.style("visibility", "hidden")
                                .style("opacity", 1);
                            description.style("visibility", "hidden")
                                .style("opacity", 1);

                            d3.select(this)
                                .attr("stroke", "none");

                        } else {
                            tooltip.html(`
                                <strong>Name:</strong> ${d.Name}<br/>
                                <strong>Description:</strong> ${d["Description"]}<br/>
                            `)
                                .style("visibility", "visible")
                                .style("opacity", 1);
                        }

                    }),
                update => update
                    .attr("cx", d => projection(d.randomPoint)[0])
                    .attr("cy", d => projection(d.randomPoint)[1])
                    .attr("r", () => calculateRadius()),
                exit => exit.remove()
            );
    }

    // Initially show all people
    showPeople(missingPersonsData, null);


    /**
     * Add zoom functionality.
     */
    let zoom = d3.zoom()
        .scaleExtent([1, 10]) // Allowed zoom levels
        .on("zoom", zoomedFn);

    svg.call(zoom);

    /**
     * Handle zoom functionality and dynamic element scaling.
     * @param {Object} event - D3 zoom event.
     */
    function zoomedFn(event) {
        // Apply zoom transformation to the map group
        map.attr("transform", event.transform);
        k = event.transform.k;

        // Scale circle radius dynamically
        map.selectAll("circle.person")
            .attr("r", () => calculateRadius());

        // Scale the stroke width for borders
        map.select(".mesh-border")
            .style("stroke-width", 1 / k);
        map.selectAll("path.county")
            .style("stroke-width", 1 / k);
    }

    /**
     * Add click event listener to county paths to enable zooming.
     */
    map.selectAll(".county").on("click", function (event, d) {
        clicked(event, d, this); // Pass the DOM element explicitly
    });

    /**
     * Handle click events for zooming in and out of counties.
     * @param {Object} event - D3 event object.
     * @param {Object} d - GeoJSON feature of the clicked county.
     * @param {HTMLElement} countyElement - The DOM element of the clicked county.
     */
    function clicked(event, d, countyElement) {
        // Check if the clicked county is already zoomed in
        if (currentZoomedCounty === d.properties.shapeName) {

            // Zoom out to the original view
            svg.transition()
                .duration(800)
                .call(
                    zoom.transform,
                    d3.zoomIdentity
                );
            currentZoomedCounty = null; // Reset the currently zoomed county
        } else {

            // Compute the bounds of the clicked county
            let bounds = geoPath.bounds(d);
            let topLeft = bounds[0];
            let bottomRight = bounds[1];

            // Compute the center of the bounding box
            let [x, y] = [(topLeft[0] + bottomRight[0]) / 2, (topLeft[1] + bottomRight[1]) / 2];

            // Compute the width and height of the bounding box
            let countyWidth = bottomRight[0] - topLeft[0];
            let countyHeight = bottomRight[1] - topLeft[1];

            // Calculate the scale factor to fit the county within the viewport
            let scale = Math.max(1, Math.min(mapwidth / countyWidth, mapHeight / countyHeight) * 0.9);

            // Compute the translation values to center the county
            let translate = [
                mapwidth / 2 - x * scale,
                mapHeight / 2 - y * scale,
            ];

            // Apply the zoom transformation with smooth transition
            svg.transition()
                .duration(800)
                .call(
                    zoom.transform,
                    d3.zoomIdentity.translate(translate[0], translate[1]).scale(scale)
                );

            // Update the currently zoomed county
            currentZoomedCounty = d.properties.shapeName;
        }
    }

    // Initial call to set dimensions
    updateDimensions();
};

/**
 * Initiate data loading and map rendering.
 */
loadData();
