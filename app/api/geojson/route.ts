import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

interface GeoJsonResponse {
    geoJson: any | null;
    districtsGeoJson?: any | null;
    error?: string;
}

function normalizeLocationName(name: string): string {
    return name.toLowerCase().trim().replace(/\s+/g, " ");
}

function calculateFeatureCentroid(feature: any): [number, number] | null {
    if (!feature?.geometry?.coordinates) return null;
    
    let allCoords: number[][] = [];
    const coords = feature.geometry.coordinates;
    
    if (feature.geometry.type === "Polygon") {
        if (Array.isArray(coords) && Array.isArray(coords[0])) {
            allCoords = coords[0].filter(
                (coord: any) => Array.isArray(coord) && coord.length >= 2 && typeof coord[0] === "number"
            );
        }
    } else if (feature.geometry.type === "MultiPolygon") {
        coords.forEach((polygon: any) => {
            if (Array.isArray(polygon) && Array.isArray(polygon[0])) {
                polygon[0].forEach((coord: any) => {
                    if (Array.isArray(coord) && coord.length >= 2 && typeof coord[0] === "number") {
                        allCoords.push(coord);
                    }
                });
            }
        });
    }
    
    if (allCoords.length === 0) return null;
    
    const sumLon = allCoords.reduce((sum, coord) => sum + coord[0], 0);
    const sumLat = allCoords.reduce((sum, coord) => sum + coord[1], 0);
    return [sumLon / allCoords.length, sumLat / allCoords.length];
}

function isPointInPolygon(point: [number, number], polygon: number[][]): boolean {
    const [x, y] = point;
    let inside = false;
    
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const [xi, yi] = polygon[i];
        const [xj, yj] = polygon[j];
        
        const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    
    return inside;
}

function isPointInFeature(point: [number, number], feature: any): boolean {
    if (!feature?.geometry?.coordinates) return false;
    
    const coords = feature.geometry.coordinates;
    
    if (feature.geometry.type === "Polygon") {
        if (Array.isArray(coords) && Array.isArray(coords[0])) {
            return isPointInPolygon(point, coords[0]);
        }
    } else if (feature.geometry.type === "MultiPolygon") {
        for (const polygon of coords) {
            if (Array.isArray(polygon) && Array.isArray(polygon[0])) {
                if (isPointInPolygon(point, polygon[0])) {
                    return true;
                }
            }
        }
    }
    
    return false;
}

export async function GET(request: NextRequest): Promise<NextResponse<GeoJsonResponse>> {
    const searchParams = request.nextUrl.searchParams;
    const stateName = searchParams.get("state");
    const districtName = searchParams.get("district");
    const allStates = searchParams.get("allstates");

    // Handle India (all states) request
    if (allStates === "true") {
        try {
            // Fetch all Indian states from GitHub
            const stateUrl = "https://raw.githubusercontent.com/geohacker/india/master/state/india_state.geojson";
            const response = await fetch(stateUrl);
            
            if (response.ok) {
                const allStatesData = await response.json();
                return NextResponse.json<GeoJsonResponse>({ 
                    geoJson: allStatesData
                });
            } else {
                throw new Error("Failed to fetch India states data");
            }
        } catch (error) {
            console.error("Error fetching all states:", error);
            return NextResponse.json<GeoJsonResponse>(
                { geoJson: null, error: "Failed to load India map data" },
                { status: 500 }
            );
        }
    }

    if (!stateName && !districtName) {
        return NextResponse.json<GeoJsonResponse>(
            { geoJson: null, error: "State or district name is required" },
            { status: 400 }
        );
    }

    try {
        let geoJsonData = null;
        let districtsGeoJsonData = null;

        // Try local files first
        const publicDir = path.join(process.cwd(), "public", "geojson");

        if (districtName) {
            const localDistrictPath = path.join(publicDir, "districts", `${districtName}.geojson`);
            if (fs.existsSync(localDistrictPath)) {
                const fileContent = fs.readFileSync(localDistrictPath, "utf-8");
                geoJsonData = JSON.parse(fileContent);
            }
        } else if (stateName) {
            const localStatePath = path.join(publicDir, "states", `${stateName}.geojson`);
            if (fs.existsSync(localStatePath)) {
                const fileContent = fs.readFileSync(localStatePath, "utf-8");
                geoJsonData = JSON.parse(fileContent);
            }
        }

        // If not found locally, fetch from remote sources
        if (!geoJsonData) {
            if (districtName) {
                // Use local output.geojson file for district data
                const outputGeoJsonPath = path.join(process.cwd(), "output.geojson");
                try {
                    if (fs.existsSync(outputGeoJsonPath)) {
                        const fileContent = fs.readFileSync(outputGeoJsonPath, "utf-8");
                        const allDistricts = JSON.parse(fileContent);
                        const normalizedDistrict = normalizeLocationName(districtName);

                        const matchingFeatures = allDistricts.features.filter((feature: any) => {
                            const featureName = feature.properties?.dtname || 
                                               feature.properties?.NAME_2 || 
                                               feature.properties?.DISTRICT || 
                                               feature.properties?.District || "";
                            return normalizeLocationName(featureName) === normalizedDistrict;
                        });

                        if (matchingFeatures.length > 0) {
                            geoJsonData = {
                                type: "FeatureCollection",
                                features: matchingFeatures
                            };
                        }
                    }
                } catch (e) {
                    console.error("Failed to load district data from output.geojson:", e);
                }
            }

            if (!geoJsonData && stateName) {
                // Fetch comprehensive state file and filter
                const stateUrl = "https://raw.githubusercontent.com/geohacker/india/master/state/india_state.geojson";
                try {
                    const response = await fetch(stateUrl);
                    if (response.ok) {
                        const allStates = await response.json();
                        const normalizedState = normalizeLocationName(stateName);

                        const matchingFeatures = allStates.features.filter((feature: any) => {
                            const featureName = feature.properties?.NAME_1 || "";
                            return normalizeLocationName(featureName) === normalizedState;
                        });

                        if (matchingFeatures.length > 0) {
                            geoJsonData = {
                                type: "FeatureCollection",
                                features: matchingFeatures
                            };
                        }
                    }
                } catch (e) {
                    console.error("Failed to fetch state data:", e);
                }
            }
        }

        // If showing a state, load districts from local output.geojson file
        if (stateName && !districtName && geoJsonData) {
            try {
                const outputGeoJsonPath = path.join(process.cwd(), "output.geojson");
                
                if (fs.existsSync(outputGeoJsonPath)) {
                    const fileContent = fs.readFileSync(outputGeoJsonPath, "utf-8");
                    const allDistricts = JSON.parse(fileContent);
                    
                    if (allDistricts.features && allDistricts.features.length > 0 && geoJsonData.features) {
                        const matchingDistrictFeatures = allDistricts.features.filter((districtFeature: any) => {
                            const districtCentroid = calculateFeatureCentroid(districtFeature);
                            if (!districtCentroid) return false;
                            
                            for (const stateFeature of geoJsonData.features) {
                                if (isPointInFeature(districtCentroid, stateFeature)) {
                                    return true;
                                }
                            }
                            
                            return false;
                        });

                        if (matchingDistrictFeatures.length > 0) {
                            districtsGeoJsonData = {
                                type: "FeatureCollection",
                                features: matchingDistrictFeatures
                            };
                        }
                    }
                }
            } catch (e) {
                console.error("Failed to load district data from output.geojson:", e);
            }
        }

        if (!geoJsonData) {
            return NextResponse.json<GeoJsonResponse>(
                { geoJson: null, error: "Location outline not found" },
                { status: 404 }
            );
        }

        return NextResponse.json<GeoJsonResponse>({ 
            geoJson: geoJsonData,
            districtsGeoJson: districtsGeoJsonData || undefined
        });

    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        console.error("Error fetching GeoJSON:", errorMessage);
        return NextResponse.json<GeoJsonResponse>(
            { geoJson: null, error: "Internal server error" },
            { status: 500 }
        );
    }
}