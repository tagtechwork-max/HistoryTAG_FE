import { useEffect, useMemo, useState } from "react";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import PageMeta from "../../components/common/PageMeta";
import {
  getHospitalMapPointsByProvince,
  type HospitalMapPointDTO,
} from "../../api/hospitalMap.api";
import {
  getProvinceCenter,
  PROVINCE_FOCUS_ZOOM,
  provincesMatch,
  VIETNAM_PROVINCE_LABELS,
} from "../../utils/vietnamProvinceCenters";

type StatusCategory = "NOT_DEPLOYED" | "IN_PROGRESS" | "COMPLETED";

// react-leaflet typings in this project appear to be inconsistent with runtime props.
// Casting to `any` keeps UI working while avoiding build-time TS errors.
const MapContainerAny = MapContainer as any;
const TileLayerAny = TileLayer as any;
const MarkerAny = Marker as any;

function toStatusCategory(projectStatus?: string | null): StatusCategory {
  const s = (projectStatus || "").toUpperCase();
  if (s === "COMPLETED") return "COMPLETED";
  if (s === "NOT_DEPLOYED") return "NOT_DEPLOYED";
  // ProjectStatus can be ISSUE; map it under IN_PROGRESS to keep only 3 categories
  return "IN_PROGRESS";
}

function statusColor(category: StatusCategory): string {
  switch (category) {
    case "COMPLETED":
      return "#22c55e"; // green-500
    case "IN_PROGRESS":
      return "#f97316"; // orange-500
    case "NOT_DEPLOYED":
    default:
      return "#9ca3af"; // gray-400
  }
}

/**
 * Google Maps directions URL.
 * Prefer `address` when available to make the destination exact.
 */
function buildGoogleMapsDirectionsUrl(
  hospitalName: string,
  province?: string | null,
  address?: string | null,
): string {
  const parts = [
    hospitalName,
    address?.trim() || null,
    province?.trim() || null,
    "Việt Nam",
  ].filter((x): x is string => Boolean(x && x.trim()));
  const destination = encodeURIComponent(parts.join(", "));
  return `https://www.google.com/maps/dir/?api=1&destination=${destination}`;
}

/** Normalize for province search (case + diacritics insensitive). */
function normalizeProvinceQuery(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u0111/g, "d");
}

/**
 * When province filter changes, fly the map to that province or reset to Vietnam overview.
 */
function MapFocusOnProvince({ provinceFilter }: { provinceFilter: string }) {
  const map = useMap();

  useEffect(() => {
    const trimmed = provinceFilter.trim();
    if (!trimmed) {
      map.flyTo([16.0, 106.0], 6, { duration: 0.85 });
      return;
    }
    const c = getProvinceCenter(trimmed);
    if (!c) return;
    map.flyTo([c.lat, c.lng], PROVINCE_FOCUS_ZOOM, { duration: 0.85 });
  }, [provinceFilter, map]);

  return null;
}

function AddIslandLabelPane() {
  const map = useMap();

  useEffect(() => {
    const paneName = "island-labels";
    if (!map.getPane(paneName)) {
      const pane = map.createPane(paneName);
      // Put island labels above tiles/markers.
      pane.style.zIndex = "1200";
    }
  }, [map]);

  return null;
}

function createHospitalMarkerIcon(color: string, initialLetter: string) {
  // Small circular pin to match the marker feel in the screenshot.
  return L.divIcon({
    className: "",
    iconSize: [26, 26],
    iconAnchor: [13, 26],
    popupAnchor: [0, -28],
    html: `
      <div
        style="
          width: 26px;
          height: 26px;
          background: ${color};
          border: 3px solid white;
          border-radius: 9999px;
          box-shadow: 0 4px 14px rgba(0,0,0,0.25);
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 800;
          color: white;
          font-size: 12px;
        "
        aria-hidden="true"
      >
        ${initialLetter}
      </div>
    `,
  });
}

function createIslandLabelIcon(text: string) {
  // Overlay label to cover the tile's own (Chinese) place label.
  return L.divIcon({
    className: "",
    iconSize: [210, 44],
    iconAnchor: [105, 22],
    html: `
      <div
        style="
          padding: 8px 14px;
          border-radius: 9999px;
          background: rgba(255,255,255,0.96);
          border: 1px solid rgba(0,0,0,0.16);
          box-shadow: 0 2px 10px rgba(0,0,0,0.12);
          color: #111827;
          font-weight: 800;
          font-size: 13px;
          line-height: 1;
          white-space: nowrap;
          pointer-events: none;
        "
      >
        ${text}
      </div>
    `,
  });
}

function hashUnitInterval(n: number): number {
  // Deterministic pseudo-random in [0, 1) for stable jitter across renders.
  const x = Math.sin(n * 9999.123) * 10000;
  return x - Math.floor(x);
}

function jitterAroundCenter(center: { lat: number; lng: number }, hospitalId: number) {
  const a = hashUnitInterval(hospitalId);
  const b = hashUnitInterval(hospitalId + 12345);
  const angle = a * 2 * Math.PI;

  // Roughly 2-5km radius at province zoom (enough to visually separate markers).
  const radius = 0.02 + b * 0.03;

  return {
    lat: center.lat + radius * Math.sin(angle),
    lng: center.lng + radius * Math.cos(angle),
  };
}

export default function MapHospitals() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [points, setPoints] = useState<HospitalMapPointDTO[]>([]);

  const [visibleCategories, setVisibleCategories] = useState<Record<StatusCategory, boolean>>({
    NOT_DEPLOYED: true,
    IN_PROGRESS: true,
    COMPLETED: true,
  });

  /** Empty string = all provinces */
  const [selectedProvince, setSelectedProvince] = useState("");
  const [provinceSearch, setProvinceSearch] = useState("");

  const [filterOpen, setFilterOpen] = useState(false);

  const provinceSuggestions = useMemo(() => {
    const q = normalizeProvinceQuery(provinceSearch);
    if (!q) return [];
    return VIETNAM_PROVINCE_LABELS.filter((p) => normalizeProvinceQuery(p).includes(q)).slice(0, 12);
  }, [provinceSearch]);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await getHospitalMapPointsByProvince(
          selectedProvince.trim() ? selectedProvince : undefined,
        );
        if (alive) setPoints(Array.isArray(data) ? data : []);
      } catch (e: any) {
        if (alive) setError(e?.message || "Failed to load map data");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [selectedProvince]);

  const icons = useMemo(() => {
    return {
      COMPLETED: createHospitalMarkerIcon(statusColor("COMPLETED"), "✓"),
      IN_PROGRESS: createHospitalMarkerIcon(statusColor("IN_PROGRESS"), "…"),
      NOT_DEPLOYED: createHospitalMarkerIcon(statusColor("NOT_DEPLOYED"), "—"),
    };
  }, []);

  const markers = useMemo(() => {
    const items: Array<{
      point: HospitalMapPointDTO;
      category: StatusCategory;
      position: { lat: number; lng: number };
      icon: any;
    }> = [];

    for (const p of points) {
      const category = toStatusCategory(p.projectStatus);
      if (!visibleCategories[category]) continue;

      const province = p.province || null;
      if (selectedProvince.trim() && !provincesMatch(province, selectedProvince)) continue;

      const hasPrecise =
        typeof p.latitude === "number" && Number.isFinite(p.latitude) &&
        typeof p.longitude === "number" && Number.isFinite(p.longitude);

      const position = hasPrecise
        ? { lat: p.latitude as number, lng: p.longitude as number }
        : (() => {
            const center = getProvinceCenter(province);
            if (!center) return null;
            // When we only have province centroid (no precise lat/lng), spread markers
            // so "many points" don't look like "a few points stacked together".
            return jitterAroundCenter(center, p.hospitalId);
          })();

      if (!position) continue;

      items.push({
        point: p,
        category,
        position,
        icon: icons[category],
      });
    }

    return items;
  }, [points, visibleCategories, icons, selectedProvince]);

  const legendItemClass =
    "flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white/95 px-3 py-2";

  return (
    <>
      <PageMeta title="Tiện ích | Bản đồ bệnh viện" description="Hospitals map by project status." />

      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-bold text-gray-900">Bản đồ bệnh viện</h1>
            <p className="text-sm text-gray-600">Hiển thị theo trạng thái dự án: hoàn thành / đang thực hiện / chưa triển khai.</p>
          </div>
        </div>

        <div className="relative rounded-xl border border-gray-200 overflow-hidden bg-white">
          {/* Zoom control uses Leaflet default position (left). */}

          {!filterOpen ? (
            <button
              type="button"
              className="absolute z-[500] top-3 right-3 rounded-lg border border-gray-200 bg-white/95 px-3 py-1.5 text-sm font-semibold text-gray-800 shadow-sm hover:bg-white"
              onClick={() => setFilterOpen(true)}
            >
              Bộ lọc
            </button>
          ) : (
            <div className="absolute z-[500] top-3 right-3 w-[320px] max-w-[90vw]">
              <div className="space-y-2 rounded-xl bg-white/95 p-3 shadow">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-semibold text-gray-900">Bộ lọc</div>
                  <button
                    type="button"
                    className="shrink-0 rounded-lg border border-gray-200 bg-white px-2 py-1 text-[12px] font-semibold text-gray-700 hover:bg-gray-50"
                    onClick={() => setFilterOpen(false)}
                  >
                    Ẩn
                  </button>
                </div>

                <div className="space-y-1.5">
                  <div className="font-medium text-gray-600 text-xs">
                    Tỉnh / Thành phố
                  </div>
                <input
                  type="text"
                  value={provinceSearch}
                  onChange={(e) => setProvinceSearch(e.target.value)}
                  placeholder="Gõ để tìm (vd: Bắc Ninh)..."
                  className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  aria-label="Search province"
                />
                {selectedProvince ? (
                  <div
                    className="flex items-center justify-between gap-2 rounded-lg border border-blue-100 bg-blue-50/80 px-2 py-1.5 text-xs"
                  >
                    <span className="text-gray-800">
                      Đang lọc: <span className="font-semibold">{selectedProvince}</span>
                    </span>
                    <button
                      type="button"
                      className="shrink-0 font-semibold text-blue-600 hover:text-blue-800"
                      onClick={() => {
                        setSelectedProvince("");
                        setProvinceSearch("");
                      }}
                    >
                      Xóa
                    </button>
                  </div>
                ) : null}
                {provinceSearch.trim() && provinceSuggestions.length > 0 ? (
                  <ul
                    className="max-h-40 overflow-y-auto rounded-lg border border-gray-200 bg-white text-sm shadow-sm"
                    role="listbox"
                  >
                    {provinceSuggestions.map((p) => (
                      <li key={p}>
                        <button
                          type="button"
                          className="w-full px-2.5 py-1.5 text-left hover:bg-gray-100"
                          onClick={() => {
                            setSelectedProvince(p);
                            setProvinceSearch("");
                          }}
                        >
                          {p}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {provinceSearch.trim() && provinceSuggestions.length === 0 ? (
                  <div className="text-gray-500 text-xs">Không tìm thấy tỉnh phù hợp.</div>
                ) : null}
              </div>

              <label className={legendItemClass}>
                <span className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full" style={{ background: statusColor("COMPLETED") }} />
                  Hoàn thành
                </span>
                <input
                  type="checkbox"
                  checked={visibleCategories.COMPLETED}
                  onChange={() => setVisibleCategories((prev) => ({ ...prev, COMPLETED: !prev.COMPLETED }))}
                />
              </label>

              <label className={legendItemClass}>
                <span className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full" style={{ background: statusColor("IN_PROGRESS") }} />
                  Đang thực hiện
                </span>
                <input
                  type="checkbox"
                  checked={visibleCategories.IN_PROGRESS}
                  onChange={() => setVisibleCategories((prev) => ({ ...prev, IN_PROGRESS: !prev.IN_PROGRESS }))}
                />
              </label>

              <label className={legendItemClass}>
                <span className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full" style={{ background: statusColor("NOT_DEPLOYED") }} />
                  Chưa triển khai
                </span>
                <input
                  type="checkbox"
                  checked={visibleCategories.NOT_DEPLOYED}
                  onChange={() => setVisibleCategories((prev) => ({ ...prev, NOT_DEPLOYED: !prev.NOT_DEPLOYED }))}
                />
              </label>

            <div className="text-gray-600 pt-1 text-xs">
                Tổng:{" "}
                <span className="font-medium text-gray-900">
                  {markers.length}
                </span>
                {loading && <span className="ml-2 text-gray-500">(đang tải...)</span>}
              </div>
              </div>
            </div>
          )}

          <div className="h-[70vh] w-full">
            {error ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-red-600 text-sm">{error}</div>
              </div>
            ) : (
              <MapContainerAny
                center={[16.0, 106.0]}
                zoom={6}
                scrollWheelZoom={true}
                style={{ height: "100%", width: "100%" }}
              >
                <MapFocusOnProvince provinceFilter={selectedProvince} />
                <TileLayerAny
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  attribution='&copy; OpenStreetMap contributors'
                />

                <AddIslandLabelPane />

                {/* Overlay labels: top = Trường Sa, bottom = Hoàng Sa (per your screenshot) */}
                <MarkerAny
                  position={[16.75, 111.9]}
                  icon={createIslandLabelIcon("Trường Sa")}
                  interactive={false}
                  zIndexOffset={10000}
                  pane="island-labels"
                />
                <MarkerAny
                  position={[10.6, 114.3]}
                  icon={createIslandLabelIcon("Hoàng Sa")}
                  interactive={false}
                  zIndexOffset={10000}
                  pane="island-labels"
                />

                {markers.map((m) => (
                  <MarkerAny
                    key={m.point.hospitalId}
                    position={[m.position.lat, m.position.lng]}
                    icon={m.icon}
                  >
                    <Popup>
                      <div className="space-y-2 min-w-[200px]">
                        <a
                          href={buildGoogleMapsDirectionsUrl(m.point.hospitalName, m.point.province, m.point.address)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block font-semibold text-blue-600 hover:text-blue-700 hover:underline"
                        >
                          {m.point.hospitalName}
                        </a>
                        {m.point.hospitalCode ? (
                          <div className="text-sm text-gray-700">Mã: {m.point.hospitalCode}</div>
                        ) : null}
                        {m.point.province ? (
                          <div className="text-sm text-gray-700">Tỉnh/Thành: {m.point.province}</div>
                        ) : null}
                        <div className="text-sm">
                          Trạng thái:{" "}
                          <span className="font-medium text-gray-900">
                            {m.point.projectStatusDisplayName || m.category}
                          </span>
                        </div>
                        <a
                          href={buildGoogleMapsDirectionsUrl(m.point.hospitalName, m.point.province, m.point.address)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold !text-white hover:!text-white hover:bg-blue-700 no-underline"
                          style={{ color: "#ffffff" }}
                        >
                          Chỉ đường (Google Maps)
                        </a>
                      </div>
                    </Popup>
                  </MarkerAny>
                ))}
              </MapContainerAny>
            )}

            {!loading && points.length > 0 && markers.length === 0 ? (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-sm text-gray-600 bg-white/90 border border-gray-200 rounded-lg px-4 py-2">
                  Không có điểm nào hiển thị (thiếu tỉnh/thành hoặc không tìm được tọa độ province).
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}

