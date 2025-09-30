/**
 * Kenya Map Visualization with Creative Year Filtering
 * Shows victims as dots with interactive year filtering
 */

const margins = { top: 20, right: 20, bottom: 20, left: 20 };
const svg = d3.select("svg#canvas");

// Get container dimensions
const container = d3.select("#map-container").node();
let width = container.getBoundingClientRect().width;
let height = container.getBoundingClientRect().height;

// Set initial SVG dimensions
svg.attr("width", width).attr("height", height);

let mapwidth = width - (margins.left + margins.right);
let mapHeight = height - (margins.top + margins.bottom);

let map = svg.append("g")
    .attr("transform", `translate(${margins.left},${margins.top})`);

let projection;
let geoPath;
let countiesGeoJSON;
let allMissingPersonsData = [];
let currentFilteredData = [];
let currentYear = "all";

// Create tooltip
const tooltip = d3.select("body").append("div")
    .attr("class", "tooltip")
    .style("position", "absolute")
    .style("background", "rgba(0, 0, 0, 0.8)")
    .style("color", "white")
    .style("padding", "10px")
    .style("border-radius", "5px")
    .style("font-size", "12px")
    .style("pointer-events", "none")
    .style("opacity", 0)
    .style("z-index", 1000);

// Get DOM elements
const yearButtons = d3.select("#year-buttons");
const timelineSlider = d3.select("#timeline-slider");
const totalCasesEl = d3.select("#total-cases");
const visibleCasesEl = d3.select("#visible-cases");
const affectedCountiesEl = d3.select("#affected-counties");
const currentYearDisplay = d3.select("#current-year-display");

// Collapsible panel elements
const filterControls = d3.select("#filter-controls");
const toggleBtn = d3.select("#toggle-btn");
const filterContent = d3.select("#filter-content");
const compactStats = d3.select("#compact-stats");
const compactTotal = d3.select("#compact-total");
const compactVisible = d3.select("#compact-visible");
const compactCounty = d3.select("#compact-county");

// County filter elements
const countySelect = d3.select("#county-select");
const countyButtons = d3.select("#county-buttons");
const zoomOutBtn = d3.select("#zoom-out-btn");

let isCollapsed = true;
let currentCounty = "all";
let isZoomedToCounty = false;

/**
 * Generate random points within a county polygon
 */
function generateRandomPointsInCounty(countyFeature, numPoints) {
    const points = [];
    const bounds = d3.geoBounds(countyFeature);
    const minX = bounds[0][0];
    const minY = bounds[0][1];
    const maxX = bounds[1][0];
    const maxY = bounds[1][1];
    
    let attempts = 0;
    const maxAttempts = numPoints * 100;
    
    while (points.length < numPoints && attempts < maxAttempts) {
        const x = minX + Math.random() * (maxX - minX);
        const y = minY + Math.random() * (maxY - minY);
        const point = [x, y];
        
        if (d3.geoContains(countyFeature, point)) {
            points.push(point);
        }
        attempts++;
    }
    
    return points;
}

/**
 * Filter data by year and county
 */
function filterDataByYearAndCounty(data, year, county) {
    let filteredData = data;
    
    // Filter by year
    if (year !== "all") {
        filteredData = filteredData.filter(d => {
            const victimYear = d.Year || extractYear(d["Date of Incident"]);
            return victimYear === parseInt(year);
        });
    }
    
    // Filter by county
    if (county !== "all") {
        filteredData = filteredData.filter(d => {
            return d.County && d.County.toLowerCase() === county.toLowerCase();
        });
    }
    
    return filteredData;
}

/**
 * Extract year from date string (fallback method)
 */
function extractYear(dateString) {
    if (!dateString || dateString === "Unknown") return null;
    
    // Try to extract year from various date formats
    const yearMatch = dateString.match(/\b(20\d{2})\b/);
    return yearMatch ? parseInt(yearMatch[1]) : null;
}

/**
 * Toggle filter panel collapse/expand
 */
function toggleFilterPanel() {
    isCollapsed = !isCollapsed;
    
    if (isCollapsed) {
        filterControls.classed("collapsed", true).classed("expanded", false);
        filterContent.classed("collapsed", true);
        toggleBtn.text("+");
    } else {
        filterControls.classed("collapsed", false).classed("expanded", true);
        filterContent.classed("collapsed", false);
        toggleBtn.text("−");
    }
    
    // Force a reflow to ensure smooth transition
    filterControls.node().offsetHeight;
    
    // Update map dimensions after panel toggle on mobile
    if (window.innerWidth <= 768) {
        setTimeout(updateDimensions, 300);
    }
}

/**
 * Update statistics display
 */
function updateStatistics(filteredData) {
    const totalCases = allMissingPersonsData.length;
    const visibleCases = filteredData.length;
    const affectedCounties = new Set(filteredData.map(d => d.County)).size;
    
    // Update full statistics
    totalCasesEl.text(totalCases);
    visibleCasesEl.text(visibleCases);
    affectedCountiesEl.text(affectedCounties);
    currentYearDisplay.text(currentYear === "all" ? "All Years" : currentYear);
    
    // Update compact statistics
    compactTotal.text(totalCases);
    compactVisible.text(visibleCases);
    const countyDisplay = isZoomedToCounty ? 
        `${currentCounty} (Zoomed)` : 
        (currentCounty === "all" ? "All" : currentCounty);
    compactCounty.text(countyDisplay);
}

/**
 * Create county filter options
 */
function createCountyFilter() {
    // Get unique counties from data
    const counties = [...new Set(allMissingPersonsData.map(d => d.County))].sort();
    
    // Populate dropdown
    const options = countySelect.selectAll("option")
        .data(["all", ...counties])
        .join("option")
        .attr("value", d => d)
        .text(d => d === "all" ? "All Counties" : d);
    
    // Create county buttons (top 10 most affected counties)
    const countyCounts = {};
    allMissingPersonsData.forEach(d => {
        countyCounts[d.County] = (countyCounts[d.County] || 0) + 1;
    });
    
    const topCounties = Object.entries(countyCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(d => d[0]);
    
    countyButtons.selectAll(".county-btn")
        .data(["all", ...topCounties])
        .join("button")
        .attr("class", "county-btn")
        .attr("data-county", d => d)
        .text(d => d === "all" ? "All" : d)
        .on("click", function(event, d) {
            // Remove active class from all buttons
            countyButtons.selectAll(".county-btn").classed("active", false);
            // Add active class to clicked button
            d3.select(this).classed("active", true);
            
            currentCounty = d;
            countySelect.property("value", d);
            updateMap();
        });
    
    // Setup dropdown change handler
    countySelect.on("change", function() {
        const selectedCounty = this.value;
        currentCounty = selectedCounty;
        
        // Update button states
        countyButtons.selectAll(".county-btn").classed("active", false);
        countyButtons.selectAll(".county-btn")
            .filter(d => d === selectedCounty)
            .classed("active", true);
        
        updateMap();
    });
}

/**
 * Create year buttons dynamically
 */
function createYearButtons() {
    const years = ["all", "2019", "2020", "2021", "2022", "2023", "2024", "2025"];
    
    yearButtons.selectAll(".year-btn")
        .data(years)
        .join("button")
        .attr("class", "year-btn")
        .attr("data-year", d => d)
        .text(d => d === "all" ? "All Years" : d)
        .on("click", function(event, d) {
            // Remove active class from all buttons
            yearButtons.selectAll(".year-btn").classed("active", false);
            // Add active class to clicked button
            d3.select(this).classed("active", true);
            
            currentYear = d;
            updateMap();
        });
}

/**
 * Zoom to specific county
 */
function zoomToCounty(countyName) {
    if (countyName === "all") {
        // Zoom out to full view
        if (isZoomedToCounty) {
            // Reset projection to fit all counties and center
            projection = d3.geoMercator()
                .fitSize([mapwidth, mapHeight], countiesGeoJSON)
                .translate([mapwidth / 2, mapHeight / 2]);
            geoPath = d3.geoPath().projection(projection);
            
            // Update county paths
            map.selectAll("path.county")
                .transition()
                .duration(800)
                .attr("d", geoPath);
            
            // Update border mesh
            map.select(".mesh-border")
                .transition()
                .duration(800)
                .attr("d", geoPath);
            
            // Update victim dots
            map.selectAll("circle.victim")
                .transition()
                .duration(800)
                .attr("cx", d => projection(d.position)[0])
                .attr("cy", d => projection(d.position)[1]);
            
            isZoomedToCounty = false;
            zoomOutBtn.attr("disabled", true);
        }
        return;
    }
    
    // Find the county feature
    const countyFeature = countiesGeoJSON.features.find(f => 
        f.properties.shapeName.toLowerCase() === countyName.toLowerCase()
    );
    
    if (!countyFeature) return;
    
    // Calculate the centroid of the county
    const centroid = d3.geoCentroid(countyFeature);
    
    // Create new projection focused on this county
    const newProjection = d3.geoMercator()
        .fitSize([mapwidth * 0.7, mapHeight * 0.7], countyFeature);
    const newGeoPath = d3.geoPath().projection(newProjection);
    
    // Update projection
    projection = newProjection;
    geoPath = newGeoPath;
    
    // Update county paths
    map.selectAll("path.county")
        .transition()
        .duration(800)
        .attr("d", geoPath);
    
    // Update border mesh
    map.select(".mesh-border")
        .transition()
        .duration(800)
        .attr("d", geoPath);
    
    // Update victim dots
    map.selectAll("circle.victim")
        .transition()
        .duration(800)
        .attr("cx", d => projection(d.position)[0])
        .attr("cy", d => projection(d.position)[1]);
    
    isZoomedToCounty = true;
    zoomOutBtn.attr("disabled", null);
}

/**
 * Zoom out to full view
 */
function zoomOut() {
    if (isZoomedToCounty) {
        // Reset projection to fit all counties properly
        projection = d3.geoMercator()
            .fitSize([mapwidth, mapHeight], countiesGeoJSON);
        geoPath = d3.geoPath().projection(projection);
        
        // Update county paths
        map.selectAll("path.county")
            .transition()
            .duration(800)
            .attr("d", geoPath);
        
        // Update border mesh
        map.select(".mesh-border")
            .transition()
            .duration(800)
            .attr("d", geoPath);
        
        // Update victim dots
        map.selectAll("circle.victim")
            .transition()
            .duration(800)
            .attr("cx", d => projection(d.position)[0])
            .attr("cy", d => projection(d.position)[1]);
        
        isZoomedToCounty = false;
        zoomOutBtn.attr("disabled", true);
        
        // Reset county selection
        currentCounty = "all";
        countySelect.property("value", "all");
        countyButtons.selectAll(".county-btn").classed("active", false);
        countyButtons.selectAll(".county-btn")
            .filter(d => d === "all")
            .classed("active", true);
        
        updateMap();
    }
}

/**
 * Update map with filtered data
 */
function updateMap() {
    const filteredData = filterDataByYearAndCounty(allMissingPersonsData, currentYear, currentCounty);
    currentFilteredData = filteredData;
    
    // Handle zoom to county
    if (currentCounty !== "all") {
        zoomToCounty(currentCounty);
    } else {
        zoomToCounty("all"); // Zoom out
    }
    
    // Update victim dots with smooth transitions
    const victims = map.selectAll("circle.victim")
        .data(filteredData, d => d.Name + d.Location);
    
    // Exit transition
    victims.exit()
        .transition()
        .duration(500)
        .style("opacity", 0)
        .attr("r", 0)
        .remove();
    
    // Enter transition
    const victimsEnter = victims.enter()
        .append("circle")
        .attr("class", "victim")
        .attr("cx", d => projection(d.position)[0])
        .attr("cy", d => projection(d.position)[1])
        .attr("r", 0)
        .style("fill", "#e53e3e")
        .style("opacity", 0)
        .style("cursor", "pointer");
    
    // Merge and update
    victimsEnter.merge(victims)
        .transition()
        .duration(500)
        .attr("cx", d => projection(d.position)[0])
        .attr("cy", d => projection(d.position)[1])
        .attr("r", window.innerWidth <= 768 ? 4 : 3) // Larger points on mobile
        .style("opacity", 0.8);
    
    
    // Add hover and touch events to new elements
    victimsEnter
        .on("mouseover", function(event, d) {
            tooltip.transition()
                .duration(200)
                .style("opacity", 1);
            
            tooltip.html(`
                <div><strong>Name:</strong> ${d.Name}</div>
                <div><strong>Location:</strong> ${d.Location}</div>
                <div><strong>County:</strong> ${d.County}</div>
                <div><strong>Manner of Death:</strong> ${d["Manner of Death"]}</div>
                <div><strong>Date:</strong> ${d["Date of Incident"]}</div>
            `)
            .style("left", (event.pageX + 10) + "px")
            .style("top", (event.pageY - 10) + "px");

            d3.select(this)
                .style("opacity", 1)
                .style("stroke", "black")
                .style("stroke-width", 2);
        })
        .on("mousemove", function(event) {
            tooltip
                .style("left", (event.pageX + 10) + "px")
                .style("top", (event.pageY - 10) + "px");
        })
        .on("mouseout", function() {
            tooltip.transition()
                .duration(200)
                .style("opacity", 0);

            d3.select(this)
                .style("opacity", 0.8)
                .style("stroke", "none")
                .style("stroke-width", 0);
        })
        // Add touch events for mobile devices
        .on("touchstart", function(event, d) {
            event.stopPropagation(); // Prevent event bubbling to SVG
            const touch = d3.touches(this)[0];
            if (touch) {
                tooltip.transition()
                    .duration(200)
                    .style("opacity", 1);
                
                tooltip.html(`
                    <div><strong>Name:</strong> ${d.Name}</div>
                    <div><strong>Location:</strong> ${d.Location}</div>
                    <div><strong>County:</strong> ${d.County}</div>
                    <div><strong>Manner of Death:</strong> ${d["Manner of Death"]}</div>
                    <div><strong>Date:</strong> ${d["Date of Incident"]}</div>
                `)
                .style("left", (touch[0] + 10) + "px")
                .style("top", (touch[1] - 10) + "px");

                d3.select(this)
                    .style("opacity", 1)
                    .style("stroke", "black")
                    .style("stroke-width", 2);
            }
        })
        .on("touchend", function(event, d) {
            event.stopPropagation(); // Prevent event bubbling to SVG
            // Keep tooltip visible for a moment on mobile
            setTimeout(() => {
                tooltip.transition()
                    .duration(200)
                    .style("opacity", 0);
            }, 2000);

            d3.select(this)
                .style("opacity", 0.8)
                .style("stroke", "none")
                .style("stroke-width", 0);
        });
    
    updateStatistics(filteredData);
}

/**
 * Update dimensions based on window size
 */
function updateDimensions() {
    const container = d3.select("#map-container").node();
    const newWidth = container.getBoundingClientRect().width;
    const newHeight = container.getBoundingClientRect().height;

    // Update global width and height
    width = newWidth;
    height = newHeight;
    mapwidth = newWidth - (margins.left + margins.right);
    mapHeight = newHeight - (margins.top + margins.bottom);

    svg.attr("width", newWidth)
        .attr("height", newHeight);

    map.attr("transform", `translate(${margins.left},${margins.top})`);

    if (countiesGeoJSON) {
        // Only reset projection if not zoomed to a specific county
        if (!isZoomedToCounty) {
            projection = d3.geoMercator().fitSize([mapwidth, mapHeight], countiesGeoJSON);
            geoPath = d3.geoPath().projection(projection);
        }

        map.selectAll("path.county")
            .attr("d", geoPath);

        map.select(".mesh-border")
            .attr("d", geoPath);

        map.selectAll("circle.victim")
            .attr("cx", d => projection(d.position)[0])
            .attr("cy", d => projection(d.position)[1]);
    }
}

/**
 * Handle touch events for mobile devices
 */
function setupTouchEvents() {
    let startTouch = null;
    let isDragging = false;
    let touchStartTime = 0;
    
    svg.on("touchstart", function(event) {
        // Don't prevent default to allow normal touch interactions
        startTouch = d3.touches(this)[0];
        touchStartTime = Date.now();
        isDragging = false;
    })
    .on("touchmove", function(event) {
        if (startTouch) {
            const currentTouch = d3.touches(this)[0];
            if (currentTouch) {
                const distance = Math.sqrt(
                    Math.pow(currentTouch[0] - startTouch[0], 2) + 
                    Math.pow(currentTouch[1] - startTouch[1], 2)
                );
                // If touch moved more than 10 pixels, consider it dragging
                if (distance > 10) {
                    isDragging = true;
                }
            }
        }
    })
    .on("touchend", function(event) {
        const touchDuration = Date.now() - touchStartTime;
        
        // Only handle as tap if it was quick (< 500ms) and not dragging
        if (!isDragging && touchDuration < 500) {
            // Let the normal click events handle the interaction
            // Don't prevent default to allow victim point clicks
        }
        
        startTouch = null;
        isDragging = false;
    });
}

// Debounced resize handler for better performance
let resizeTimeout;
function debouncedResize() {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(updateDimensions, 150);
}

// Handle window resize
window.addEventListener("resize", debouncedResize);

// Handle orientation change for mobile devices
window.addEventListener("orientationchange", function() {
    setTimeout(updateDimensions, 100);
});

/**
 * Load and render the map with victim dots
 */
const loadData = async function () {
    try {
        // Load Kenya map data
        let kenya = await d3.json('./datasets/kenya.topojson');
        countiesGeoJSON = topojson.feature(kenya, kenya.objects.KENADM1gbOpen);
        
        // Set up projection to fit the entire Kenya map
        projection = d3.geoMercator()
            .fitSize([mapwidth, mapHeight], countiesGeoJSON);
        geoPath = d3.geoPath().projection(projection);

        // Load missing voices data
        allMissingPersonsData = await d3.json('./datasets/missing_voices.json');
        
        // Debug: Check data before filtering
        console.log(`Total records loaded: ${allMissingPersonsData.length}`);
        
        // Check county distribution before filtering
        const countyCounts = {};
        allMissingPersonsData.forEach(d => {
            const county = d.County || "No County";
            countyCounts[county] = (countyCounts[county] || 0) + 1;
        });
        console.log('County distribution before filtering:', countyCounts);
        
        // Filter out only entries with completely missing data
        const beforeFilter = allMissingPersonsData.length;
        allMissingPersonsData = allMissingPersonsData.filter(person => 
            person.County && 
            person.County !== "" && 
            person.Name && 
            person.Name !== ""
        );
        const afterFilter = allMissingPersonsData.length;
        console.log(`Filtered out ${beforeFilter - afterFilter} records (${beforeFilter} -> ${afterFilter})`);
        
        // For records with "Unknown" county, try to extract county from location
        allMissingPersonsData.forEach(person => {
            if (person.County === "Unknown" && person.Location) {
                // Try to match location to known counties
                const location = person.Location.toLowerCase();
                const countyNames = [
                    "nairobi", "mombasa", "kisumu", "nakuru", "eldoret", "thika", "malindi", "kitale", "garissa", "kakamega",
                    "kisii", "meru", "nyeri", "machakos", "kitui", "embu", "isiolo", "lamu", "kilifi", "kwale", "tana river",
                    "taita taveta", "makueni", "kajiado", "narok", "nyamira", "bomet", "bungoma", "busia", "vihiga", "siaya",
                    "homa bay", "migori", "kisumu", "nyamira", "trans nzoia", "west pokot", "samburu", "turkana", "marsabit",
                    "mandera", "wajir", "isiolo", "laikipia", "nyandarua", "nyeri", "murang'a", "kiambu", "kirinyaga", "nyeri"
                ];
                
                for (const county of countyNames) {
                    if (location.includes(county)) {
                        person.County = county.charAt(0).toUpperCase() + county.slice(1);
                        break;
                    }
                }
            }
        });

        console.log(`Loaded ${allMissingPersonsData.length} victim records`);
        
        // Debug: Show year distribution
        const yearCounts = {};
        allMissingPersonsData.forEach(d => {
            const year = d.Year || extractYear(d["Date of Incident"]);
            if (year) {
                yearCounts[year] = (yearCounts[year] || 0) + 1;
            }
        });
        console.log('Year distribution:', yearCounts);

        // Create county mapping
        const countyMap = {};
        countiesGeoJSON.features.forEach(feature => {
            countyMap[feature.properties.shapeName.toLowerCase()] = feature;
        });

        // Group victims by county
        const victimsByCounty = {};
        allMissingPersonsData.forEach(victim => {
            const countyName = victim.County.toLowerCase();
            if (!victimsByCounty[countyName]) {
                victimsByCounty[countyName] = [];
            }
            victimsByCounty[countyName].push(victim);
        });
        
        console.log('Counties with victims:', Object.keys(victimsByCounty));

        // Generate positions for victims in each county
        const victimsWithPositions = [];
        Object.keys(victimsByCounty).forEach(countyName => {
            const countyFeature = countyMap[countyName];
            if (countyFeature) {
                const victims = victimsByCounty[countyName];
                const randomPoints = generateRandomPointsInCounty(countyFeature, victims.length);
                
                victims.forEach((victim, index) => {
                    if (index < randomPoints.length) {
                        victimsWithPositions.push({
                            ...victim,
                            position: randomPoints[index]
                        });
                    }
                });
            } else {
                // For unknown counties, place victims in central Kenya (Nairobi area)
                const victims = victimsByCounty[countyName];
                console.log(`Placing ${victims.length} victims with unknown county in central Kenya`);
                
                victims.forEach(victim => {
                    // Use Nairobi county as fallback for unknown counties
                    const nairobiFeature = countyMap['nairobi'];
                    if (nairobiFeature) {
                        const randomPoint = generateRandomPointsInCounty(nairobiFeature, 1)[0];
                        victimsWithPositions.push({
                            ...victim,
                            position: randomPoint
                        });
                    }
                });
            }
        });

        allMissingPersonsData = victimsWithPositions;
        console.log(`Positioned ${allMissingPersonsData.length} victims on the map`);

    // Draw the map with individual county paths
    map.selectAll("path.county")
        .data(countiesGeoJSON.features)
        .join("path")
        .attr("d", geoPath)
        .attr("class", "county")
        .attr("countyName", d => d.properties.shapeName)
            .style("fill", "#e2e8f0")
            .style("stroke", "#cbd5e0")
            .style("stroke-width", 0.5);

    // Add mesh for county borders
    let borderMesh = topojson.mesh(kenya, kenya.objects.KENADM1gbOpen);
    map.append("path")
        .datum(borderMesh)
        .attr("class", "mesh-border")
        .attr("d", geoPath)
        .attr("fill", "none")
        .attr("stroke", "black")
            .style("stroke-width", 1);

        // Setup toggle button
        toggleBtn.on("click", toggleFilterPanel);
        
        // Setup zoom out button
        zoomOutBtn.on("click", zoomOut);
        
        // Create county filter controls
        createCountyFilter();
        
        // Create year filter controls
        createYearButtons();
        
        // Setup timeline slider
        timelineSlider
            .attr("min", 2019)
            .attr("max", 2025)
            .attr("value", 2025);
            
        timelineSlider.on("input", function() {
            const year = this.value;
            currentYear = year;
            
            // Update button states
            yearButtons.selectAll(".year-btn").classed("active", false);
            yearButtons.selectAll(".year-btn")
                .filter(d => d === year)
                .classed("active", true);
            
            updateMap();
        });

        // Setup touch events for mobile
        setupTouchEvents();
        
        // Initial map update
        updateMap();

        // Initial call to set dimensions
        updateDimensions();
    
    } catch (error) {
        console.error("Error loading data:", error);
    }
};

/**
 * Update copyright year dynamically
 */
function updateCopyrightYear() {
    const currentYear = new Date().getFullYear();
    const yearElement = document.getElementById('current-year');
    if (yearElement) {
        yearElement.textContent = currentYear;
    }
}

/**
 * Initiate map loading and rendering
 */
loadData();

// Update copyright year on page load
updateCopyrightYear();