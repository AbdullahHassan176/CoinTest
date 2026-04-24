"""
ship_tracker.py — Real-time vessel tracking for the Strait of Hormuz.

Data source: aisstream.io (free WebSocket AIS feed — get key at aisstream.io)
Fallback:    Public links to MarineTraffic and VesselFinder if no API key.

AIS bounding box covers the full Strait of Hormuz and approaches:
  SW corner: 22.0°N, 54.0°E  (southern Gulf of Oman)
  NE corner: 27.5°N, 62.0°E  (eastern Persian Gulf)

Vessel type codes (ITU standard):
  70-79  Cargo ships
  80-89  Tankers
  35     Military
  60-69  Passenger
  30     Fishing
  90-99  Other / Reserved
"""

import asyncio
import json
import logging
import os
import time
from dataclasses import dataclass, field
from typing import Optional

import aiohttp

logger = logging.getLogger(__name__)

AISSTREAM_KEY: str = os.getenv("AISSTREAM_API_KEY", "")

# Bounding box: [SW lat/lon, NE lat/lon]
STRAIT_BBOX = [[22.0, 54.0], [27.5, 62.0]]

# How long to listen for AIS messages before closing
AIS_LISTEN_SECONDS: int = 45

# Public tracker links (always shown regardless of AIS key)
MARINETRAFFIC_URL = "https://www.marinetraffic.com/en/ais/home/centerx:57.0/centery:26.0/zoom:8"
VESSELFINDER_URL = "https://www.vesselfinder.com/?zoom=7&lat=25.5&lng=57.0"

# Ship type code → readable category
_TYPE_LABELS = {
    range(70, 80): "cargo",
    range(80, 90): "tanker",
    range(60, 70): "passenger",
    range(35, 36): "military",
    range(30, 31): "fishing",
}


@dataclass
class VesselSnapshot:
    """Summary of vessel traffic observed in the Strait bounding box."""
    total: int = 0
    tankers: int = 0
    cargo: int = 0
    military: int = 0
    passenger: int = 0
    other: int = 0
    sample_duration_s: int = AIS_LISTEN_SECONDS
    vessels: list[dict] = field(default_factory=list)
    error: Optional[str] = None


def _classify(ship_type: int) -> str:
    for type_range, label in _TYPE_LABELS.items():
        if ship_type in type_range:
            return label
    return "other"


async def get_strait_traffic() -> VesselSnapshot:
    """
    Connect to aisstream.io, collect vessel positions for AIS_LISTEN_SECONDS,
    and return a summary. Returns a VesselSnapshot with error set if unavailable.
    """
    if not AISSTREAM_KEY:
        return VesselSnapshot(
            error="No AISSTREAM_API_KEY set — see .env to enable live tracking"
        )

    snapshot = VesselSnapshot()
    seen_mmsi: dict[str, dict] = {}  # mmsi → latest position data

    try:
        async with aiohttp.ClientSession() as session:
            async with session.ws_connect(
                "wss://stream.aisstream.io/v0/stream",
                timeout=aiohttp.ClientTimeout(total=AIS_LISTEN_SECONDS + 10),
            ) as ws:

                subscribe_msg = {
                    "APIKey": AISSTREAM_KEY,
                    "BoundingBoxes": [STRAIT_BBOX],
                    "FilterMessageTypes": ["PositionReport", "ShipStaticData"],
                }
                await ws.send_str(json.dumps(subscribe_msg))
                logger.info("AIS stream connected — listening for %ds", AIS_LISTEN_SECONDS)

                deadline = time.monotonic() + AIS_LISTEN_SECONDS

                async for msg in ws:
                    if time.monotonic() > deadline:
                        break

                    if msg.type == aiohttp.WSMsgType.TEXT:
                        try:
                            data = json.loads(msg.data)
                            msg_type = data.get("MessageType", "")
                            mmsi = str(
                                data.get("MetaData", {}).get("MMSI", "")
                                or data.get("Message", {}).get("PositionReport", {}).get("UserID", "")
                            )
                            if not mmsi:
                                continue

                            if mmsi not in seen_mmsi:
                                seen_mmsi[mmsi] = {}

                            if msg_type == "ShipStaticData":
                                ship_data = data.get("Message", {}).get("ShipStaticData", {})
                                seen_mmsi[mmsi]["type"] = ship_data.get("Type", 0)
                                seen_mmsi[mmsi]["name"] = ship_data.get("Name", "").strip()

                            elif msg_type == "PositionReport":
                                pos = data.get("Message", {}).get("PositionReport", {})
                                seen_mmsi[mmsi]["sog"] = pos.get("Sog", 0)  # Speed over ground
                                seen_mmsi[mmsi]["lat"] = data.get("MetaData", {}).get("latitude")
                                seen_mmsi[mmsi]["lon"] = data.get("MetaData", {}).get("longitude")

                        except Exception as e:
                            logger.debug("AIS parse error: %s", e)

                    elif msg.type in (aiohttp.WSMsgType.ERROR, aiohttp.WSMsgType.CLOSED):
                        break

    except asyncio.TimeoutError:
        pass  # Expected — we hit the listen deadline
    except Exception as e:
        logger.warning("AIS stream error: %s", e)
        return VesselSnapshot(error=f"AIS stream unavailable: {e}")

    # Tally results
    snapshot.total = len(seen_mmsi)
    snapshot.vessels = list(seen_mmsi.values())

    for vessel in seen_mmsi.values():
        ship_type = vessel.get("type", 0)
        category = _classify(ship_type)
        if category == "tanker":
            snapshot.tankers += 1
        elif category == "cargo":
            snapshot.cargo += 1
        elif category == "military":
            snapshot.military += 1
        elif category == "passenger":
            snapshot.passenger += 1
        else:
            snapshot.other += 1

    logger.info(
        "AIS snapshot: %d vessels (tankers: %d, cargo: %d, military: %d)",
        snapshot.total, snapshot.tankers, snapshot.cargo, snapshot.military,
    )
    return snapshot


def format_traffic_block(snapshot: VesselSnapshot) -> str:
    """
    Format vessel data as a readable Telegram text block.
    """
    lines = []

    if snapshot.error:
        lines.append(f"Vessel tracking: data unavailable ({snapshot.error})")
    else:
        lines.append(
            f"Vessels detected in Strait bounding box ({snapshot.sample_duration_s}s sample): "
            f"{snapshot.total} total"
        )
        breakdown = []
        if snapshot.tankers:
            breakdown.append(f"{snapshot.tankers} tankers")
        if snapshot.cargo:
            breakdown.append(f"{snapshot.cargo} cargo")
        if snapshot.military:
            breakdown.append(f"{snapshot.military} military")
        if snapshot.passenger:
            breakdown.append(f"{snapshot.passenger} passenger")
        if snapshot.other:
            breakdown.append(f"{snapshot.other} other")
        if breakdown:
            lines.append("  " + " | ".join(breakdown))

    lines.append(
        f"Live map: [MarineTraffic]({MARINETRAFFIC_URL}) | [VesselFinder]({VESSELFINDER_URL})"
    )

    return "\n".join(lines)
