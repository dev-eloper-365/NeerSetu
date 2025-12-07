// ... (imports remain the same)
import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { DetectedLocation } from "@/types/location";
import { ZoomIn, RotateCcw, Map, MapPin } from "lucide-react";

// --- Interfaces ---

interface MapVisualizationProps {
    location?: DetectedLocation;
    locations?: DetectedLocation[];
}

interface GeoJsonFeature {
    type: string;
    geometry: {
        type: string;
        coordinates: any[];
    };
    properties?: any;
}

interface GeoJsonData {
    type: string;
    features: GeoJsonFeature[];
}

interface ZoomState {
    feature: GeoJsonFeature | null;
    type: 'state' | 'district' | null;
    progress: number;
}

// --- Helper Functions ---

const getStateName = (f: GeoJsonFeature, fallbackName?: string) => f.properties?.NAME_1 || f.properties?.ST_NM || f.properties?.STATE || fallbackName || "State";
const getDistrictName = (f: GeoJsonFeature) => f.properties?.dtname || f.properties?.NAME_2 || f.properties?.DISTRICT || f.properties?.name || "District";

const calculateBounds = (features: readonly GeoJsonFeature[]) => {
    let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;

    const traverse = (coords: any) => {
        if (typeof coords[0] === "number") {
            const [lon, lat] = coords;
            if (lon < minLon) minLon = lon;
            if (lon > maxLon) maxLon = lon;
            if (lat < minLat) minLat = lat;
            if (lat > maxLat) maxLat = lat;
        } else {
            coords.forEach(traverse);
        }
    };

    features.forEach(f => traverse(f.geometry.coordinates));

    if (minLon === Infinity) return null;

    const width = maxLon - minLon;
    const height = maxLat - minLat;

    return { minLon, maxLon, minLat, maxLat, width, height, centerX: minLon + width / 2, centerY: minLat + height / 2 };
};

const interpolateBounds = (b1: ReturnType<typeof calculateBounds>, b2: ReturnType<typeof calculateBounds>, p: number) => {
    if (!b1 || !b2) return b2 || b1;
    return {
        minLon: b1.minLon + (b2.minLon - b1.minLon) * p,
        maxLon: b1.maxLon + (b2.maxLon - b1.maxLon) * p,
        minLat: b1.minLat + (b2.minLat - b1.minLat) * p,
        maxLat: b1.maxLat + (b2.maxLat - b1.maxLat) * p,
        width: b1.width + (b2.width - b1.width) * p,
        height: b1.height + (b2.height - b1.height) * p,
        centerX: b1.centerX + (b2.centerX - b1.centerX) * p,
        centerY: b1.centerY + (b2.centerY - b1.centerY) * p,
    };
};

const ringToPath = (ring: number[][], bounds: ReturnType<typeof calculateBounds>, w: number, h: number) => {
    if (!bounds) return "";

    const px = bounds.width * 0.02, py = bounds.height * 0.02;
    const minLon = bounds.minLon - px, maxLon = bounds.maxLon + px;
    const minLat = bounds.minLat - py, maxLat = bounds.maxLat + py;
    const effW = maxLon - minLon, effH = maxLat - minLat;
    const scale = Math.min(w / effW, h / effH);
    const ox = (w - effW * scale) / 2, oy = (h - effH * scale) / 2;

    return ring.map((c, i) => {
        const x = (c[0] - minLon) * scale + ox;
        const y = h - ((c[1] - minLat) * scale + oy);
        return `${i === 0 ? "M" : "L"} ${x} ${y}`;
    }).join(" ") + " Z";
};

const projectPoint = (c: number[], bounds: ReturnType<typeof calculateBounds>, w: number, h: number) => {
    if (!bounds) return null;
    const px = bounds.width * 0.02, py = bounds.height * 0.02;
    const minLon = bounds.minLon - px, minLat = bounds.minLat - py;
    const effW = bounds.maxLon + px - minLon, effH = bounds.maxLat + py - minLat;
    const scale = Math.min(w / effW, h / effH);
    const ox = (w - effW * scale) / 2, oy = (h - effH * scale) / 2;
    return { x: (c[0] - minLon) * scale + ox, y: h - ((c[1] - minLat) * scale + oy) };
};

const calculateFeatureCenter = (f: GeoJsonFeature) => {
    const b = calculateBounds([f]);
    return b ? [b.centerX, b.centerY] : null;
};

// --- Sub-components ---

interface MapHeaderProps {
    location: DetectedLocation;
    hoveredFeature: { feature: GeoJsonFeature; type: 'state' | 'district' } | null;
    zoomedFeature: ZoomState;
    hoverProgress: number;
    onReset: () => void;
}

const MapHeader = ({ location, hoveredFeature, zoomedFeature, hoverProgress, onReset }: MapHeaderProps) => {
    const showReset = zoomedFeature.feature || hoveredFeature;

    return (
        <div className="mb-4 flex justify-between items-start">
            <div className="space-y-2">
                <div className="flex items-center gap-2">
                    {location.type === "country" ? <Map className="w-5 h-5 text-blue-400" /> : <MapPin className="w-5 h-5 text-blue-400" />}
                    <h3 className="text-lg font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
                        {location.type === "country" ? "India" : location.name}
                    </h3>
                </div>
                {location.stateName && location.type === "district" && (
                    <p className="text-xs text-slate-400 ml-7 flex items-center gap-1">
                        <span className="w-1 h-1 rounded-full bg-slate-500"></span>
                        {location.stateName}
                    </p>
                )}

                {/* Fixed height container to prevent layout shift */}
                <div className="ml-7 mt-2 h-5 relative">
                    {hoveredFeature ? (
                        <div className="absolute inset-0 flex items-center gap-2 text-xs text-amber-400 animate-in fade-in duration-200">
                            <ZoomIn className="w-3.5 h-3.5" />
                            <span className="font-medium whitespace-nowrap">
                                {hoveredFeature.type === 'state' ? getStateName(hoveredFeature.feature, location.name) : getDistrictName(hoveredFeature.feature)}
                            </span>
                            <div className="flex-1 max-w-[100px] h-1 bg-slate-700 rounded-full overflow-hidden">
                                <div className="h-full bg-gradient-to-r from-amber-500 to-orange-500 transition-all duration-75" style={{ width: `${hoverProgress * 100}%` }}></div>
                            </div>
                        </div>
                    ) : zoomedFeature.feature ? (
                        <div className="absolute inset-0 flex items-center gap-2 text-xs animate-in fade-in duration-300">
                            <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></div>
                            <span className="text-emerald-400 font-medium whitespace-nowrap">{zoomedFeature.progress < 1 ? "Zooming" : "Viewing"}</span>
                            <span className="text-slate-300 whitespace-nowrap">
                                {zoomedFeature.type === 'state' ? getStateName(zoomedFeature.feature, location.name) : getDistrictName(zoomedFeature.feature)}
                            </span>
                            {zoomedFeature.progress < 1 && <span className="text-slate-500">{Math.round(zoomedFeature.progress * 100)}%</span>}
                        </div>
                    ) : null}
                </div>
            </div>

            <div className={`transition-opacity duration-300 ${showReset ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                <button onClick={onReset} className="group flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500/20 to-cyan-500/20 hover:from-blue-500/30 hover:to-cyan-500/30 text-blue-300 rounded-lg transition-all duration-300 border border-blue-500/20 hover:border-blue-500/40 shadow-lg hover:shadow-blue-500/20">
                    <RotateCcw className="w-4 h-4 group-hover:rotate-180 transition-transform duration-500" />
                    <span className="text-xs font-medium">Reset</span>
                </button>
            </div>
        </div>
    );
};

interface MapContentProps {
    isIndiaView: boolean;
    viewLevel: 'country' | 'state' | 'district';
    allStatesGeoJson: GeoJsonData | null;
    geoJson: GeoJsonData | null;
    districtsGeoJson: GeoJsonData | null;
    bounds: ReturnType<typeof calculateBounds>;
    width: number;
    height: number;
    zoomedFeature: ZoomState;
    hoveredFeature: { feature: GeoJsonFeature; type: 'state' | 'district' } | null;
    baseOpacity: number;
    locationName?: string;
    onHoverStart: (feature: GeoJsonFeature, type: 'state' | 'district') => void;
    onHoverEnd: () => void;
}

const MapContent = React.memo(({
    isIndiaView,
    viewLevel,
    allStatesGeoJson,
    geoJson,
    districtsGeoJson,
    bounds,
    width,
    height,
    zoomedFeature,
    hoveredFeature,
    baseOpacity,
    locationName,
    onHoverStart,
    onHoverEnd
}: MapContentProps) => {

    return (
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full relative z-10" preserveAspectRatio="xMidYMid meet">
            <defs>
                <style>{`.state-path, .district-path { transition: fill 0.15s ease, stroke 0.15s ease, stroke-width 0.15s ease; will-change: fill, stroke; } .state-path:hover, .district-path:hover { filter: drop-shadow(0 0 6px currentColor); }`}</style>
                <linearGradient id="sg" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="rgba(59,130,246,0.4)" />
                    <stop offset="100%" stopColor="rgba(37,99,235,0.2)" />
                </linearGradient>
                <linearGradient id="hg" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="rgba(96,165,250,0.7)" />
                    <stop offset="100%" stopColor="rgba(59,130,246,0.5)" />
                </linearGradient>
                <linearGradient id="zg" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="rgba(52,211,153,0.5)" />
                    <stop offset="100%" stopColor="rgba(16,185,129,0.3)" />
                </linearGradient>
            </defs>

            <g opacity={baseOpacity} style={{ transition: 'opacity 0.3s' }}>
                {isIndiaView && allStatesGeoJson?.features.map((f, i) => {
                    const isH = hoveredFeature?.feature === f;
                    const render = (c: any, k: string) => (
                        <path key={k} d={ringToPath(c, bounds, width, height)} fill={isH ? "url(#hg)" : "url(#sg)"} stroke={isH ? "rgba(147,197,253,1)" : "rgba(59,130,246,0.6)"} strokeWidth={isH ? "2.5" : "1.2"} className="state-path cursor-pointer" onMouseEnter={() => onHoverStart(f, 'state')} onMouseLeave={onHoverEnd}><title>{getStateName(f, locationName)}</title></path>
                    );
                    if (f.geometry.type === "Polygon") return f.geometry.coordinates.map((r: any, j: number) => render(r, `s-${i}-${j}`));
                    return f.geometry.coordinates.map((p: any, pi: number) => p.map((r: any, ri: number) => render(r, `s-${i}-${pi}-${ri}`)));
                })}

                {!isIndiaView && viewLevel === 'state' && geoJson?.features.map((f, i) => {
                    const render = (c: any, k: string) => (
                        <path key={k} d={ringToPath(c, bounds, width, height)} fill="rgba(59,130,246,0.2)" stroke="rgba(59,130,246,1)" strokeWidth="2"><title>{getStateName(f, locationName)}</title></path>
                    );
                    if (f.geometry.type === "Polygon") return f.geometry.coordinates.map((r: any, j: number) => render(r, `st-${i}-${j}`));
                    return f.geometry.coordinates.map((p: any, pi: number) => p.map((r: any, ri: number) => render(r, `st-${i}-${pi}-${ri}`)));
                })}

                {!isIndiaView && viewLevel === 'state' && districtsGeoJson?.features.map((f, i) => {
                    const isH = hoveredFeature?.feature === f;
                    const render = (c: any, k: string) => (
                        <path key={k} d={ringToPath(c, bounds, width, height)} fill={isH ? "rgba(147,197,253,0.4)" : "transparent"} stroke={isH ? "rgba(147,197,253,1)" : "rgba(147,197,253,0.6)"} strokeWidth={isH ? "2" : "1"} className="district-path cursor-pointer" onMouseEnter={() => onHoverStart(f, 'district')} onMouseLeave={onHoverEnd}><title>{getDistrictName(f)}</title></path>
                    );
                    if (f.geometry.type === "Polygon") return f.geometry.coordinates.map((r: any, j: number) => render(r, `d-${i}-${j}`));
                    return f.geometry.coordinates.map((p: any, pi: number) => p.map((r: any, ri: number) => render(r, `d-${i}-${pi}-${ri}`)));
                })}

                {!isIndiaView && viewLevel === 'state' && !zoomedFeature.feature && districtsGeoJson?.features.map((f, i) => {
                    const c = calculateFeatureCenter(f);
                    const p = c && projectPoint(c, bounds, width, height);
                    return p && <text key={`l-${i}`} x={p.x} y={p.y} className="text-[9px] fill-slate-200 pointer-events-none select-none" textAnchor="middle" dominantBaseline="middle">{getDistrictName(f)}</text>;
                })}
            </g>

            {zoomedFeature.feature && (
                <g opacity={zoomedFeature.progress} style={{ transition: 'opacity 0.3s' }}>
                    {(() => {
                        const f = zoomedFeature.feature;
                        const render = (c: any, k: string) => (
                            <path key={k} d={ringToPath(c, bounds, width, height)} fill="url(#zg)" stroke="rgba(52,211,153,1)" strokeWidth="3"><title>{zoomedFeature.type === 'state' ? getStateName(f, locationName) : getDistrictName(f)}</title></path>
                        );
                        if (f.geometry.type === "Polygon") return f.geometry.coordinates.map((r: any, j: number) => render(r, `z-${j}`));
                        return f.geometry.coordinates.map((p: any, pi: number) => p.map((r: any, ri: number) => render(r, `z-${pi}-${ri}`)));
                    })()}

                    {zoomedFeature.progress > 0.5 && (() => {
                        const c = calculateFeatureCenter(zoomedFeature.feature!);
                        const p = c && projectPoint(c, bounds, width, height);
                        const name = zoomedFeature.type === 'state' ? getStateName(zoomedFeature.feature!, locationName) : getDistrictName(zoomedFeature.feature!);
                        return p && <text x={p.x} y={p.y} opacity={(zoomedFeature.progress - 0.5) * 2} className="text-xl font-bold fill-emerald-300 pointer-events-none select-none" textAnchor="middle" dominantBaseline="middle">{name}</text>;
                    })()}
                </g>
            )}
        </svg>
    );
});
MapContent.displayName = 'MapContent';


const InteractiveMap = ({ location }: { location: DetectedLocation }) => {
    const [geoJson, setGeoJson] = useState<GeoJsonData | null>(null);
    const [districtsGeoJson, setDistrictsGeoJson] = useState<GeoJsonData | null>(null);
    const [allStatesGeoJson, setAllStatesGeoJson] = useState<GeoJsonData | null>(null);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [zoomedFeature, setZoomedFeature] = useState<ZoomState>({ feature: null, type: null, progress: 0 });

    const [hoveredFeature, setHoveredFeature] = useState<{ feature: GeoJsonFeature; type: 'state' | 'district' } | null>(null);
    const [viewLevel, setViewLevel] = useState<'country' | 'state' | 'district'>('country');
    const [hoverProgress, setHoverProgress] = useState(0);

    const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const animationFrameRef = useRef<number | null>(null);
    const scrollAnimationFrameRef = useRef<number | null>(null);
    const zoomStartTimeRef = useRef<number>(0);
    const currentHoveredRef = useRef<{ feature: GeoJsonFeature | null; type: 'state' | 'district' | null }>({ feature: null, type: null });
    const hoverStartTimeRef = useRef<number>(0);
    const hoverAnimationRef = useRef<number | null>(null);

    const HOVER_DELAY = 2000;
    const DEBOUNCE_DELAY = 40;

    useEffect(() => {
        const loadGeoJson = async () => {
            setLoading(true);
            setError(null);
            setZoomedFeature({ feature: null, type: null, progress: 0 });

            try {
                let apiUrl: string;

                if (location.type === "country" && location.name === "India") {
                    apiUrl = `/api/geojson?allstates=true`;
                    setViewLevel('country');
                } else if (location.type === "district" && location.name) {
                    apiUrl = `/api/geojson?district=${encodeURIComponent(location.name)}`;
                    setViewLevel('district');
                } else {
                    const stateName = location.stateName || location.name;
                    apiUrl = `/api/geojson?state=${encodeURIComponent(stateName)}`;
                    setViewLevel('state');
                }

                const response = await fetch(apiUrl, {
                    method: "GET",
                    headers: {
                        Accept: "application/json",
                    },
                });

                if (!response.ok) {
                    if (location.type === "district" && location.stateName) {
                        const fallbackUrl = `/api/geojson?state=${encodeURIComponent(location.stateName)}`;
                        const fallbackResponse = await fetch(fallbackUrl);
                        if (fallbackResponse.ok) {
                            const data = await fallbackResponse.json();
                            if (data.geoJson) {
                                setGeoJson(data.geoJson);
                                setDistrictsGeoJson(data.districtsGeoJson || null);
                                return;
                            }
                        }
                    }
                    throw new Error("Failed to load map data");
                }

                const data = await response.json();
                if (data.error) {
                    throw new Error(data.error);
                }

                if (location.type === "country") {
                    setAllStatesGeoJson(data.geoJson);
                    setGeoJson(null);
                    setDistrictsGeoJson(null);
                } else {
                    setGeoJson(data.geoJson);
                    if (data.districtsGeoJson) {
                        setDistrictsGeoJson(data.districtsGeoJson);
                    } else {
                        setDistrictsGeoJson(null);
                    }
                }
            } catch (err: unknown) {
                setError(err instanceof Error ? err.message : "An error occurred");
            } finally {
                setLoading(false);
            }
        };

        loadGeoJson();
    }, [location]);

    useEffect(() => {
        return () => {
            if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
            if (debounceTimeoutRef.current) clearTimeout(debounceTimeoutRef.current);
            if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
            if (hoverAnimationRef.current) cancelAnimationFrame(hoverAnimationRef.current);
        };
    }, []);

    useEffect(() => {
        if (zoomedFeature.feature && zoomedFeature.progress < 1) {
            if (zoomStartTimeRef.current === 0) {
                zoomStartTimeRef.current = Date.now();
            }

            const duration = 600;

            const animate = () => {
                const elapsed = Date.now() - zoomStartTimeRef.current;
                const rawProgress = Math.min(elapsed / duration, 1);

                const eased = rawProgress < 0.5
                    ? 4 * rawProgress * rawProgress * rawProgress
                    : 1 - Math.pow(-2 * rawProgress + 2, 3) / 2;

                setZoomedFeature(prev => ({ ...prev, progress: eased }));

                if (rawProgress < 1) {
                    animationFrameRef.current = requestAnimationFrame(animate);
                } else {
                    if (zoomedFeature.type === 'state') setViewLevel('state');
                    else if (zoomedFeature.type === 'district') setViewLevel('district');
                }
            };

            animationFrameRef.current = requestAnimationFrame(animate);

            return () => {
                if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
            };
        } else if (!zoomedFeature.feature) {
            zoomStartTimeRef.current = 0;
        }
    }, [zoomedFeature.feature, zoomedFeature.type]);

    const handleFeatureHoverStart = useCallback((feature: GeoJsonFeature, type: 'state' | 'district') => {
        if (debounceTimeoutRef.current) clearTimeout(debounceTimeoutRef.current);
        if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
        if (hoverAnimationRef.current) cancelAnimationFrame(hoverAnimationRef.current);

        debounceTimeoutRef.current = setTimeout(() => {
            currentHoveredRef.current = { feature, type };
            hoverStartTimeRef.current = Date.now();

            setHoveredFeature({ feature, type });
            setHoverProgress(0);

            const animateHover = () => {
                const progress = Math.min((Date.now() - hoverStartTimeRef.current) / HOVER_DELAY, 1);
                setHoverProgress(progress);
                if (progress < 1) {
                    hoverAnimationRef.current = requestAnimationFrame(animateHover);
                }
            };
            hoverAnimationRef.current = requestAnimationFrame(animateHover);

            hoverTimeoutRef.current = setTimeout(() => {
                if (currentHoveredRef.current?.feature === feature) {
                    setZoomedFeature({ feature, type, progress: 0 });
                    setHoveredFeature(null);
                    setHoverProgress(0);
                    currentHoveredRef.current = { feature: null, type: null };
                }
            }, HOVER_DELAY);

        }, DEBOUNCE_DELAY);
    }, []);

    const handleFeatureHoverEnd = useCallback(() => {
        if (debounceTimeoutRef.current) clearTimeout(debounceTimeoutRef.current);
        if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
        if (hoverAnimationRef.current) cancelAnimationFrame(hoverAnimationRef.current);

        currentHoveredRef.current = { feature: null, type: null };
        setHoveredFeature(null);
        setHoverProgress(0);
    }, []);

    const handleReset = useCallback(() => {
        if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
        if (hoverAnimationRef.current) cancelAnimationFrame(hoverAnimationRef.current);
        setZoomedFeature({ feature: null, type: null, progress: 0 });
        setHoveredFeature(null);
        setHoverProgress(0);
        zoomStartTimeRef.current = 0;
        setViewLevel(location.type === "country" ? 'country' : 'state');
    }, [location.type]);

    if (loading) {
        return (
            <Card className="p-6 bg-gradient-to-br from-slate-900/90 to-slate-800/90 border border-slate-700/50 backdrop-blur-sm mt-3 shadow-2xl">
                <div className="h-[500px] flex items-center justify-center">
                    <div className="text-center space-y-4">
                        <div className="relative w-16 h-16 mx-auto">
                            <div className="absolute inset-0 border-4 border-blue-500/30 rounded-full"></div>
                            <div className="absolute inset-0 border-4 border-blue-500 rounded-full border-t-transparent animate-spin"></div>
                        </div>
                        <div className="text-sm text-slate-300 font-medium">Loading map...</div>
                    </div>
                </div>
            </Card>
        );
    }

    if (error || (!geoJson && !allStatesGeoJson)) {
        return (
            <Card className="p-6 bg-gradient-to-br from-slate-900/90 to-slate-800/90 border border-slate-700/50 backdrop-blur-sm mt-3 shadow-2xl">
                <div className="h-[500px] flex items-center justify-center">
                    <div className="text-center space-y-3">
                        <Map className="w-12 h-12 mx-auto text-slate-500" />
                        <div className="text-sm text-slate-400">{error || "Map unavailable"}</div>
                    </div>
                </div>
            </Card>
        );
    }

    let baseFeatures: GeoJsonFeature[] = [];
    let isIndiaView = false;

    if (allStatesGeoJson && viewLevel === 'country' && !zoomedFeature.feature) {
        baseFeatures = allStatesGeoJson.features;
        isIndiaView = true;
    } else if (geoJson) {
        baseFeatures = geoJson.features;
    }

    const baseBounds = calculateBounds(baseFeatures);
    const targetBounds = zoomedFeature.feature ? calculateBounds([zoomedFeature.feature]) : baseBounds;
    const bounds = zoomedFeature.feature && zoomedFeature.progress > 0 ? interpolateBounds(baseBounds, targetBounds, zoomedFeature.progress) : baseBounds;

    const SVG_WIDTH = 800, SVG_HEIGHT = 600;
    const baseOpacity = zoomedFeature.progress > 0 ? Math.max(0, 1 - zoomedFeature.progress * 1.5) : 1;

    return (
        <Card className="p-6 bg-gradient-to-br from-slate-900/90 to-slate-800/90 border border-slate-700/50 backdrop-blur-sm mt-3 shadow-2xl overflow-hidden">
            <MapHeader
                location={location}
                hoveredFeature={hoveredFeature}
                zoomedFeature={zoomedFeature}
                hoverProgress={hoverProgress}
                onReset={handleReset}
            />

            <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-gradient-to-br from-slate-950 to-slate-900 border border-slate-700/50 shadow-inner">
                <div className="absolute inset-0 opacity-10" style={{ backgroundImage: `linear-gradient(to right, rgba(59,130,246,0.3) 1px, transparent 1px), linear-gradient(to bottom, rgba(59,130,246,0.3) 1px, transparent 1px)`, backgroundSize: '40px 40px' }}></div>
                <div className="absolute inset-0 bg-gradient-radial from-transparent via-transparent to-slate-950/50"></div>

                {bounds && (
                    <MapContent
                        isIndiaView={isIndiaView}
                        viewLevel={viewLevel}
                        allStatesGeoJson={allStatesGeoJson}
                        geoJson={geoJson}
                        districtsGeoJson={districtsGeoJson}
                        bounds={bounds}
                        width={SVG_WIDTH}
                        height={SVG_HEIGHT}
                        zoomedFeature={zoomedFeature}
                        hoveredFeature={hoveredFeature}
                        baseOpacity={baseOpacity}
                        locationName={location.name}
                        onHoverStart={handleFeatureHoverStart}
                        onHoverEnd={handleFeatureHoverEnd}
                    />
                )}
            </div>
        </Card>
    );
};

export function MapVisualization({ location, locations }: MapVisualizationProps) {
    if (locations && locations.length > 0) {
        return (
            <div className={`grid gap-4 ${locations.length > 1 ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'}`}>
                {locations.map((loc, index) => (
                    <InteractiveMap key={`${loc.name}-${index}`} location={loc} />
                ))}
            </div>
        );
    }

    if (location) {
        return <InteractiveMap location={location} />;
    }

    return null;
}