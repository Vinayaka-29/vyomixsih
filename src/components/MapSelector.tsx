import { useState, useRef, useEffect, useCallback } from "react";
import { Camera, MousePointer, MapPin, Loader2, History, ChevronsLeftRight, ArrowLeftRight } from "lucide-react";
import html2canvas from "html2canvas";
import * as Cesium from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";
import { useI18n } from "@/lib/i18n";

Cesium.Ion.defaultAccessToken = "";

// Political boundaries & placenames overlay (Crisp labels across entire globe)
const labelsProvider = new Cesium.UrlTemplateImageryProvider({
  url: 'https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
  credit: 'Esri Reference',
  maximumLevel: 19
});

export interface LayerChoice {
  id: string;
  name: string;
  shortLabel: string;
  resolution: string;
  createProvider: () => Cesium.ImageryProvider;
}

/**
 * Curated High-Resolution Satellite & Historical Map Layers:
 * - Google Satellite: 0.3m ultra-high resolution globally
 * - Google Hybrid: 0.3m ultra-res with road labels
 * - Present Day (Esri World Imagery): 0.3m ultra-high resolution
 * - Esri Wayback Archives: True historical satellite imagery
 * Both Left and Right viewports can be freely and independently selected!
 */
export const AVAILABLE_LAYERS: LayerChoice[] = [
  {
    id: "google-sat",
    name: "Google Satellite (Ultra High-Res 0.3m)",
    shortLabel: "Google Sat",
    resolution: "0.3m Ultra-Res",
    createProvider: () => new Cesium.UrlTemplateImageryProvider({
      url: 'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
      credit: 'Google Satellite',
      maximumLevel: 20
    })
  },
  {
    id: "google-hybrid",
    name: "Google Hybrid (Satellite + Labels 0.3m)",
    shortLabel: "Google Hybrid",
    resolution: "0.3m Hybrid",
    createProvider: () => new Cesium.UrlTemplateImageryProvider({
      url: 'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
      credit: 'Google Hybrid',
      maximumLevel: 20
    })
  },
  {
    id: "esri-present",
    name: "Present Day (Esri World Imagery 0.3m)",
    shortLabel: "Present Day",
    resolution: "0.3m Ultra-Res",
    createProvider: () => new Cesium.UrlTemplateImageryProvider({
      url: 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      credit: 'Esri World Imagery',
      maximumLevel: 19
    })
  },
  {
    id: "wb-2024",
    name: "2024 Archive (High-Res 0.3m)",
    shortLabel: "2024",
    resolution: "0.3m High-Res",
    createProvider: () => new Cesium.UrlTemplateImageryProvider({
      url: 'https://wayback.maptiles.arcgis.com/arcgis/rest/services/world_imagery/wmts/1.0.0/default028mm/mapserver/tile/16453/{z}/{y}/{x}',
      credit: 'Esri Wayback 2024',
      maximumLevel: 19
    })
  },
  {
    id: "wb-2022",
    name: "2022 Archive (High-Res 0.5m)",
    shortLabel: "2022",
    resolution: "0.5m High-Res",
    createProvider: () => new Cesium.UrlTemplateImageryProvider({
      url: 'https://wayback.maptiles.arcgis.com/arcgis/rest/services/world_imagery/wmts/1.0.0/default028mm/mapserver/tile/45134/{z}/{y}/{x}',
      credit: 'Esri Wayback 2022',
      maximumLevel: 19
    })
  },
  {
    id: "wb-2020",
    name: "2020 Archive (High-Res 0.5m)",
    shortLabel: "2020",
    resolution: "0.5m High-Res",
    createProvider: () => new Cesium.UrlTemplateImageryProvider({
      url: 'https://wayback.maptiles.arcgis.com/arcgis/rest/services/world_imagery/wmts/1.0.0/default028mm/mapserver/tile/29260/{z}/{y}/{x}',
      credit: 'Esri Wayback 2020',
      maximumLevel: 19
    })
  },
  {
    id: "wb-2018",
    name: "2018 Archive (Medium-Res 1.2m)",
    shortLabel: "2018",
    resolution: "1.2m Medium-Res",
    createProvider: () => new Cesium.UrlTemplateImageryProvider({
      url: 'https://wayback.maptiles.arcgis.com/arcgis/rest/services/world_imagery/wmts/1.0.0/default028mm/mapserver/tile/23448/{z}/{y}/{x}',
      credit: 'Esri Wayback 2018',
      maximumLevel: 17
    })
  },
  {
    id: "wb-2016",
    name: "2016 Archive (Medium-Res 1.5m)",
    shortLabel: "2016",
    resolution: "1.5m Medium-Res",
    createProvider: () => new Cesium.UrlTemplateImageryProvider({
      url: 'https://wayback.maptiles.arcgis.com/arcgis/rest/services/world_imagery/wmts/1.0.0/default028mm/mapserver/tile/18966/{z}/{y}/{x}',
      credit: 'Esri Wayback 2016',
      maximumLevel: 17
    })
  },
  {
    id: "wb-2014",
    name: "2014 Archive (Legacy 2.5m)",
    shortLabel: "2014",
    resolution: "2.5m Legacy",
    createProvider: () => new Cesium.UrlTemplateImageryProvider({
      url: 'https://wayback.maptiles.arcgis.com/arcgis/rest/services/world_imagery/wmts/1.0.0/default028mm/mapserver/tile/5844/{z}/{y}/{x}',
      credit: 'Esri Wayback 2014',
      maximumLevel: 17
    })
  }
];

// Curated High-Resolution Satellite & Historical Map Layers


/**
 * Ensure all tiles are fully downloaded and rendered onto the GPU before screenshot capture.
 * Prevents blank blue / half-loaded imagery captures.
 */
async function ensureTilesReady(viewer: Cesium.Viewer, maxWaitMs = 2800): Promise<void> {
  viewer.scene.requestRender();
  await new Promise(r => setTimeout(r, 400));

  const startTime = Date.now();
  while (!viewer.scene.globe.tilesLoaded && Date.now() - startTime < maxWaitMs) {
    viewer.scene.requestRender();
    await new Promise(r => setTimeout(r, 120));
  }
  viewer.render();
  await new Promise(r => setTimeout(r, 200));
}

export interface BitemporalMetadata {
  dateT1: string;
  dateT2: string;
  labelT1: string;
  isBitemporal: boolean;
}

interface MapSelectorProps {
  onSelectBounds: (
    bounds: [[number, number], [number, number]], 
    imageFiles?: File | File[],
    meta?: BitemporalMetadata
  ) => void;
}

export function MapSelector({ onSelectBounds }: MapSelectorProps) {
  const [mode, setMode] = useState<"pan" | "draw">("pan");
  const [drawnBounds, setDrawnBounds] = useState<[[number, number], [number, number]] | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [captureStatus, setCaptureStatus] = useState<string>("");
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [userCoords, setUserCoords] = useState<{ lat: number; lon: number } | null>(null);

  // Bi-temporal Timeline State
  const [isBitemporal, setIsBitemporal] = useState(false);
  // Default Left Layer: 2022 (Crisp sub-meter high-res)
  const [leftLayerId, setLeftLayerId] = useState<string>("wb-2022");
  // Default Right Layer: Present Day (Esri World Imagery 0.3m)
  const [rightLayerId, setRightLayerId] = useState<string>("esri-present");

  const [splitPosition, setSplitPosition] = useState(0.5);
  const [isDraggingSplitter, setIsDraggingSplitter] = useState(false);

  const leftLayerOption = AVAILABLE_LAYERS.find(l => l.id === leftLayerId) || AVAILABLE_LAYERS[4]!;
  const rightLayerOption = AVAILABLE_LAYERS.find(l => l.id === rightLayerId) || AVAILABLE_LAYERS[2]!;

  const { t } = useI18n();

  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Cesium.Viewer | null>(null);
  const handlerRef = useRef<Cesium.ScreenSpaceEventHandler | null>(null);
  const locationPulseRef = useRef<Cesium.Entity | null>(null);

  // Layer Refs
  const baseLayerRef = useRef<Cesium.ImageryLayer | null>(null);
  const t1LayerRef = useRef<Cesium.ImageryLayer | null>(null);
  const t2LayerRef = useRef<Cesium.ImageryLayer | null>(null);
  const labelsLayerRef = useRef<Cesium.ImageryLayer | null>(null);

  // Drawing refs
  const drawingRef = useRef(false);
  const startRef = useRef<Cesium.Cartographic | null>(null);
  const endRef = useRef<Cesium.Cartographic | null>(null);
  const tempEntityRef = useRef<Cesium.Entity | null>(null);
  const finalEntityRef = useRef<Cesium.Entity | null>(null);

  // Initialize Cesium viewer once with ultra-sharp rendering settings
  useEffect(() => {
    if (!containerRef.current) return;

    const defaultProvider = AVAILABLE_LAYERS[2]!.createProvider();

    const viewer = new Cesium.Viewer(containerRef.current, {
      animation: false,
      timeline: false,
      baseLayerPicker: false,
      homeButton: false,
      infoBox: false,
      sceneModePicker: false,
      selectionIndicator: false,
      navigationHelpButton: false,
      geocoder: false,
      baseLayer: new Cesium.ImageryLayer(defaultProvider),
      contextOptions: {
        webgl: {
          alpha: false,
          antialias: true,
          preserveDrawingBuffer: true,
          failIfMajorPerformanceCaveat: false,
        }
      }
    });

    // High-resolution sharp rendering on Retina/4K displays
    viewer.resolutionScale = window.devicePixelRatio || 1;
    viewer.scene.globe.maximumScreenSpaceError = 0.8; // Lower value = razor-sharp tile loading
    viewer.scene.globe.tileCacheSize = 2000;
    viewer.scene.globe.loadingDescendantLimit = 30;

    baseLayerRef.current = viewer.imageryLayers.get(0);
    const labelsLayer = viewer.imageryLayers.addImageryProvider(labelsProvider);
    labelsLayerRef.current = labelsLayer;

    viewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(0, 20, 25000000),
      orientation: {
        heading: 0.0,
        pitch: Cesium.Math.toRadians(-90.0),
        roll: 0.0,
      }
    });

    viewerRef.current = viewer;

    const handler = new Cesium.ScreenSpaceEventHandler(viewer.canvas);
    handlerRef.current = handler;

    return () => {
      handler.destroy();
      viewer.destroy();
      viewerRef.current = null;
      handlerRef.current = null;
    };
  }, []);

  // Synchronize Bi-temporal Left and Right layers & split direction
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    if (!isBitemporal) {
      // Standard Single Basemap View (Clean, sub-meter)
      if (t1LayerRef.current) {
        viewer.imageryLayers.remove(t1LayerRef.current);
        t1LayerRef.current = null;
      }
      if (t2LayerRef.current) {
        viewer.imageryLayers.remove(t2LayerRef.current);
        t2LayerRef.current = null;
      }
      if (baseLayerRef.current) {
        baseLayerRef.current.show = true;
        baseLayerRef.current.splitDirection = Cesium.SplitDirection.NONE;
      }
      if (labelsLayerRef.current) {
        labelsLayerRef.current.splitDirection = Cesium.SplitDirection.NONE;
        viewer.imageryLayers.raiseToTop(labelsLayerRef.current);
      }
      viewer.scene.splitPosition = 0.5;
      viewer.scene.requestRender();
    } else {
      // Bi-Temporal Split View Active:
      // T1 (Left): Selected Left Layer
      // T2 (Right): Selected Right Layer
      if (baseLayerRef.current) {
        baseLayerRef.current.show = false;
      }

      // Recreate T1 Layer (Left View)
      if (t1LayerRef.current) {
        viewer.imageryLayers.remove(t1LayerRef.current);
        t1LayerRef.current = null;
      }
      const providerT1 = leftLayerOption.createProvider();
      const layerT1 = viewer.imageryLayers.addImageryProvider(providerT1);
      layerT1.splitDirection = Cesium.SplitDirection.LEFT;
      t1LayerRef.current = layerT1;

      // Recreate T2 Layer (Right View)
      if (t2LayerRef.current) {
        viewer.imageryLayers.remove(t2LayerRef.current);
        t2LayerRef.current = null;
      }
      const providerT2 = rightLayerOption.createProvider();
      const layerT2 = viewer.imageryLayers.addImageryProvider(providerT2);
      layerT2.splitDirection = Cesium.SplitDirection.RIGHT;
      t2LayerRef.current = layerT2;

      // Placename labels remain on top across entire globe
      if (labelsLayerRef.current) {
        labelsLayerRef.current.splitDirection = Cesium.SplitDirection.NONE;
        viewer.imageryLayers.raiseToTop(labelsLayerRef.current);
      }

      viewer.scene.splitPosition = splitPosition;
      viewer.scene.requestRender();
    }
  }, [isBitemporal, leftLayerId, rightLayerId]);

  // Update scene split position when user moves the slider
  useEffect(() => {
    const viewer = viewerRef.current;
    if (viewer && isBitemporal) {
      viewer.scene.splitPosition = splitPosition;
      viewer.scene.requestRender();
    }
  }, [splitPosition, isBitemporal]);

  // Splitter pointer drag handlers (smooth, unclamped grab)
  const handleSplitterPointerDown = (e: React.PointerEvent) => {
    setIsDraggingSplitter(true);
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const handleSplitterPointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDraggingSplitter || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const rawFrac = (e.clientX - rect.left) / rect.width;
    const clamped = Math.min(Math.max(rawFrac, 0.05), 0.95);
    setSplitPosition(clamped);
    if (viewerRef.current) {
      viewerRef.current.scene.splitPosition = clamped;
      viewerRef.current.scene.requestRender();
    }
  }, [isDraggingSplitter]);

  const handleSplitterPointerUp = (e: React.PointerEvent) => {
    if (isDraggingSplitter) {
      setIsDraggingSplitter(false);
      try {
        (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
      } catch (_) {}
    }
  };

  // Swap Left and Right views
  const handleSwapViews = () => {
    setLeftLayerId(rightLayerId);
    setRightLayerId(leftLayerId);
  };

  // Setup drawing interaction (used in standard single-image mode)
  useEffect(() => {
    const handler = handlerRef.current;
    const viewer = viewerRef.current;
    if (!handler || !viewer) return;

    if (mode === "draw") {
      viewer.scene.screenSpaceCameraController.enableInputs = false;
      viewer.canvas.style.cursor = "crosshair";

      if (finalEntityRef.current) {
        viewer.entities.remove(finalEntityRef.current);
        finalEntityRef.current = null;
      }

      handler.setInputAction((click: any) => {
        const earthPos = viewer.camera.pickEllipsoid(click.position, viewer.scene.globe.ellipsoid);
        if (!earthPos) return;

        drawingRef.current = true;
        startRef.current = Cesium.Cartographic.fromCartesian(earthPos);
        endRef.current = Cesium.Cartographic.fromCartesian(earthPos);

        if (tempEntityRef.current) {
          viewer.entities.remove(tempEntityRef.current);
        }

        tempEntityRef.current = viewer.entities.add({
          rectangle: {
            coordinates: new Cesium.CallbackProperty(() => {
              if (!startRef.current || !endRef.current) return undefined;
              return Cesium.Rectangle.fromCartographicArray([startRef.current, endRef.current]);
            }, false),
            material: Cesium.Color.fromCssColorString('#38bdf8').withAlpha(0.2),
            outline: true,
            outlineColor: Cesium.Color.fromCssColorString('#38bdf8'),
            outlineWidth: 2
          }
        });
      }, Cesium.ScreenSpaceEventType.LEFT_DOWN);

      handler.setInputAction((movement: any) => {
        if (!drawingRef.current) return;
        const earthPos = viewer.camera.pickEllipsoid(movement.endPosition, viewer.scene.globe.ellipsoid);
        if (earthPos) {
          endRef.current = Cesium.Cartographic.fromCartesian(earthPos);
        }
      }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

      handler.setInputAction(() => {
        if (!drawingRef.current) return;
        drawingRef.current = false;

        const s = startRef.current;
        const e = endRef.current;

        if (s && e) {
          const minLat = Cesium.Math.toDegrees(Math.min(s.latitude, e.latitude));
          const maxLat = Cesium.Math.toDegrees(Math.max(s.latitude, e.latitude));
          const minLon = Cesium.Math.toDegrees(Math.min(s.longitude, e.longitude));
          const maxLon = Cesium.Math.toDegrees(Math.max(s.longitude, e.longitude));

          if (Math.abs(maxLat - minLat) > 0.0001 || Math.abs(maxLon - minLon) > 0.0001) {
            const bounds: [[number, number], [number, number]] = [
              [minLat, minLon],
              [maxLat, maxLon]
            ];
            setDrawnBounds(bounds);

            if (tempEntityRef.current) {
              viewer.entities.remove(tempEntityRef.current);
              tempEntityRef.current = null;
            }

            finalEntityRef.current = viewer.entities.add({
              rectangle: {
                coordinates: Cesium.Rectangle.fromDegrees(minLon, minLat, maxLon, maxLat),
                material: Cesium.Color.fromCssColorString('#38bdf8').withAlpha(0.1),
                outline: true,
                outlineColor: Cesium.Color.fromCssColorString('#38bdf8'),
                outlineWidth: 2
              }
            });

            setMode("pan");
          }
        }
      }, Cesium.ScreenSpaceEventType.LEFT_UP);

    } else {
      viewer.scene.screenSpaceCameraController.enableInputs = true;
      viewer.canvas.style.cursor = "default";
      handler.removeInputAction(Cesium.ScreenSpaceEventType.LEFT_DOWN);
      handler.removeInputAction(Cesium.ScreenSpaceEventType.MOUSE_MOVE);
      handler.removeInputAction(Cesium.ScreenSpaceEventType.LEFT_UP);
    }
  }, [mode]);

  /**
   * Fly to live geolocation smoothly WITHOUT cluttering the map with giant text badges.
   */
  const handleLiveLocation = () => {
    if (!navigator.geolocation) {
      setLocationError("Geolocation is not supported by your browser");
      return;
    }

    setLocating(true);
    setLocationError(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        const viewer = viewerRef.current;
        setUserCoords({ lat: latitude, lon: longitude });
        
        if (viewer) {
          // Remove old pulse marker if any
          if (locationPulseRef.current) {
            viewer.entities.remove(locationPulseRef.current);
            locationPulseRef.current = null;
          }

          // Sleek ground pulse ring (zero text label obstruction)
          locationPulseRef.current = viewer.entities.add({
            position: Cesium.Cartesian3.fromDegrees(longitude, latitude),
            ellipse: {
              semiMajorAxis: Math.max(accuracy, 40),
              semiMinorAxis: Math.max(accuracy, 40),
              material: Cesium.Color.fromCssColorString('#38bdf8').withAlpha(0.15),
              outline: true,
              outlineColor: Cesium.Color.fromCssColorString('#38bdf8').withAlpha(0.8),
              outlineWidth: 2,
              height: 0,
            }
          });

          // Auto remove pulse ring after 6 seconds to keep view 100% clean
          setTimeout(() => {
            if (viewerRef.current && locationPulseRef.current) {
              viewerRef.current.entities.remove(locationPulseRef.current);
              locationPulseRef.current = null;
            }
          }, 6000);

          viewer.camera.flyTo({
            destination: Cesium.Cartesian3.fromDegrees(longitude, latitude, 2200),
            orientation: {
              heading: 0.0,
              pitch: Cesium.Math.toRadians(-90.0),
              roll: 0.0,
            },
            duration: 2.2
          });
        }

        setLocating(false);
      },
      (error) => {
        setLocating(false);
        switch (error.code) {
          case error.PERMISSION_DENIED:
            setLocationError(t("map.locationError"));
            break;
          case error.POSITION_UNAVAILABLE:
            setLocationError("Location information unavailable");
            break;
          case error.TIMEOUT:
            setLocationError("Location request timed out");
            break;
          default:
            setLocationError("An unknown error occurred");
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      }
    );
  };

  /**
   * AUTOMATIC BITEMPORAL CAPTURE OF CURRENT VIEW (NO DRAWING NEEDED)
   * Captures Left layer (T1) and Right layer (T2) at full viewport resolution.
   * Ensures tiles are completely loaded before capturing to prevent blank blue frames.
   */
  const handleCaptureCurrentView = async () => {
    if (!containerRef.current || !viewerRef.current) return;
    const viewer = viewerRef.current;

    setCapturing(true);

    // Temporarily hide any location pulse markers so screenshot is 100% clean satellite imagery
    if (locationPulseRef.current) locationPulseRef.current.show = false;

    // Compute bounding box coordinates of current camera view
    const rect = viewer.camera.computeViewRectangle(viewer.scene.globe.ellipsoid);
    let bounds: [[number, number], [number, number]];
    if (rect) {
      const minLat = Cesium.Math.toDegrees(rect.south);
      const maxLat = Cesium.Math.toDegrees(rect.north);
      const minLon = Cesium.Math.toDegrees(rect.west);
      const maxLon = Cesium.Math.toDegrees(rect.east);
      bounds = [[minLat, minLon], [maxLat, maxLon]];
    } else {
      const carto = Cesium.Cartographic.fromCartesian(viewer.camera.position);
      const lat = Cesium.Math.toDegrees(carto.latitude);
      const lon = Cesium.Math.toDegrees(carto.longitude);
      bounds = [[lat - 0.05, lon - 0.05], [lat + 0.05, lon + 0.05]];
    }

    try {
      const t1Layer = t1LayerRef.current;
      const t2Layer = t2LayerRef.current;

      if (t1Layer && t2Layer) {
        // --- Pass 1: Render and load Left Layer Viewport (T1) ---
        setCaptureStatus(`Rendering ${leftLayerOption.shortLabel}...`);
        t1Layer.show = true;
        t1Layer.splitDirection = Cesium.SplitDirection.NONE;
        t2Layer.show = false;

        await ensureTilesReady(viewer);

        const canvas1 = await html2canvas(containerRef.current, { useCORS: true, allowTaint: false });
        const blob1: Blob | null = await new Promise(r => canvas1.toBlob(r, "image/png"));

        // --- Pass 2: Render and load Right Layer Viewport (T2) ---
        setCaptureStatus(`Rendering ${rightLayerOption.shortLabel}...`);
        t1Layer.show = false;
        t2Layer.show = true;
        t2Layer.splitDirection = Cesium.SplitDirection.NONE;

        await ensureTilesReady(viewer);

        const canvas2 = await html2canvas(containerRef.current, { useCORS: true, allowTaint: false });
        const blob2: Blob | null = await new Promise(r => canvas2.toBlob(r, "image/png"));

        // --- Restore split view ---
        t1Layer.show = true;
        t1Layer.splitDirection = Cesium.SplitDirection.LEFT;
        t2Layer.show = true;
        t2Layer.splitDirection = Cesium.SplitDirection.RIGHT;
        viewer.scene.splitPosition = splitPosition;
        viewer.render();

        const files: File[] = [];
        if (blob1) {
          files.push(new File([blob1], `T1-${leftLayerOption.shortLabel}.png`, { type: "image/png" }));
        }
        if (blob2) {
          files.push(new File([blob2], `T2-${rightLayerOption.shortLabel}.png`, { type: "image/png" }));
        }

        onSelectBounds(bounds, files, {
          dateT1: leftLayerOption.shortLabel,
          dateT2: rightLayerOption.shortLabel,
          labelT1: leftLayerOption.shortLabel,
          isBitemporal: true
        });
      }
    } catch (err) {
      console.error("Bi-temporal capture failed:", err);
    } finally {
      if (locationPulseRef.current) locationPulseRef.current.show = true;
      setCapturing(false);
      setCaptureStatus("");
    }
  };

  /**
   * Standard drawing capture (for normal single-image mode)
   */
  const handleStandardCapture = async () => {
    if (!drawnBounds || !containerRef.current || !viewerRef.current) return;
    const viewer = viewerRef.current;

    setCapturing(true);

    if (finalEntityRef.current) {
      viewer.entities.remove(finalEntityRef.current);
      finalEntityRef.current = null;
    }
    await ensureTilesReady(viewer, 1200);

    try {
      const canvas = await html2canvas(containerRef.current, { useCORS: true, allowTaint: false });
      canvas.toBlob((blob) => {
        if (blob) {
          const file = new File([blob], `map-selection-${Date.now()}.png`, { type: "image/png" });
          onSelectBounds(drawnBounds, [file], {
            dateT1: leftLayerOption.shortLabel,
            dateT2: rightLayerOption.shortLabel,
            labelT1: leftLayerOption.shortLabel,
            isBitemporal: false
          });
        } else {
          onSelectBounds(drawnBounds);
        }
        setCapturing(false);
        setDrawnBounds(null);
      }, "image/png");
    } catch (err) {
      console.error("Failed to capture map:", err);
      onSelectBounds(drawnBounds);
      setCapturing(false);
    }
  };

  return (
    <div 
      className="w-full h-full rounded-2xl overflow-hidden border border-white/10 relative shadow-2xl flex flex-col bg-[#080e1e]"
      onPointerMove={isDraggingSplitter ? handleSplitterPointerMove : undefined}
      onPointerUp={isDraggingSplitter ? handleSplitterPointerUp : undefined}
    >
      {/* ========================================================================= */}
      {/* CLEAN BI-TEMPORAL ERA SELECTOR BAR (No unnecessary slider, zero overflow) */}
      {/* ========================================================================= */}
      {isBitemporal && (
        <div className="absolute top-3.5 left-1/2 -translate-x-1/2 z-30 w-[min(96%,680px)] bg-[#0c1428]/95 backdrop-blur-2xl border border-white/15 rounded-2xl p-2.5 px-3 shadow-[0_16px_40px_rgba(0,0,0,0.7)] flex flex-col sm:flex-row items-stretch justify-center gap-2.5 text-white select-none animate-in fade-in zoom-in-95 duration-150">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <span className="size-2.5 rounded-full bg-cyan-400 shadow-[0_0_10px_#38bdf8] animate-pulse" />
            <div className="flex-1 min-w-0">
              <span className="block text-[10px] font-extrabold text-cyan-400 uppercase tracking-wider leading-none">
                Left View (T1)
              </span>
              <select
                value={leftLayerId}
                onChange={(e) => setLeftLayerId(e.target.value)}
                className="mt-1 w-full bg-black/70 border border-cyan-500/40 rounded-xl px-3 py-1.5 text-xs font-bold text-cyan-200 outline-none focus:border-cyan-400 cursor-pointer shadow-inner hover:border-cyan-400 transition-colors"
              >
                {AVAILABLE_LAYERS.map(l => (
                  <option key={l.id} value={l.id} className="bg-[#0c1428] text-white">
                    {l.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center justify-center px-0.5">
            <button
              type="button"
              onClick={handleSwapViews}
              className="p-2.5 rounded-xl bg-white/5 border border-white/10 hover:bg-cyan-500/20 hover:border-cyan-500/40 text-slate-300 hover:text-cyan-300 transition-all cursor-pointer hover:rotate-180 duration-300 shadow-sm active:scale-95"
              title="Swap Left and Right views"
              aria-label="Swap left and right map views"
            >
              <ArrowLeftRight className="size-4" />
            </button>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="flex-1 min-w-0">
              <span className="block text-[10px] font-extrabold text-emerald-400 uppercase tracking-wider leading-none text-right sm:text-left">
                Right View (T2)
              </span>
              <select
                value={rightLayerId}
                onChange={(e) => setRightLayerId(e.target.value)}
                className="mt-1 w-full bg-black/70 border border-emerald-500/40 rounded-xl px-3 py-1.5 text-xs font-bold text-emerald-200 outline-none focus:border-emerald-400 cursor-pointer shadow-inner hover:border-emerald-400 transition-colors text-right sm:text-left"
              >
                {AVAILABLE_LAYERS.map(l => (
                  <option key={l.id} value={l.id} className="bg-[#0c1428] text-white">
                    {l.name}
                  </option>
                ))}
              </select>
            </div>
            <span className="size-2.5 rounded-full bg-emerald-400 shadow-[0_0_10px_#34d399]" />
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* CESIUM 3D GLOBE VIEWPORT                                                 */}
      {/* ========================================================================= */}
      <div className="flex-1 relative w-full min-h-0 overflow-hidden">
        <div className="absolute inset-0 w-full h-full" ref={containerRef} />

        {/* Top-Corner Floating View Badges (Zero Clumping on Divider Line) */}
        {isBitemporal && (
          <>
            {/* Top-Left Corner Badge */}
            <div className="absolute top-20 left-4 z-20 pointer-events-none animate-in fade-in duration-200">
              <span className="px-3.5 py-1.5 rounded-full text-xs font-black tracking-wider uppercase bg-[#0c1428]/90 text-cyan-300 border border-cyan-500/40 shadow-xl backdrop-blur-md flex items-center gap-1.5">
                <span>◀</span>
                <span>{leftLayerOption.shortLabel}</span>
                <span className="text-[10px] text-cyan-400/70 font-mono font-normal">({leftLayerOption.resolution})</span>
              </span>
            </div>

            {/* Top-Right Corner Badge */}
            <div className="absolute top-20 right-4 z-20 pointer-events-none animate-in fade-in duration-200">
              <span className="px-3.5 py-1.5 rounded-full text-xs font-black tracking-wider uppercase bg-[#0c1428]/90 text-emerald-300 border border-emerald-500/40 shadow-xl backdrop-blur-md flex items-center gap-1.5">
                <span className="text-[10px] text-emerald-400/70 font-mono font-normal">({rightLayerOption.resolution})</span>
                <span>{rightLayerOption.shortLabel}</span>
                <span>▶</span>
              </span>
            </div>
          </>
        )}

        {/* Clean Split Screen Curtain Divider (100% Dead-Center Aligned) */}
        {isBitemporal && (
          <div 
            className="absolute top-0 bottom-0 z-20 pointer-events-none select-none"
            style={{ left: `${splitPosition * 100}%` }}
          >
            {/* Crisp Glowing Divider Line (Centered precisely on left: 0) */}
            <div className="absolute top-0 bottom-0 -left-[1px] w-[2px] bg-white shadow-[0_0_12px_rgba(56,189,248,0.9),0_0_2px_white]" />

            {/* Clean Centered Grabber Handle (Centered exactly at left: 0, top: 50%) */}
            <div 
              onPointerDown={handleSplitterPointerDown}
              onPointerMove={handleSplitterPointerMove}
              onPointerUp={handleSplitterPointerUp}
              onPointerCancel={handleSplitterPointerUp}
              className="absolute top-1/2 left-0 -translate-y-1/2 -translate-x-1/2 size-10 rounded-full bg-white text-slate-900 border-2 border-cyan-400 shadow-[0_4px_24px_rgba(0,0,0,0.6),0_0_16px_rgba(56,189,248,0.7)] flex items-center justify-center cursor-ew-resize pointer-events-auto hover:scale-115 active:scale-95 transition-all group"
              title="Drag curtain left / right to compare"
            >
              <ChevronsLeftRight className="size-4 text-slate-900 group-hover:text-cyan-600 transition-colors pointer-events-none" />
            </div>
          </div>
        )}

        {/* 1-Click Action Button & Clarity Note in Bi-Temporal Mode (NO DRAWING NEEDED) */}
        {isBitemporal && (
          <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-20 pointer-events-auto animate-in fade-in slide-in-from-bottom-2 duration-150 flex flex-col items-center gap-1.5 max-w-[94%]">
            <button
              type="button"
              onClick={() => void handleCaptureCurrentView()}
              disabled={capturing}
              className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-extrabold text-xs shadow-xl shadow-cyan-500/30 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50 hover:scale-102 active:scale-98"
            >
              {capturing ? (
                <>
                  <Loader2 className="size-3.5 animate-spin text-white" />
                  <span>{captureStatus || "Capturing satellite imagery..."}</span>
                </>
              ) : (
                <>
                  <Camera className="size-4" />
                  <span>Auto-Capture Both Views ({leftLayerOption.shortLabel} vs {rightLayerOption.shortLabel})</span>
                </>
              )}
            </button>
            <div className="text-[11px] text-slate-300 font-medium bg-[#0c1428]/90 backdrop-blur-md px-3.5 py-1 rounded-full border border-white/10 shadow-lg text-center leading-tight">
              Auto-captures zoomed-in full view of both <span className="text-cyan-300 font-bold">{leftLayerOption.shortLabel} (T1)</span> and <span className="text-emerald-300 font-bold">{rightLayerOption.shortLabel} (T2)</span> as separate high-res images for AI analysis.
            </div>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* BOTTOM CONTROL BAR                                                        */}
      {/* ========================================================================= */}
      <div className="p-3 bg-[#0c1428]/95 backdrop-blur-xl border-t border-white/10 flex items-center justify-between z-10 shrink-0 gap-3 flex-wrap md:flex-nowrap">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold text-white">
            {isBitemporal ? "Bi-Temporal Historical Comparison" : t("map.selectRegion")}
          </h3>
          <p className="text-xs text-slate-400 mt-0.5 leading-relaxed max-w-2xl">
            {isBitemporal
              ? "Select any era for Left and Right. Drag curtain to compare. Click 'Auto-Capture Both Views' to send both full-frame images to AI for change analysis."
              : (mode === "draw" ? t("map.drawInstruction") : t("map.panInstruction"))}
          </p>
          {locationError && (
            <p className="text-xs text-red-400 mt-1">{locationError}</p>
          )}
          {userCoords && !locationError && (
            <p className="text-xs text-cyan-400/80 mt-1 font-mono truncate">
              📍 GPS: {userCoords.lat.toFixed(5)}° N, {userCoords.lon.toFixed(5)}° E
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap justify-end">
          {/* Bi-Temporal Mode Toggle Button */}
          <button
            type="button"
            onClick={() => setIsBitemporal(prev => !prev)}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all shadow-sm border cursor-pointer ${
              isBitemporal
                ? "bg-cyan-500/20 border-cyan-400/50 text-cyan-300 ring-1 ring-cyan-500/30"
                : "bg-white/5 border-white/10 text-slate-300 hover:bg-white/10"
            }`}
            title="Toggle historical split-view comparison"
          >
            <History className={`size-3.5 ${isBitemporal ? "text-cyan-400 animate-pulse" : "text-slate-400"}`} />
            <span>Bi-Temporal Timeline</span>
          </button>

          {/* Live Location GPS Button */}
          <button
            type="button"
            onClick={handleLiveLocation}
            disabled={locating}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all shadow-sm border border-cyan-500/30 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20 disabled:opacity-50 cursor-pointer"
          >
            {locating ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                {t("map.locating")}
              </>
            ) : (
              <>
                <MapPin className="size-3.5" />
                {t("map.useLocation")}
              </>
            )}
          </button>

          {/* Draw / Pan Mode (Available in standard mode) */}
          {!isBitemporal && (
            <button
              type="button"
              onClick={() => {
                if (mode === "pan") {
                  setDrawnBounds(null);
                  setMode("draw");
                } else {
                  setMode("pan");
                }
              }}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors shadow-sm border cursor-pointer ${
                mode === "draw"
                  ? "bg-cyan-500/15 border-cyan-400/40 text-cyan-300"
                  : "bg-white/5 border-white/10 text-slate-300 hover:bg-white/10"
              }`}
            >
              <MousePointer className="size-3.5" />
              {mode === "draw" ? t("map.cancelDrawing") : t("map.drawArea")}
            </button>
          )}

          {/* Standard capture button for drawn box in standard mode */}
          {!isBitemporal && drawnBounds && (
            <button
              type="button"
              onClick={() => void handleStandardCapture()}
              disabled={capturing}
              className="flex items-center gap-2 bg-gradient-to-r from-cyan-500 to-blue-600 text-white px-3.5 py-2 rounded-xl text-xs font-bold hover:from-cyan-400 hover:to-blue-500 disabled:opacity-50 transition-all shadow-md shadow-cyan-500/25 cursor-pointer"
            >
              {capturing ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  <span>{t("map.capturing")}</span>
                </>
              ) : (
                <>
                  <Camera className="size-3.5" />
                  <span>{t("map.sendToChat")}</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
