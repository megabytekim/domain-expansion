"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import type {
  UnescoGeoJSON,
  UnescoSiteProperties,
  CategoryFilter,
} from "@/lib/types";

interface UnescoMapProps {
  data: UnescoGeoJSON;
  onSiteSelect: (site: UnescoSiteProperties | null) => void;
  filterState: {
    categories: Set<CategoryFilter>;
    hyechoOnly: boolean;
    region: string | null;
  };
}

export default function UnescoMap({
  data,
  onSiteSelect,
  filterState,
}: UnescoMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const onSiteSelectRef = useRef(onSiteSelect);

  // Keep callback ref in sync without triggering map re-creation
  useEffect(() => {
    onSiteSelectRef.current = onSiteSelect;
  }, [onSiteSelect]);

  // Initialize map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    const key = process.env.NEXT_PUBLIC_MAPTILER_KEY;
    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: `https://api.maptiler.com/maps/streets-v2-dark/style.json?key=${key}`,
      center: [15, 30],
      zoom: 2,
    });

    map.addControl(new maplibregl.NavigationControl(), "top-right");

    map.on("load", () => {
      // Add GeoJSON source with clustering
      map.addSource("unesco-sites", {
        type: "geojson",
        data: data as unknown as GeoJSON.FeatureCollection,
        cluster: true,
        clusterMaxZoom: 12,
        clusterRadius: 50,
      });

      // Cluster circles layer
      map.addLayer({
        id: "clusters",
        type: "circle",
        source: "unesco-sites",
        filter: ["has", "point_count"],
        paint: {
          "circle-color": "#1e293b",
          "circle-stroke-color": "#94a3b8",
          "circle-stroke-width": 2,
          "circle-radius": [
            "step",
            ["get", "point_count"],
            15,
            10,
            20,
            50,
            25,
            100,
            30,
            500,
            35,
          ],
        },
      });

      // Cluster count labels
      map.addLayer({
        id: "cluster-count",
        type: "symbol",
        source: "unesco-sites",
        filter: ["has", "point_count"],
        layout: {
          "text-field": [
            "step",
            ["get", "point_count"],
            ["to-string", ["get", "point_count"]],
            1000,
            [
              "concat",
              ["to-string", ["/", ["round", ["*", ["get", "point_count"], 0.1]], 0.1]],
              "k",
            ],
          ],
          "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
          "text-size": 12,
          "text-allow-overlap": true,
        },
        paint: {
          "text-color": "#e2e8f0",
        },
      });

      // Individual site circles
      map.addLayer({
        id: "sites",
        type: "circle",
        source: "unesco-sites",
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-radius": 6,
          "circle-color": [
            "match",
            ["get", "category"],
            "Cultural",
            "#ff6b35",
            "Natural",
            "#22c55e",
            "Mixed",
            "#3b82f6",
            "#888888",
          ],
          "circle-stroke-width": [
            "case",
            [
              "any",
              ["==", ["get", "hasHyecho"], true],
              ["==", ["get", "hasHyecho"], "true"],
            ],
            2,
            1,
          ],
          "circle-stroke-color": [
            "case",
            [
              "any",
              ["==", ["get", "hasHyecho"], true],
              ["==", ["get", "hasHyecho"], "true"],
            ],
            "#fbbf24",
            "#475569",
          ],
        },
      });

      // Click cluster → zoom to expansion
      map.on("click", "clusters", (e) => {
        const features = map.queryRenderedFeatures(e.point, {
          layers: ["clusters"],
        });
        if (!features.length) return;
        const clusterId = features[0].properties.cluster_id;
        const source = map.getSource("unesco-sites") as maplibregl.GeoJSONSource;
        source.getClusterExpansionZoom(clusterId).then((zoom) => {
          const geometry = features[0].geometry;
          if (geometry.type === "Point") {
            map.easeTo({
              center: geometry.coordinates as [number, number],
              zoom,
            });
          }
        });
      });

      // Click site → select it
      map.on("click", "sites", (e) => {
        const features = map.queryRenderedFeatures(e.point, {
          layers: ["sites"],
        });
        if (!features.length) return;

        const props = features[0].properties;

        // Parse stringified properties from MapLibre
        const site: UnescoSiteProperties = {
          id: typeof props.id === "string" ? parseInt(props.id, 10) : props.id,
          name: props.name,
          country: props.country,
          isoCode: props.isoCode,
          region: props.region,
          category: props.category as UnescoSiteProperties["category"],
          year:
            typeof props.year === "string"
              ? parseInt(props.year, 10)
              : props.year,
          endangered:
            typeof props.endangered === "string"
              ? props.endangered === "true"
              : props.endangered,
          description: props.description,
          imageUrl: props.imageUrl,
          url: props.url,
          criteria: props.criteria,
          hasHyecho:
            typeof props.hasHyecho === "string"
              ? props.hasHyecho === "true"
              : props.hasHyecho,
          hyechoPackages:
            typeof props.hyechoPackages === "string"
              ? JSON.parse(props.hyechoPackages)
              : props.hyechoPackages,
        };

        onSiteSelectRef.current(site);
      });

      // Click empty area → deselect
      map.on("click", (e) => {
        const queryLayers = ["sites"];
        if (map.getLayer("clusters")) queryLayers.push("clusters");
        const features = map.queryRenderedFeatures(e.point, {
          layers: queryLayers,
        });
        if (features.length === 0) {
          onSiteSelectRef.current(null);
        }
      });

      // Pointer cursor on hover
      map.on("mouseenter", "clusters", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "clusters", () => {
        map.getCanvas().style.cursor = "";
      });
      map.on("mouseenter", "sites", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "sites", () => {
        map.getCanvas().style.cursor = "";
      });
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Filter effect: update source data when filters change
  // When hyechoOnly is on and few markers remain, disable clustering
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const applyFilter = () => {
      const filtered = data.features.filter((feature) => {
        const props = feature.properties;
        if (!filterState.categories.has(props.category)) return false;
        if (filterState.hyechoOnly && !props.hasHyecho) return false;
        if (filterState.region && props.region !== filterState.region)
          return false;
        return true;
      });

      const shouldCluster = !filterState.hyechoOnly;

      // Remove old source and layers, re-add with updated cluster setting
      if (map.getLayer("clusters")) map.removeLayer("clusters");
      if (map.getLayer("cluster-count")) map.removeLayer("cluster-count");
      if (map.getLayer("sites")) map.removeLayer("sites");
      if (map.getSource("unesco-sites")) map.removeSource("unesco-sites");

      map.addSource("unesco-sites", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: filtered,
        } as unknown as GeoJSON.FeatureCollection,
        cluster: shouldCluster,
        clusterMaxZoom: 12,
        clusterRadius: 50,
      });

      if (shouldCluster) {
        map.addLayer({
          id: "clusters",
          type: "circle",
          source: "unesco-sites",
          filter: ["has", "point_count"],
          paint: {
            "circle-color": "#1e293b",
            "circle-stroke-color": "#94a3b8",
            "circle-stroke-width": 2,
            "circle-radius": [
              "step",
              ["get", "point_count"],
              15, 10, 20, 50, 25, 100, 30, 500, 35,
            ],
          },
        });

        map.addLayer({
          id: "cluster-count",
          type: "symbol",
          source: "unesco-sites",
          filter: ["has", "point_count"],
          layout: {
            "text-field": "{point_count_abbreviated}",
            "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
            "text-size": 12,
            "text-allow-overlap": true,
          },
          paint: { "text-color": "#e2e8f0" },
        });
      }

      map.addLayer({
        id: "sites",
        type: "circle",
        source: "unesco-sites",
        ...(shouldCluster ? { filter: ["!", ["has", "point_count"]] as maplibregl.ExpressionFilterSpecification } : {}),
        paint: {
          "circle-radius": filterState.hyechoOnly ? 8 : 6,
          "circle-color": [
            "match",
            ["get", "category"],
            "Cultural", "#ff6b35",
            "Natural", "#22c55e",
            "Mixed", "#3b82f6",
            "#888888",
          ],
          "circle-stroke-width": [
            "case",
            ["any", ["==", ["get", "hasHyecho"], true], ["==", ["get", "hasHyecho"], "true"]],
            2, 1,
          ],
          "circle-stroke-color": [
            "case",
            ["any", ["==", ["get", "hasHyecho"], true], ["==", ["get", "hasHyecho"], "true"]],
            "#fbbf24", "#475569",
          ],
        },
      });
    };

    if (map.isStyleLoaded()) {
      applyFilter();
    } else {
      map.once("load", applyFilter);
    }
  }, [data, filterState]);

  return (
    <div
      ref={mapContainerRef}
      className="h-full w-full"
      style={{ position: "absolute", inset: 0 }}
    />
  );
}
