import { NextRequest, NextResponse } from "next/server";
import { DetectedLocation } from "@/types/location";
import fs from "fs";
import path from "path";

const INDIAN_STATES = [
    "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh",
    "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka",
    "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram",
    "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu",
    "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal",
    "Andaman and Nicobar Islands", "Chandigarh", "Dadra and Nagar Haveli and Daman and Diu",
    "Delhi", "Jammu and Kashmir", "Ladakh", "Lakshadweep", "Puducherry"
];

const MAJOR_DISTRICTS: Record<string, string> = {
    "Ahmedabad": "Gujarat",
    "Surat": "Gujarat",
    "Vadodara": "Gujarat",
    "Rajkot": "Gujarat",
    "Mumbai": "Maharashtra",
    "Pune": "Maharashtra",
    "Nagpur": "Maharashtra",
    "Bangalore": "Karnataka",
    "Bengaluru": "Karnataka",
    "Chennai": "Tamil Nadu",
    "Hyderabad": "Telangana",
    "Kolkata": "West Bengal",
    "Jaipur": "Rajasthan",
    "Lucknow": "Uttar Pradesh",
    "Patna": "Bihar",
    "Bhopal": "Madhya Pradesh",
    "Indore": "Madhya Pradesh",
    "Thiruvananthapuram": "Kerala",
    "Kochi": "Kerala",
    "Visakhapatnam": "Andhra Pradesh",
    "Guwahati": "Assam",
    "Bhubaneswar": "Odisha",
    "Raipur": "Chhattisgarh",
    "Ranchi": "Jharkhand",
    "Dehradun": "Uttarakhand",
    "Shimla": "Himachal Pradesh",
    "Srinagar": "Jammu and Kashmir",
    "Jammu": "Jammu and Kashmir",
    "Leh": "Ladakh"
};

function normalizeLocationName(name: string): string {
    return name.toLowerCase().trim().replace(/\s+/g, " ");
}

function findDistrictInGeoJson(districtName: string): { name: string; state?: string } | null {
    try {
        const outputGeoJsonPath = path.join(process.cwd(), "output.geojson");
        if (!fs.existsSync(outputGeoJsonPath)) {
            return null;
        }

        const fileContent = fs.readFileSync(outputGeoJsonPath, "utf-8");
        const data = JSON.parse(fileContent);
        const normalizedDistrict = normalizeLocationName(districtName);

        for (const feature of data.features || []) {
            const dtname = feature.properties?.dtname || "";
            if (normalizeLocationName(dtname) === normalizedDistrict) {
                return { name: dtname };
            }
        }
    } catch (e) {
        console.error("Error reading output.geojson:", e);
    }
    return null;
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const text = body.text;

        if (!text || typeof text !== "string") {
            return NextResponse.json({ location: null, locations: [] }, { status: 400 });
        }

        const normalizedText = text.toLowerCase();
        const foundLocations: DetectedLocation[] = [];

        // Check for "India" first (country level)
        if (normalizedText.includes("india") && !INDIAN_STATES.some(state =>
            normalizedText.includes(state.toLowerCase())
        )) {
            foundLocations.push({
                type: "country",
                name: "India"
            });
        }

        // Check for districts first (more specific)
        for (const [district, state] of Object.entries(MAJOR_DISTRICTS)) {
            if (normalizedText.includes(district.toLowerCase())) {
                foundLocations.push({
                    type: "district",
                    name: district,
                    stateName: state
                });
            }
        }

        // Check words for other districts via GeoJSON
        const words = text.split(/\s+/);
        for (const word of words) {
            if (word.length > 2) {
                const foundDistrict = findDistrictInGeoJson(word);
                if (foundDistrict) {
                    // Avoid duplicates if already found in MAJOR_DISTRICTS
                    if (foundLocations.some(l => l.type === 'district' && normalizeLocationName(l.name) === normalizeLocationName(foundDistrict.name))) {
                        continue;
                    }

                    let stateName: string | undefined;

                    // Try to find state in the text
                    for (const state of INDIAN_STATES) {
                        if (normalizedText.includes(state.toLowerCase())) {
                            stateName = state;
                            break;
                        }
                    }

                    // Fallback to MAJOR_DISTRICTS lookup validation if possible (partial)
                    if (!stateName) {
                        for (const [dist, state] of Object.entries(MAJOR_DISTRICTS)) {
                            if (normalizeLocationName(dist) === normalizeLocationName(foundDistrict.name)) {
                                stateName = state;
                                break;
                            }
                        }
                    }

                    foundLocations.push({
                        type: "district",
                        name: foundDistrict.name,
                        stateName: stateName
                    });
                }
            }
        }

        // Check for states
        for (const state of INDIAN_STATES) {
            if (normalizedText.includes(state.toLowerCase())) {
                // Check if we already have this state (avoid duplicates)
                if (!foundLocations.some(l => l.type === 'state' && normalizeLocationName(l.name) === normalizeLocationName(state))) {
                    // Avoid adding state if it's just the context for a district found earlier?
                    // Actually, users might want both. But usually "Gujarat" implies the state map.
                    // If we found "Ahmedabad" (Gujarat) and "Gujarat", do we show both? 
                    // For now, let's include it. The map component can handle it or user can be specific.
                    foundLocations.push({
                        type: "state",
                        name: state
                    });
                }
            }
        }

        // Deduplicate carefully (priority: district > state for same name/context? No, they are distinct entities)
        // Using a map to deduplicate by name+type
        const uniqueLocationsMap = new Map<string, DetectedLocation>();
        foundLocations.forEach(loc => {
            const key = `${loc.type}-${normalizeLocationName(loc.name)}`;
            if (!uniqueLocationsMap.has(key)) {
                uniqueLocationsMap.set(key, loc);
            }
        });

        const uniqueLocations = Array.from(uniqueLocationsMap.values());

        return NextResponse.json({
            location: uniqueLocations.length > 0 ? uniqueLocations[0] : null,
            locations: uniqueLocations
        });

    } catch (error) {
        console.error("Error detecting location:", error);
        return NextResponse.json({ location: null, locations: [] }, { status: 500 });
    }
}