import { Box, Loader, Paper, Stack, Text, TextInput } from "@mantine/core";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api/client";
import { createMap, L, type LeafletMap, type LeafletMouseEvent } from "../lib/leaflet";

type OneMapCandidate = {
  name: string;
  address: string;
  lat: number;
  lng: number;
};

type MapPickerProps = {
  lat: number | null;
  lng: number | null;
  radius: number;
  onChange: (lat: number, lng: number) => void;
};

function roundCoord(value: number) {
  return Number(value.toFixed(6));
}

function isValidPoint(lat: number | null, lng: number | null) {
  return (
    lat !== null &&
    lng !== null &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

export function MapPicker({ lat, lng, radius, onChange }: MapPickerProps) {
  const [searchText, setSearchText] = useState("");
  const [candidates, setCandidates] = useState<OneMapCandidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [showCandidates, setShowCandidates] = useState(false);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapObjRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<ReturnType<typeof L.marker> | null>(null);
  const circleRef = useRef<ReturnType<typeof L.circle> | null>(null);

  const hasPoint = isValidPoint(lat, lng);
  const radiusNum = Number(radius);

  const center = useMemo<[number, number]>(() => (hasPoint ? [lat!, lng!] : [1.3521, 103.8198]), [hasPoint, lat, lng]);

  function setPoint(nextLat: number, nextLng: number) {
    onChange(roundCoord(nextLat), roundCoord(nextLng));
  }

  useEffect(() => {
    const keyword = searchText.trim();
    if (!keyword) {
      setCandidates([]);
      setSearching(false);
      return;
    }

    let cancelled = false;
    setSearching(true);
    const timer = window.setTimeout(() => {
      api<OneMapCandidate[]>(`/geocode/search?q=${encodeURIComponent(keyword)}`)
        .then((rows) => {
          if (!cancelled) {
            setCandidates(rows);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setCandidates([]);
          }
        })
        .finally(() => {
          if (!cancelled) {
            setSearching(false);
          }
        });
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [searchText]);

  useEffect(() => {
    if (!mapRef.current || mapObjRef.current) {
      return;
    }

    const map = createMap(mapRef.current, { center, zoom: hasPoint ? 16 : 12 });
    map.on("click", (event: LeafletMouseEvent) => {
      setPoint(event.latlng.lat, event.latlng.lng);
    });
    mapObjRef.current = map;
    window.setTimeout(() => map.invalidateSize(), 0);

    return () => {
      map.remove();
      mapObjRef.current = null;
      markerRef.current = null;
      circleRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapObjRef.current;
    if (!map) {
      return;
    }

    if (!hasPoint) {
      markerRef.current?.remove();
      circleRef.current?.remove();
      markerRef.current = null;
      circleRef.current = null;
      return;
    }

    const latlng: [number, number] = [lat!, lng!];
    if (!markerRef.current) {
      const marker = L.marker(latlng, { draggable: true }).addTo(map);
      marker.on("dragend", () => {
        const next = marker.getLatLng();
        setPoint(next.lat, next.lng);
      });
      markerRef.current = marker;
    } else {
      markerRef.current.setLatLng(latlng);
    }

    if (Number.isFinite(radiusNum) && radiusNum > 0) {
      if (!circleRef.current) {
        circleRef.current = L.circle(latlng, {
          radius: radiusNum,
          color: "var(--mantine-color-blue-6)",
          fillColor: "var(--mantine-color-blue-6)",
          fillOpacity: 0.12,
          weight: 2
        }).addTo(map);
      } else {
        circleRef.current.setLatLng(latlng);
        circleRef.current.setRadius(radiusNum);
      }
    } else {
      circleRef.current?.remove();
      circleRef.current = null;
    }

    map.setView(latlng, Math.max(map.getZoom(), 16), { animate: true });
    window.setTimeout(() => map.invalidateSize(), 0);
  }, [hasPoint, lat, lng, radiusNum]);

  return (
    <Stack gap="xs">
      <Box pos="relative">
        <TextInput
          label="地址搜索"
          placeholder="输入 OneMap 地址或邮编"
          value={searchText}
          rightSection={searching ? <Loader size="xs" /> : null}
          onChange={(event) => {
            setSearchText(event.currentTarget.value);
            setShowCandidates(true);
          }}
          onFocus={() => setShowCandidates(true)}
        />
        {showCandidates && candidates.length > 0 ? (
          <Paper
            withBorder
            shadow="md"
            pos="absolute"
            left={0}
            right={0}
            top="100%"
            mt={4}
            mah={260}
            style={{ overflowY: "auto", zIndex: 1000 }}
          >
            {candidates.map((candidate) => (
              <Box
                component="button"
                key={`${candidate.lat}:${candidate.lng}:${candidate.name}`}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  setSearchText(candidate.name || candidate.address);
                  setCandidates([]);
                  setShowCandidates(false);
                  setPoint(candidate.lat, candidate.lng);
                }}
                style={{
                  display: "block",
                  width: "100%",
                  border: 0,
                  borderBottom: "1px solid var(--mantine-color-gray-2)",
                  background: "transparent",
                  cursor: "pointer",
                  padding: "8px 12px",
                  textAlign: "left"
                }}
              >
                <Text size="sm" fw={600}>
                  {candidate.name || candidate.address}
                </Text>
                <Text size="xs" c="dimmed" lineClamp={2}>
                  {candidate.address}
                </Text>
              </Box>
            ))}
          </Paper>
        ) : null}
      </Box>
      <Box
        ref={mapRef}
        h={320}
        style={{
          borderRadius: "var(--mantine-radius-md)",
          overflow: "hidden",
          background: "var(--mantine-color-gray-1)"
        }}
      />
    </Stack>
  );
}
