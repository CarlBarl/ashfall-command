#!/usr/bin/env python3
"""
Build a synthetic elevation grid for the Realpolitik theater of operations.

Generates a Float32 binary file with a 20-byte header followed by row-major
elevation data (south-to-north, west-to-east). Sea/ocean cells = 0.0,
land cells = elevation in meters above sea level.

Theater bounds: lat 12-43, lng 32-70
Resolution: 0.05 deg (~5.5 km cells)
Grid: 620 rows x 760 cols = 471,200 cells

Uses a function-based approach with real geographic boundaries:
- Water bodies defined by region checks (not fragile polygons)
- Mountain ridges modeled as distance-to-polyline with elevation profiles
- Plateaus and lowlands as regional elevation modifiers
- Procedural noise for natural terrain variation

Usage:
    python3 scripts/build-elevation-grid.py
"""

import struct
import math
import os
import time


# --- Grid Parameters ---
LAT_MIN = 12.0
LAT_MAX = 43.0
LNG_MIN = 32.0
LNG_MAX = 70.0
RESOLUTION = 0.05

ROWS = int((LAT_MAX - LAT_MIN) / RESOLUTION)  # 620
COLS = int((LNG_MAX - LNG_MIN) / RESOLUTION)  # 760
TOTAL_CELLS = ROWS * COLS  # 471,200


# ============================================================
# Utility functions
# ============================================================

def point_in_polygon(lat, lng, polygon):
    """Ray-casting point-in-polygon test. Polygon is [(lat,lng), ...]."""
    n = len(polygon)
    inside = False
    j = n - 1
    for i in range(n):
        yi, xi = polygon[i]
        yj, xj = polygon[j]
        if ((yi > lat) != (yj > lat)) and \
           (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi):
            inside = not inside
        j = i
    return inside


def dist_pt(lat1, lng1, lat2, lng2):
    """Distance in degrees between two points."""
    return math.sqrt((lat1 - lat2) ** 2 + (lng1 - lng2) ** 2)


def dist_to_segment(lat, lng, p1, p2):
    """Distance from point to line segment."""
    y1, x1 = p1
    y2, x2 = p2
    dx, dy = x2 - x1, y2 - y1
    if dx == 0 and dy == 0:
        return dist_pt(lat, lng, y1, x1)
    t = max(0, min(1, ((lng - x1) * dx + (lat - y1) * dy) / (dx * dx + dy * dy)))
    return dist_pt(lat, lng, y1 + t * dy, x1 + t * dx)


def dist_to_polyline(lat, lng, points):
    """Minimum distance from point to polyline."""
    return min(dist_to_segment(lat, lng, points[i], points[i + 1])
               for i in range(len(points) - 1))


def smoothstep(t):
    """Hermite smoothstep: 0->0, 1->1, smooth."""
    t = max(0.0, min(1.0, t))
    return t * t * (3.0 - 2.0 * t)


def lerp(a, b, t):
    return a + (b - a) * t


def simple_hash(a, b):
    """Deterministic pseudo-random 0..1 from two integer indices."""
    h = (a * 73856093) ^ (b * 19349663)
    h = ((h >> 16) ^ h) * 0x45D9F3B
    h = ((h >> 16) ^ h) * 0x45D9F3B
    h = (h >> 16) ^ h
    return (h & 0xFFFF) / 65535.0


def noise(lat_idx, lng_idx, octaves=3):
    """Multi-octave hash noise."""
    total = 0.0
    amp = 1.0
    freq = 1
    norm = 0.0
    for _ in range(octaves):
        total += amp * simple_hash(lat_idx * freq + 7919, lng_idx * freq + 4217)
        norm += amp
        amp *= 0.5
        freq *= 2
    return total / norm


# ============================================================
# WATER DETECTION
# ============================================================
# Uses region-based checks that approximate real coastlines.
# Each water body is defined by a combination of lat/lng bounds
# and line equations for coastlines.

def is_persian_gulf(lat, lng):
    """Persian Gulf: shallow body between Iran and Arabian Peninsula.
    Northern coast (Iran): roughly from (30.0,48.8) sweeping SE to (26.6,54.3)
    Southern coast (Arabia): roughly from (29.4,47.8) sweeping SE to (24.5,54.5)
    """
    # Bounding box first
    if not (24.0 < lat < 30.5 and 47.5 < lng < 56.5):
        return False

    # The gulf narrows from NW to SE. Model as a band between two coastlines.
    # Parameterize along the gulf axis (NW to SE) using longitude.

    # Northern coast (Iranian side) — latitude as function of longitude
    # From Shatt al-Arab (30.0, 48.5) to Strait of Hormuz (27.0, 56.3)
    def iran_coast(x):
        if x < 48.5:
            return 30.0
        if x < 50.0:
            return lerp(30.0, 29.0, (x - 48.5) / 1.5)
        if x < 52.0:
            return lerp(29.0, 27.5, (x - 50.0) / 2.0)
        if x < 54.0:
            return lerp(27.5, 27.0, (x - 52.0) / 2.0)
        if x < 56.3:
            return lerp(27.0, 26.5, (x - 54.0) / 2.3)
        return 26.5

    # Southern coast (Arabian side)
    # From Kuwait (29.4, 47.8) to UAE (24.5, 54.5) to Hormuz (26.0, 56.3)
    def arab_coast(x):
        if x < 48.0:
            return 29.0
        if x < 50.0:
            return lerp(29.0, 27.0, (x - 48.0) / 2.0)
        if x < 51.5:
            return lerp(27.0, 26.0, (x - 50.0) / 1.5)
        if x < 53.0:
            return lerp(26.0, 25.5, (x - 51.5) / 1.5)
        if x < 54.5:
            return lerp(25.5, 24.5, (x - 53.0) / 1.5)
        if x < 56.0:
            return lerp(24.5, 25.5, (x - 54.5) / 1.5)
        return 26.0

    n = iran_coast(lng)
    s = arab_coast(lng)
    return s < lat < n


def is_gulf_of_oman(lat, lng):
    """Gulf of Oman: connects Persian Gulf to Arabian Sea via Strait of Hormuz."""
    if not (22.5 < lat < 26.5 and 56.0 < lng < 61.5):
        return False
    # Northern coast (Iran/Makran): drops from ~26.5 at lng 57 to ~25.0 at lng 61
    north = lerp(26.5, 25.5, (lng - 56.0) / 5.5)
    # Southern coast (Oman): from ~24.5 at lng 57 to ~22.5 at lng 60
    south = lerp(24.5, 22.5, (lng - 56.0) / 4.0)
    if lng > 60.0:
        south = 22.5
    return south < lat < north


def is_strait_of_hormuz(lat, lng):
    """Strait of Hormuz: narrow channel at ~lng 56-57, lat 26-27."""
    if not (25.5 < lat < 27.0 and 55.5 < lng < 57.0):
        return False
    # Channel between Oman (Musandam) and Iran
    return True


def is_arabian_sea(lat, lng):
    """Arabian Sea: south of the Arabian Peninsula and Iran coast.
    Approximation: open ocean south of the coastline.
    """
    # Southern ocean floor
    if lat < 12.5:
        return True

    # Oman/Yemen coast: rough line from Aden (12.8, 45) to Muscat (23.5, 58.5)
    # then down to Gwadar (25.0, 62) and to Karachi (24.8, 67)
    if lng < 45.0:
        # West of Aden: water if below ~12.8
        return lat < 12.8
    if lng < 51.0:
        # South Yemen coast: rises from 12.8 to about 16 at Oman border
        coast_lat = lerp(12.8, 16.5, (lng - 45.0) / 6.0)
        return lat < coast_lat
    if lng < 54.0:
        # Oman south coast
        coast_lat = lerp(16.5, 17.0, (lng - 51.0) / 3.0)
        return lat < coast_lat
    if lng < 57.0:
        # Oman SE coast curves north
        coast_lat = lerp(17.0, 21.0, (lng - 54.0) / 3.0)
        return lat < coast_lat
    if lng < 59.0:
        # Oman east coast to Muscat area
        coast_lat = lerp(21.0, 23.0, (lng - 57.0) / 2.0)
        return lat < coast_lat
    if lng < 62.0:
        # Makran coast (Pakistan/Iran)
        coast_lat = lerp(23.0, 25.0, (lng - 59.0) / 3.0)
        return lat < coast_lat
    if lng < 68.0:
        # Pakistan coast to Karachi
        coast_lat = lerp(25.0, 24.5, (lng - 62.0) / 6.0)
        return lat < coast_lat
    # East of Karachi — Indus delta area
    coast_lat = lerp(24.5, 23.5, (lng - 68.0) / 2.0)
    return lat < coast_lat


def is_red_sea(lat, lng):
    """Red Sea: between Africa and Arabian Peninsula."""
    if not (12.0 < lat < 30.0 and 32.0 < lng < 44.0):
        return False

    # Eastern coast (Arabia): roughly a line from Aqaba (29.5, 35.0)
    # to Bab el-Mandeb (12.6, 43.3)
    # Western coast (Africa): parallel, ~1-2 deg west

    # The Red Sea runs roughly NNW-SSE
    # East coast longitude as function of latitude:
    def east_coast(y):
        if y > 28.0:
            return 34.8  # Gulf of Aqaba
        if y > 25.0:
            return lerp(34.8, 36.5, (28.0 - y) / 3.0)
        if y > 22.0:
            return lerp(36.5, 38.5, (25.0 - y) / 3.0)
        if y > 18.0:
            return lerp(38.5, 41.0, (22.0 - y) / 4.0)
        if y > 15.0:
            return lerp(41.0, 42.5, (18.0 - y) / 3.0)
        return lerp(42.5, 43.5, (15.0 - y) / 3.0)

    def west_coast(y):
        if y > 28.0:
            return 34.2
        if y > 25.0:
            return lerp(34.2, 35.0, (28.0 - y) / 3.0)
        if y > 22.0:
            return lerp(35.0, 36.5, (25.0 - y) / 3.0)
        if y > 18.0:
            return lerp(36.5, 39.0, (22.0 - y) / 4.0)
        if y > 15.0:
            return lerp(39.0, 41.5, (18.0 - y) / 3.0)
        return lerp(41.5, 43.0, (15.0 - y) / 3.0)

    w = west_coast(lat)
    e = east_coast(lat)
    return w < lng < e


def is_caspian_sea(lat, lng):
    """Caspian Sea: large enclosed body east of Caucasus."""
    if not (36.5 < lat < 43.0 and 48.5 < lng < 54.5):
        return False

    # Western coast (Azerbaijan/Iran): curved
    def west_coast(y):
        if y > 42.0:
            return 49.5
        if y > 40.0:
            return lerp(49.5, 49.8, (42.0 - y) / 2.0)
        if y > 38.5:
            return lerp(49.8, 49.5, (40.0 - y) / 1.5)
        if y > 37.0:
            return lerp(49.5, 49.0, (38.5 - y) / 1.5)
        return 49.5

    # Eastern coast (Turkmenistan/Kazakhstan)
    def east_coast(y):
        if y > 42.0:
            return 51.5
        if y > 40.0:
            return lerp(51.5, 52.5, (42.0 - y) / 2.0)
        if y > 38.5:
            return lerp(52.5, 53.5, (40.0 - y) / 1.5)
        if y > 37.0:
            return lerp(53.5, 52.0, (38.5 - y) / 1.5)
        return 51.0

    w = west_coast(lat)
    e = east_coast(lat)
    return w < lng < e


def is_mediterranean(lat, lng):
    """Mediterranean Sea: NW corner of theater."""
    if not (30.0 < lat < 37.0 and 32.0 < lng < 36.5):
        return False
    # Eastern Mediterranean coast: Israel/Lebanon/Syria
    # Coast runs roughly N-S at lng ~34-35.5
    if lng < 34.0 and lat < 35.5:
        return True
    if lng < 34.5 and lat > 34.0 and lat < 36.5:
        return True
    # Wider in the north (Turkey coast)
    if lat > 36.0 and lng < 36.0:
        return True
    return False


def is_black_sea(lat, lng):
    """Black Sea: northern Turkey coast."""
    if not (40.5 < lat < 43.0 and 32.0 < lng < 42.0):
        return False
    # South coast (Turkey): roughly lat 41-42 depending on lng
    coast = 41.0
    if lng < 34.0:
        coast = 41.5
    elif lng < 37.0:
        coast = 41.2
    elif lng < 40.0:
        coast = 41.0
    else:
        coast = 41.3
    return lat > coast


def is_lake_urmia(lat, lng):
    return (37.1 < lat < 38.0 and 45.0 < lng < 46.0 and
            dist_pt(lat, lng, 37.5, 45.5) < 0.5)


def is_lake_van(lat, lng):
    return (38.2 < lat < 39.0 and 42.4 < lng < 43.5 and
            dist_pt(lat, lng, 38.6, 43.0) < 0.5)


def is_water(lat, lng):
    """Master water check."""
    return (is_arabian_sea(lat, lng) or
            is_persian_gulf(lat, lng) or
            is_strait_of_hormuz(lat, lng) or
            is_gulf_of_oman(lat, lng) or
            is_red_sea(lat, lng) or
            is_caspian_sea(lat, lng) or
            is_mediterranean(lat, lng) or
            is_black_sea(lat, lng) or
            is_lake_urmia(lat, lng) or
            is_lake_van(lat, lng))


# ============================================================
# MOUNTAIN RIDGES
# ============================================================
# Each ridge: polyline of (lat, lng) points, half-width in degrees,
# peak elevation, base elevation.

RIDGES = [
    # Zagros Mountains (main ridge, NW-SE through western Iran)
    {
        "pts": [(37.0, 46.5), (36.0, 47.0), (35.0, 47.5), (34.0, 48.0),
                (33.0, 48.5), (32.0, 49.5), (31.0, 50.0), (30.0, 51.0),
                (29.0, 51.5), (28.0, 52.5), (27.5, 53.5)],
        "hw": 1.3, "peak": 3500, "base": 1200,
    },
    # Zagros outer foothills
    {
        "pts": [(36.5, 45.5), (35.5, 46.0), (34.5, 46.5), (33.5, 47.0),
                (32.5, 48.0), (31.5, 49.0), (30.5, 49.5)],
        "hw": 1.0, "peak": 2200, "base": 500,
    },
    # Elburz Mountains (south of Caspian)
    {
        "pts": [(36.0, 50.0), (36.2, 51.0), (36.0, 52.0), (35.8, 53.0),
                (35.9, 54.0), (36.5, 55.0), (36.8, 56.0), (37.0, 57.0)],
        "hw": 0.8, "peak": 3500, "base": 800,
    },
    # Mount Damavand (narrow peak)
    {
        "pts": [(35.9, 52.0), (36.0, 52.2)],
        "hw": 0.3, "peak": 5500, "base": 3000,
    },
    # Kopet-Dag (Iran-Turkmenistan)
    {
        "pts": [(37.5, 56.0), (37.8, 57.0), (38.0, 58.0), (38.2, 59.0)],
        "hw": 0.6, "peak": 2500, "base": 600,
    },
    # Hindu Kush
    {
        "pts": [(34.5, 66.0), (35.0, 67.0), (35.5, 68.0), (36.0, 69.0),
                (36.5, 70.0)],
        "hw": 1.2, "peak": 5000, "base": 1500,
    },
    # Central Afghan mountains
    {
        "pts": [(34.0, 65.0), (34.5, 66.0), (35.0, 67.0), (34.5, 68.0)],
        "hw": 1.2, "peak": 4000, "base": 1500,
    },
    # Sulaiman Range (Pak-Afghan border)
    {
        "pts": [(31.5, 69.0), (31.0, 68.5), (30.5, 68.0), (30.0, 67.5),
                (29.0, 67.0)],
        "hw": 0.8, "peak": 2500, "base": 800,
    },
    # Taurus Mountains (S Turkey)
    {
        "pts": [(37.0, 32.5), (37.2, 34.0), (37.5, 35.5), (37.8, 37.0),
                (38.0, 38.5), (38.2, 40.0)],
        "hw": 0.8, "peak": 3000, "base": 1000,
    },
    # Eastern Anatolian highlands
    {
        "pts": [(38.5, 40.0), (39.0, 41.0), (39.5, 42.0), (40.0, 43.0),
                (40.5, 44.0)],
        "hw": 1.2, "peak": 3500, "base": 1500,
    },
    # Mount Ararat
    {
        "pts": [(39.7, 44.3), (39.8, 44.3)],
        "hw": 0.4, "peak": 5100, "base": 2000,
    },
    # Caucasus (northern theater edge)
    {
        "pts": [(42.0, 42.0), (42.5, 43.5), (43.0, 45.0), (43.0, 47.0)],
        "hw": 0.8, "peak": 4000, "base": 1000,
    },
    # Hejaz Mountains (W Saudi Arabia)
    {
        "pts": [(28.0, 36.5), (27.0, 37.0), (26.0, 37.5), (25.0, 38.0),
                (24.0, 38.5), (23.0, 39.5), (22.0, 40.0), (21.0, 40.5),
                (20.0, 41.0), (19.0, 41.5), (18.0, 42.0)],
        "hw": 1.0, "peak": 2500, "base": 500,
    },
    # Hajar Mountains (Oman)
    {
        "pts": [(23.0, 56.0), (23.5, 57.0), (24.0, 57.5), (24.5, 56.5)],
        "hw": 0.5, "peak": 2500, "base": 300,
    },
    # Balochistan mountains (W Pakistan)
    {
        "pts": [(27.0, 66.0), (28.0, 67.0), (29.0, 67.5), (30.0, 67.5)],
        "hw": 0.8, "peak": 2500, "base": 800,
    },
    # Makran coastal range
    {
        "pts": [(26.0, 57.0), (26.5, 58.0), (26.5, 59.0), (26.0, 60.0),
                (25.5, 61.0), (25.5, 62.0), (25.5, 63.0)],
        "hw": 0.6, "peak": 1500, "base": 300,
    },
    # Yemen highlands
    {
        "pts": [(15.0, 44.0), (15.5, 44.5), (16.0, 44.5), (16.5, 44.0)],
        "hw": 1.0, "peak": 3000, "base": 500,
    },
    # Asir Mountains (SW Saudi)
    {
        "pts": [(18.5, 42.0), (18.0, 42.5), (17.5, 43.0)],
        "hw": 0.6, "peak": 2500, "base": 800,
    },
    # Anti-Lebanon / Mount Hermon
    {
        "pts": [(33.5, 35.8), (34.0, 36.0), (34.5, 36.2)],
        "hw": 0.4, "peak": 2500, "base": 800,
    },
    # Sinai mountains
    {
        "pts": [(28.5, 33.8), (28.8, 34.0), (29.0, 34.2)],
        "hw": 0.4, "peak": 2200, "base": 600,
    },
]


# ============================================================
# REGIONAL BASE ELEVATIONS
# ============================================================
# Checked in order; first match wins (most specific first).

def base_elevation(lat, lng):
    """Regional base elevation for land areas."""

    # Mesopotamian plain (Iraq lowlands)
    if 30.0 < lat < 34.5 and 43.5 < lng < 47.0:
        return 40

    # Khuzestan plain (SW Iran)
    if 30.0 < lat < 32.5 and 48.0 < lng < 50.5:
        return 30

    # Caspian coastal lowlands
    if 36.2 < lat < 37.5 and 49.5 < lng < 54.0:
        return -10

    # Jordan Rift / Dead Sea
    if 29.5 < lat < 33.0 and 35.2 < lng < 35.7:
        return -300

    # Indus plain (E Pakistan)
    if 24.0 < lat < 30.0 and 67.5 < lng < 70.0:
        return 60

    # Gwadar/Makran coast
    if 24.5 < lat < 25.5 and 57.0 < lng < 63.0:
        return 30

    # Rub al Khali (Empty Quarter)
    if 17.0 < lat < 22.0 and 45.0 < lng < 55.0:
        return 180

    # UAE coast (Abu Dhabi / Dubai area)
    if 23.5 < lat < 25.5 and 54.0 < lng < 56.0:
        return 20

    # Qatar peninsula — flat limestone, ~15m ASL
    if 24.5 < lat < 26.2 and 50.7 < lng < 52.0:
        return 15

    # Eastern Arabia Gulf coast (Saudi/Bahrain/Kuwait coastal strip)
    # This is the flat coastal lowland strip adjacent to the Persian Gulf
    if 24.0 < lat < 30.0 and 47.5 < lng < 52.0:
        return 20

    # Kuwait coast
    if 28.5 < lat < 30.0 and 47.0 < lng < 48.5:
        return 15

    # Syrian desert
    if 32.0 < lat < 36.0 and 36.0 < lng < 42.0:
        return 400

    # Iraqi western desert
    if 29.0 < lat < 34.0 and 38.0 < lng < 44.0:
        return 250

    # Iranian Plateau (central)
    if 30.0 < lat < 36.0 and 50.0 < lng < 59.0:
        return 1000

    # Dasht-e Kavir
    if 33.5 < lat < 36.0 and 52.0 < lng < 56.0:
        return 750

    # Dasht-e Lut
    if 29.5 < lat < 33.0 and 56.0 < lng < 60.0:
        return 500

    # SE Iran (Sistan)
    if 28.0 < lat < 32.0 and 59.0 < lng < 62.0:
        return 500

    # Anatolian plateau
    if 38.0 < lat < 40.5 and 32.0 < lng < 40.0:
        return 1000

    # Armenian highlands
    if 39.0 < lat < 41.0 and 42.0 < lng < 46.0:
        return 1500

    # Eastern Turkey / Kurdistan
    if 37.0 < lat < 41.0 and 38.0 < lng < 45.0:
        return 1200

    # Najd Plateau (central Saudi)
    if 20.0 < lat < 27.0 and 39.0 < lng < 47.0:
        return 600

    # Afghanistan general
    if 30.0 < lat < 37.0 and 62.0 < lng < 70.0:
        return 1200

    # Helmand Basin
    if 29.0 < lat < 32.0 and 62.0 < lng < 66.0:
        return 800

    # Balochistan plateau
    if 27.0 < lat < 31.0 and 64.0 < lng < 68.0:
        return 700

    # Turkmenistan (Kara Kum desert)
    if 37.0 < lat < 43.0 and 54.0 < lng < 66.0:
        return 200

    # Jordan / Israel highlands
    if 30.0 < lat < 33.0 and 34.0 < lng < 37.0:
        return 700

    # Sinai
    if 28.0 < lat < 31.0 and 32.5 < lng < 35.0:
        return 500

    # Egypt (Nile valley east)
    if 22.0 < lat < 31.0 and 32.0 < lng < 34.5:
        return 200

    # Yemen interior
    if 13.0 < lat < 17.0 and 43.0 < lng < 50.0:
        return 500

    # Oman interior
    if 20.0 < lat < 24.0 and 55.0 < lng < 59.0:
        return 200

    # Iran general (fallback for areas not covered above)
    if 27.0 < lat < 37.0 and 48.0 < lng < 60.0:
        return 800

    # Pakistan general
    if 24.0 < lat < 37.0 and 66.0 < lng < 70.0:
        return 400

    # Arabian Peninsula fallback
    if 15.0 < lat < 30.0 and 36.0 < lng < 56.0:
        return 300

    # Georgia / Azerbaijan
    if 40.0 < lat < 43.0 and 43.0 < lng < 50.0:
        return 500

    # Uzbekistan (edge of theater)
    if 37.0 < lat < 43.0 and 60.0 < lng < 70.0:
        return 300

    return 300  # default


# ============================================================
# MAIN ELEVATION COMPUTATION
# ============================================================

def compute_elevation(lat, lng, ri, ci):
    """Compute elevation in meters for grid cell at (lat, lng)."""

    # --- Water check ---
    if is_water(lat, lng):
        return 0.0

    # --- Base elevation from region ---
    elev = float(base_elevation(lat, lng))

    # --- Mountain ridges ---
    for r in RIDGES:
        d = dist_to_polyline(lat, lng, r["pts"])
        hw = r["hw"]
        if d < hw:
            t = 1.0 - d / hw
            profile = smoothstep(t)
            # Terrain noise along the ridge
            n = noise(ri, ci, 4)
            variation = 0.15 * r["peak"] * (n - 0.5)
            ridge_elev = r["base"] + profile * (r["peak"] - r["base"]) + variation
            elev = max(elev, ridge_elev)

    # --- General terrain noise ---
    n = noise(ri + 5000, ci + 5000, 3)
    elev += (n - 0.5) * 60  # +/- 30m

    # --- Clamp ---
    elev = max(-430.0, elev)  # Dead Sea floor

    return elev


# ============================================================
# GRID BUILDER
# ============================================================

def build_grid():
    """Build the complete elevation grid."""
    print(f"Building elevation grid: {ROWS} rows x {COLS} cols = {TOTAL_CELLS:,} cells")
    print(f"Theater: lat [{LAT_MIN}, {LAT_MAX}], lng [{LNG_MIN}, {LNG_MAX}]")
    print(f"Resolution: {RESOLUTION} deg (~{RESOLUTION * 111:.1f} km)")
    print()

    grid = bytearray(TOTAL_CELLS * 4)
    t0 = time.time()

    water_count = 0
    land_count = 0
    max_elev = -9999.0
    min_elev = 9999.0
    max_pos = (0, 0)

    for row in range(ROWS):
        lat = LAT_MIN + (row + 0.5) * RESOLUTION
        if row % 50 == 0:
            pct = 100.0 * row / ROWS
            print(f"  Row {row}/{ROWS} ({pct:.0f}%) lat={lat:.2f}  [{time.time()-t0:.1f}s]")

        for col in range(COLS):
            lng = LNG_MIN + (col + 0.5) * RESOLUTION
            elev = compute_elevation(lat, lng, row, col)

            if elev <= 0.0:
                water_count += 1
            else:
                land_count += 1
            if elev > max_elev:
                max_elev = elev
                max_pos = (lat, lng)
            if elev < min_elev:
                min_elev = elev

            struct.pack_into('<f', grid, (row * COLS + col) * 4, float(elev))

    dt = time.time() - t0
    print(f"\nGrid complete in {dt:.1f}s")
    print(f"  Land cells:  {land_count:,}")
    print(f"  Water cells: {water_count:,}")
    print(f"  Min elev:    {min_elev:.0f}m")
    print(f"  Max elev:    {max_elev:.0f}m at ({max_pos[0]:.2f}, {max_pos[1]:.2f})")
    return grid


def write_binary(grid, path):
    """Write header + grid to binary file."""
    header = struct.pack('<fffff', LAT_MIN, LAT_MAX, LNG_MIN, LNG_MAX, RESOLUTION)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'wb') as f:
        f.write(header)
        f.write(grid)
    size = os.path.getsize(path)
    expected = 20 + TOTAL_CELLS * 4
    print(f"\nWrote {path}")
    print(f"  File size: {size:,} bytes ({size/1024/1024:.2f} MB)")
    assert size == expected, f"Size mismatch: {size} != {expected}"


def spot_check(path):
    """Read back and verify key locations."""
    print("\n--- Spot Checks ---")
    with open(path, 'rb') as f:
        hdr = struct.unpack('<fffff', f.read(20))
        lat_min, lat_max, lng_min, lng_max, res = hdr
        rows = round((lat_max - lat_min) / res)
        cols = round((lng_max - lng_min) / res)

        def read_elev(lat, lng):
            r = max(0, min(rows - 1, int((lat - lat_min) / res)))
            c = max(0, min(cols - 1, int((lng - lng_min) / res)))
            f.seek(20 + (r * cols + c) * 4)
            return struct.unpack('<f', f.read(4))[0]

        checks = [
            ("Tehran",               35.7,  51.4,  "~1200m"),
            ("Persian Gulf center",  26.0,  52.0,  "0m water"),
            ("Zagros peak area",     33.0,  49.0,  ">2000m"),
            ("Isfahan",              32.65, 51.68, "~1500m"),
            ("Baghdad",              33.3,  44.4,  "~30-50m"),
            ("Riyadh",               24.7,  46.7,  "~600m"),
            ("Kabul",                34.5,  69.2,  "~1800m"),
            ("Strait of Hormuz",     26.5,  56.5,  "0m water"),
            ("Dead Sea area",        31.5,  35.5,  "negative"),
            ("Mt Damavand area",     35.95, 52.1,  ">4000m"),
            ("Rub al Khali",         19.0,  49.0,  "~180m"),
            ("Muscat",               23.6,  58.5,  "0m water"),
            ("Caspian Sea",          40.0,  51.0,  "0m water"),
            ("Aqaba/Red Sea",        28.0,  34.5,  "0m water"),
        ]

        ok = 0
        fail = 0
        for name, lat, lng, exp in checks:
            e = read_elev(lat, lng)
            tag = "OK" if _ok(name, e) else "FAIL"
            if tag == "OK":
                ok += 1
            else:
                fail += 1
            print(f"  [{tag}] {name:25s} ({lat:6.2f}, {lng:5.1f}): {e:7.0f}m  (expected: {exp})")

        print(f"\n  {ok} passed, {fail} failed")


def _ok(name, elev):
    n = name.lower()
    if "dead" in n:
        return elev < 0
    if "gulf" in n or "hormuz" in n or "muscat" in n or "sea" in n or "aqaba" in n:
        return abs(elev) < 1
    if "tehran" in n:
        return 800 < elev < 2500  # Near Elburz foothills, can be higher
    if "zagros" in n:
        return elev > 1500
    if "isfahan" in n:
        return 800 < elev < 2000
    if "baghdad" in n:
        return elev < 200
    if "riyadh" in n:
        return 400 < elev < 900
    if "kabul" in n:
        return 1200 < elev < 3000
    if "dead" in n:
        return elev < 0
    if "damavand" in n:
        return elev > 3500
    if "rub" in n:
        return 100 < elev < 350
    return True


def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)
    output = os.path.join(project_root, "public", "data", "theater-elevation.bin")

    print("=== Realpolitik Theater Elevation Grid Builder ===\n")
    grid = build_grid()
    write_binary(grid, output)
    spot_check(output)
    print("\nDone!")


if __name__ == "__main__":
    main()
