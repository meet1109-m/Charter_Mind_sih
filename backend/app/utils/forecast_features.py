"""
Time-Series Feature Engineering for Baltic Dry Index & Bunker Fuel Pricing.
Provides standardized FEATURE_COLUMNS and transformation utilities.
"""

from typing import List, Optional
import numpy as np
import pandas as pd

FEATURE_COLUMNS: List[str] = [
    "lag_1",
    "lag_2",
    "lag_3",
    "lag_6",
    "lag_12",
    "rolling_mean_3",
    "rolling_mean_6",
    "rolling_std_3",
    "rolling_std_6",
    "momentum_3",
    "pct_change_1",
    "bunker_lag_1",
    "bunker_lag_2",
    "bunker_rolling_mean_3",
    "bunker_rolling_mean_6",
    "bunker_pct_change_1",
    "month",
    "quarter",
    "sin_month",
    "cos_month",
]

TARGET_COLUMN = "Price"
