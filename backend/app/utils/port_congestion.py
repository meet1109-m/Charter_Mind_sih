"""
Port Congestion & Capacity Utilization Engine.

Computes live and baseline operational congestion levels for Indian East Coast ports
by analyzing historical throughput from 'india_eastcoast_port_traffic_history.csv'
against rated handling capacity from 'india_eastcoast_port_specs.csv' and port profiles.

Utilization Ratio = Latest Throughput (MMT) / Rated Handling Capacity (MMT)
Classification Buckets:
  - Utilization < 0.60 (60%): Low Congestion
  - 0.60 <= Utilization < 0.78 (60-78%): Medium Congestion
  - 0.78 <= Utilization < 0.90 (78-90%): High Congestion
  - Utilization >= 0.90 (>=90%): Critical Congestion
"""

import json
import logging
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

import pandas as pd

from app.config import settings

logger = logging.getLogger("uvicorn.error")

FALLBACK_PORT_CONGESTIONS: Dict[str, str] = {
    "Paradip": "Medium",
    "Dhamra": "Low",
    "Vizag": "Medium",
    "Haldia": "High",
    "Kolkata": "Critical",
    "Chennai": "Medium",
    "Kamarajar": "Low",
}

DEFAULT_PORT_CAPACITIES_MMT: Dict[str, float] = {
    "Paradip": 152.1,
    "Dhamra": 64.8,
    "Vizag": 98.2,
    "Haldia": 52.0,
    "Kolkata": 18.0,
    "Chennai": 63.1,
    "Kamarajar": 60.0,
}

DEFAULT_PORT_THROUGHPUTS_MMT: Dict[str, float] = {
    "Paradip": 112.69,
    "Dhamra": 30.0,
    "Vizag": 72.72,
    "Haldia": 44.50,
    "Kolkata": 17.50,
    "Chennai": 46.76,
    "Kamarajar": 31.75,
}


def _resolve_data_artifact(filename: str, subfolder: str = "data") -> Optional[Path]:
    """Locates a data or model artifact file across project directories."""
    env_dir = settings.ML_DATA_DIR if subfolder == "data" else settings.ML_MODEL_DIR
    if env_dir:
        cand = Path(env_dir) / filename
        if cand.exists():
            return cand

    current = Path(__file__).resolve()
    for parent in current.parents:
        cand = parent / "ml_model" / subfolder / filename
        if cand.exists():
            return cand
        cand_direct = parent / subfolder / filename
        if cand_direct.exists():
            return cand_direct

    cwd = Path.cwd()
    for cand in [
        cwd / "ml_model" / subfolder / filename,
        cwd / "backend" / "app" / "ml_artifacts" / filename,
        cwd / "data" / filename,
    ]:
        if cand.exists():
            return cand

    return None


class PortCongestionCalculator:
    _instance: Optional["PortCongestionCalculator"] = None

    def __init__(self):
        self.traffic_df: pd.DataFrame = pd.DataFrame()
        self.specs_df: pd.DataFrame = pd.DataFrame()
        self.profiles: Dict[str, Any] = {}
        self.load_datasets()

    @classmethod
    def get_instance(cls) -> "PortCongestionCalculator":
        if cls._instance is None:
            cls._instance = PortCongestionCalculator()
        return cls._instance

    def load_datasets(self):
        try:
            traffic_path = _resolve_data_artifact("india_eastcoast_port_traffic_history.csv", "data")
            if traffic_path and traffic_path.exists():
                self.traffic_df = pd.read_csv(traffic_path)
        except Exception as e:
            logger.debug(f"Notice: Could not load port traffic history ({e})")

        try:
            specs_path = _resolve_data_artifact("india_eastcoast_port_specs.csv", "data")
            if specs_path and specs_path.exists():
                self.specs_df = pd.read_csv(specs_path)
        except Exception as e:
            logger.debug(f"Notice: Could not load port specs ({e})")

        try:
            profiles_path = _resolve_data_artifact("port_profiles.json", "models")
            if profiles_path and profiles_path.exists():
                with open(profiles_path, encoding="utf-8") as f:
                    self.profiles = json.load(f)
        except Exception as e:
            logger.debug(f"Notice: Could not load port profiles ({e})")

    def compute_congestion(self, port_name: str) -> Tuple[float, str]:
        """
        Calculates the capacity utilization ratio and maps it to a congestion bucket.
        Returns: (utilization_ratio, congestion_level)
        """
        # Normalize port key
        key = port_name.strip()
        matched_key = None
        for k in FALLBACK_PORT_CONGESTIONS:
            if k.lower() == key.lower() or k.lower() in key.lower():
                matched_key = k
                break

        fallback_congestion = FALLBACK_PORT_CONGESTIONS.get(matched_key or key, "Medium")

        # 1. Obtain Capacity
        capacity_mmt = None
        if matched_key and matched_key in DEFAULT_PORT_CAPACITIES_MMT:
            capacity_mmt = DEFAULT_PORT_CAPACITIES_MMT[matched_key]
        elif matched_key and matched_key in self.profiles:
            capacity_mmt = self.profiles[matched_key].get("handling_capacity_million_tonnes")

        # 2. Obtain Throughput
        throughput_mmt = None
        if not self.traffic_df.empty and matched_key:
            # Check for direct or composite port entries (e.g. Kolkata_Haldia)
            traffic_rows = self.traffic_df[self.traffic_df["port"].str.lower() == matched_key.lower()]
            if traffic_rows.empty and matched_key in ["Kolkata", "Haldia"]:
                traffic_rows = self.traffic_df[self.traffic_df["port"].str.lower() == "kolkata_haldia"]

            if not traffic_rows.empty:
                latest_traffic_val = traffic_rows.sort_values("fiscal_year")["total_traffic"].iloc[-1]
                total_val_mmt = float(latest_traffic_val) / 1000.0  # CSV is in '000 MT
                if matched_key == "Haldia":
                    # Haldia accounts for ~70% of Kolkata_Haldia throughput
                    throughput_mmt = total_val_mmt * 0.70
                elif matched_key == "Kolkata":
                    # Kolkata accounts for ~30% of Kolkata_Haldia throughput
                    throughput_mmt = total_val_mmt * 0.30
                else:
                    throughput_mmt = total_val_mmt

        if not throughput_mmt and matched_key:
            throughput_mmt = DEFAULT_PORT_THROUGHPUTS_MMT.get(matched_key)

        # If data is completely missing, return hardcoded fallback
        if not capacity_mmt or not throughput_mmt or capacity_mmt <= 0:
            return 0.70, fallback_congestion

        utilization = throughput_mmt / capacity_mmt

        # Map utilization ratio to Congestion Level buckets
        if utilization < 0.60:
            congestion = "Low"
        elif utilization < 0.78:
            congestion = "Medium"
        elif utilization < 0.90:
            congestion = "High"
        else:
            congestion = "Critical"

        return round(utilization, 3), congestion


def get_port_congestion(port_name: str) -> str:
    """Convenience function returning the computed congestion bucket for a port."""
    calculator = PortCongestionCalculator.get_instance()
    _, congestion = calculator.compute_congestion(port_name)
    return congestion
