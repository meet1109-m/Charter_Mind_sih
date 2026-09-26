import unittest
from unittest.mock import patch

from app.schemas.cargo import CargoRequestBase
from app.schemas.port import PortSpec
from app.schemas.vessel import VesselSpec
from app.schemas.voyage import SimulatorOverrides
from app.services.forecast_engine import MLModelManager
from app.services.idle_predictor import predict_idle_time
from app.services.risk_engine import calculate_risk_scores
from app.utils.constants import PORT_SPECS, VESSEL_SPECS


class TestBackendRegressions(unittest.TestCase):
    def setUp(self):
        self.cargo = CargoRequestBase(
            cargo_type="Coal",
            cargo_quantity_mt=75000,
            origin_country="Indonesia",
            destination_port="Paradip",
            laycan_start="2026-10-01",
            laycan_end="2026-10-10",
        )
        self.vessel = VESSEL_SPECS.get("panamax", list(VESSEL_SPECS.values())[0])
        self.port_paradip = PORT_SPECS.get("Paradip", list(PORT_SPECS.values())[0])
        self.port_kolkata = PORT_SPECS.get("Kolkata", list(PORT_SPECS.values())[-1])

    def test_predict_idle_time_traffic_capacity_scenarios(self):
        """
        Verify that predict_idle_time() yields distinct, statistically calibrated
        idle waiting times and demurrage exposure under different port traffic/capacity scenarios.
        """
        # Scenario A: High capacity port (Paradip, ~18 berths) with Low congestion
        idle_low = predict_idle_time(
            port=self.port_paradip,
            vessel=self.vessel,
            weather="Normal",
            congestion="Low",
        )

        # Scenario B: High capacity port with Critical congestion
        idle_critical = predict_idle_time(
            port=self.port_paradip,
            vessel=self.vessel,
            weather="Normal",
            congestion="Critical",
        )

        # Scenario C: Constrained capacity port (Kolkata, ~3 berths) with High traffic
        idle_constrained = predict_idle_time(
            port=self.port_kolkata,
            vessel=self.vessel,
            weather="Normal",
            congestion="High",
        )

        # Assertions proving different results across scenarios
        self.assertNotEqual(
            idle_low.expected_idle_hours,
            idle_critical.expected_idle_hours,
            "Expected idle hours must differ between Low and Critical congestion scenarios",
        )
        self.assertGreater(
            idle_critical.expected_idle_hours,
            idle_low.expected_idle_hours,
            "Critical congestion must produce greater idle wait hours than Low congestion",
        )
        self.assertGreater(
            idle_critical.idle_cost_usd,
            idle_low.idle_cost_usd,
            "Idle cost must increase with congestion severity",
        )
        self.assertNotEqual(
            idle_critical.expected_idle_hours,
            idle_constrained.expected_idle_hours,
            "Different port capacities and baseline queues must yield distinct idle waiting hours",
        )

    def test_calculate_risk_scores_bdi_volatility_scenarios(self):
        """
        Verify that calculate_risk_scores() yields distinct market_risk scores
        under different BDI volatility and market regime scenarios.
        """
        manager = MLModelManager.get_instance()
        original_bdi = list(manager.historical_bdi)

        try:
            # Scenario A: Low volatility, calm market regime (historical BDI points steady at ~1,200)
            manager.historical_bdi = [1200.0, 1210.0, 1195.0, 1205.0, 1200.0, 1208.0]
            risk_low_vol = calculate_risk_scores(
                cargo=self.cargo,
                vessel=self.vessel,
                port=self.port_paradip,
                overrides=SimulatorOverrides(freight_rate_offset_percent=0.0),
            )

            # Scenario B: High volatility, turbulent market regime (BDI swinging violently from 1,000 to 5,500)
            manager.historical_bdi = [1000.0, 2800.0, 1400.0, 4200.0, 2100.0, 5500.0]
            risk_high_vol = calculate_risk_scores(
                cargo=self.cargo,
                vessel=self.vessel,
                port=self.port_paradip,
                overrides=SimulatorOverrides(freight_rate_offset_percent=25.0),
            )

            # Assertions proving different market_risk scores
            self.assertNotEqual(
                risk_low_vol.market_risk,
                risk_high_vol.market_risk,
                "Market risk must differ between low and high BDI volatility scenarios",
            )
            self.assertGreater(
                risk_high_vol.market_risk,
                risk_low_vol.market_risk,
                "High BDI volatility & market shock must yield a higher parametric VaR/CVaR market risk score",
            )
            self.assertNotEqual(
                risk_low_vol.overall_score,
                risk_high_vol.overall_score,
                "Overall composite risk score must reflect the change in market risk",
            )
        finally:
            # Restore original historical BDI series
            manager.historical_bdi = original_bdi

    def test_port_congestion_utilization_scenarios(self):
        """
        Verify that port congestion levels are dynamically computed from throughput
        and capacity utilization ratios rather than being hardcoded constants.
        """
        from app.utils.port_congestion import PortCongestionCalculator, get_port_congestion

        calc = PortCongestionCalculator.get_instance()
        util_dhamra, cong_dhamra = calc.compute_congestion("Dhamra")
        util_kolkata, cong_kolkata = calc.compute_congestion("Kolkata")
        util_haldia, cong_haldia = calc.compute_congestion("Haldia")

        # 1. Utilization ratios must be strictly different
        self.assertNotEqual(
            util_dhamra,
            util_kolkata,
            "Dhamra and Kolkata must have different capacity utilization ratios",
        )
        self.assertLess(
            util_dhamra,
            0.60,
            "Dhamra's deepwater high-capacity terminal should have <60% utilization",
        )
        self.assertGreaterEqual(
            util_kolkata,
            0.90,
            "Kolkata's riverine lock terminal should have >=90% capacity utilization",
        )

        # 2. Congestion bucket classifications must differ
        self.assertEqual(cong_dhamra, "Low")
        self.assertEqual(cong_kolkata, "Critical")
        self.assertNotEqual(
            cong_dhamra,
            cong_kolkata,
            "Ports with different utilization must be assigned different congestion buckets",
        )

        # 3. PORT_SPECS must reflect dynamically computed congestion
        self.assertEqual(PORT_SPECS["Dhamra"].congestion, "Low")
        self.assertEqual(PORT_SPECS["Kolkata"].congestion, "Critical")
        self.assertNotEqual(
            PORT_SPECS["Dhamra"].congestion,
            PORT_SPECS["Kolkata"].congestion,
            "PORT_SPECS must reflect dynamic congestion levels across ports",
        )

    def test_critical_risk_alert_creation_and_deduplication(self):
        """
        Verify that when a scenario produces a Critical risk score or >48h idle queue:
        1. An operational Alert is created for the user.
        2. Running the exact same scenario again does NOT duplicate the undismissed alert.
        """
        import asyncio
        import uuid
        from sqlalchemy import select
        from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
        from app.models.base import Base
        from app.models.alert import Alert
        from app.models.user import User
        from app.routers.alerts import check_and_create_operational_alerts
        from app.schemas.risk import RiskScoreResult

        async def _run_test():
            # Setup isolated SQLite in-memory test database
            engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
            async with engine.begin() as conn:
                await conn.run_sync(Base.metadata.create_all)

            session_factory = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)

            async with session_factory() as db:
                # Provision test user
                test_user = User(
                    id=uuid.uuid4(),
                    firebase_uid=f"test-uid-{uuid.uuid4().hex[:8]}",
                    email="risk-analyst@chartermind.test",
                    name="Risk Analyst",
                    role="charterer",
                )
                db.add(test_user)
                await db.commit()
                await db.refresh(test_user)

                # Simulated Critical Risk Scenario
                critical_risk = RiskScoreResult(
                    market_risk=88.5,
                    port_risk=82.0,
                    weather_risk=65.0,
                    vessel_risk=70.0,
                    commodity_risk=40.0,
                    overall_score=78.2,
                    bucket="Critical",
                    primary_driver="Market Risk",
                    summary_sentence="Overall risk is Critical (78.2/100) due to acute sanctions volatility.",
                )

                # 1. First execution: should create a new Alert
                alerts_1 = await check_and_create_operational_alerts(
                    db=db,
                    user_id=test_user.id,
                    risk_scores=critical_risk,
                    idle_hours=56.0,
                    port_name="Kolkata",
                )

                # Verify alerts created
                stmt = select(Alert).where(Alert.user_id == test_user.id)
                all_alerts = list((await db.execute(stmt)).scalars().all())
                
                # Should have created the Critical Risk alert and/or the >48h delay advisory
                self.assertGreaterEqual(len(all_alerts), 1)
                initial_count = len(all_alerts)

                # Verify properties of the created alert
                risk_alert = next((a for a in all_alerts if "Critical" in a.title), None)
                self.assertIsNotNone(risk_alert, "A Critical risk alert must be generated")
                self.assertEqual(risk_alert.type, "danger")
                self.assertTrue(risk_alert.action_required)
                self.assertFalse(risk_alert.is_dismissed)

                # 2. Second execution with identical condition: must NOT duplicate
                alerts_2 = await check_and_create_operational_alerts(
                    db=db,
                    user_id=test_user.id,
                    risk_scores=critical_risk,
                    idle_hours=56.0,
                    port_name="Kolkata",
                )

                stmt2 = select(Alert).where(Alert.user_id == test_user.id)
                all_alerts_after = list((await db.execute(stmt2)).scalars().all())
                
                self.assertEqual(
                    len(all_alerts_after),
                    initial_count,
                    "Re-running the same critical scenario must not duplicate active undismissed alerts",
                )

            await engine.dispose()

        asyncio.run(_run_test())

    def test_ml_risk_model_driven_scores_respond_to_inputs(self):
        """
        Verify that the ML-model-driven calculate_risk_scores() responds accurately
        to changed inputs including port_traffic_zscore, forecast_volatility_signal,
        and weather conditions.
        """
        # 1. Port Traffic Z-Score responsiveness
        low_traffic_overrides = SimulatorOverrides(port_traffic_zscore=-1.2)
        high_traffic_overrides = SimulatorOverrides(port_traffic_zscore=1.8)

        risk_low_traffic = calculate_risk_scores(
            cargo=self.cargo,
            vessel=self.vessel,
            port=self.port_paradip,
            overrides=low_traffic_overrides,
        )
        risk_high_traffic = calculate_risk_scores(
            cargo=self.cargo,
            vessel=self.vessel,
            port=self.port_paradip,
            overrides=high_traffic_overrides,
        )

        self.assertNotEqual(
            risk_low_traffic.port_risk,
            risk_high_traffic.port_risk,
            "Port risk score must respond dynamically to port_traffic_zscore changes",
        )
        self.assertGreater(
            risk_high_traffic.port_risk,
            risk_low_traffic.port_risk,
            "Higher port traffic Z-score must produce a higher port risk score",
        )
        self.assertGreater(
            risk_high_traffic.overall_score,
            risk_low_traffic.overall_score,
            "Higher port traffic must increase the model-predicted composite risk score",
        )

        # 2. Weather condition responsiveness
        risk_normal_weather = calculate_risk_scores(
            cargo=self.cargo,
            vessel=self.vessel,
            port=self.port_paradip,
            overrides=SimulatorOverrides(weather="Normal"),
        )
        risk_severe_weather = calculate_risk_scores(
            cargo=self.cargo,
            vessel=self.vessel,
            port=self.port_paradip,
            overrides=SimulatorOverrides(weather="Severe"),
        )

        self.assertGreater(
            risk_severe_weather.weather_risk,
            risk_normal_weather.weather_risk,
            "Severe weather condition must produce higher weather hazard risk score",
        )

        # 3. Market forecast volatility signal responsiveness
        risk_low_vol = calculate_risk_scores(
            cargo=self.cargo,
            vessel=self.vessel,
            port=self.port_paradip,
            overrides=SimulatorOverrides(forecast_volatility_signal=0.05),
        )
        risk_high_vol = calculate_risk_scores(
            cargo=self.cargo,
            vessel=self.vessel,
            port=self.port_paradip,
            overrides=SimulatorOverrides(forecast_volatility_signal=0.45),
        )

        self.assertGreater(
            risk_high_vol.market_risk,
            risk_low_vol.market_risk,
            "Higher forecast volatility signal must increase market risk score",
        )

        # 4. Confirm RiskScoreResult structure integrity
        self.assertIsInstance(risk_high_traffic.market_risk, float)
        self.assertIsInstance(risk_high_traffic.port_risk, float)
        self.assertIsInstance(risk_high_traffic.weather_risk, float)
        self.assertIsInstance(risk_high_traffic.vessel_risk, float)
        self.assertIsInstance(risk_high_traffic.commodity_risk, float)
        self.assertIn(risk_high_traffic.bucket, ["Low", "Medium", "High", "Critical"])
        self.assertTrue(len(risk_high_traffic.primary_driver) > 0)
        self.assertTrue(len(risk_high_traffic.summary_sentence) > 0)

    def test_vessel_scarcity_and_vintage_risk_from_registry(self):
        """
        Verify that vessel_risk is dynamically computed from vessel registry scarcity & fleet age,
        and that navigational/berth incompatibility forces vessel_risk=100.0.
        """
        capesize_vessel = VESSEL_SPECS["capesize"]
        supramax_vessel = VESSEL_SPECS["supramax"]

        # 1. Scarcity & fleet availability comparison at compatible deepwater port (Dhamra)
        port_dhamra = PORT_SPECS["Dhamra"]
        risk_capesize = calculate_risk_scores(
            cargo=self.cargo,
            vessel=capesize_vessel,
            port=port_dhamra,
        )
        risk_supramax = calculate_risk_scores(
            cargo=self.cargo,
            vessel=supramax_vessel,
            port=port_dhamra,
        )

        self.assertGreater(
            risk_capesize.vessel_risk,
            risk_supramax.vessel_risk,
            "Capesize (81 vessels in registry) must have higher scarcity risk than Supramax (159 vessels)",
        )

        # 2. Incompatible vessel at shallow riverine port (Capesize at Kolkata: max draft 8.5m vs 17.5m)
        risk_incompatible = calculate_risk_scores(
            cargo=self.cargo,
            vessel=capesize_vessel,
            port=self.port_kolkata,
        )

        self.assertEqual(
            risk_incompatible.vessel_risk,
            100.0,
            "Physical navigational non-compliance must force vessel_risk to 100.0",
        )
        self.assertEqual(
            risk_incompatible.primary_driver,
            "Vessel Risk",
            "Incompatible vessel must have Vessel Risk as dominant primary driver",
        )

    def test_route_freight_rate_model_forecast(self):
        """
        Verify that generate_forecast() utilizes the trained route_rate_model
        to reflect realistic route distance scaling and vessel economies of scale.
        """
        from app.services.forecast_engine import generate_forecast

        # 1. Forecast for short corridor (Indonesia -> Paradip)
        forecast_indonesia = generate_forecast(
            route="Indonesia -> Paradip",
            base_rate=7.50,
            horizon_days=30,
            vessel_class="Panamax",
            cargo_type="Coal",
        )

        # 2. Forecast for long corridor (Russia -> Paradip)
        forecast_russia = generate_forecast(
            route="Russia -> Paradip",
            base_rate=22.00,
            horizon_days=30,
            vessel_class="Panamax",
            cargo_type="Coal",
        )

        # 3. Forecast for Capesize vs Handysize on same route
        forecast_capesize = generate_forecast(
            route="Australia -> Paradip",
            base_rate=10.00,
            horizon_days=30,
            vessel_class="Capesize",
            cargo_type="Coal",
        )
        forecast_handysize = generate_forecast(
            route="Australia -> Paradip",
            base_rate=16.00,
            horizon_days=30,
            vessel_class="Handysize",
            cargo_type="Coal",
        )

        # Assertions verifying model predictions and schema
        self.assertEqual(len(forecast_indonesia.data_points), 31)
        self.assertEqual(len(forecast_russia.data_points), 31)
        self.assertGreater(
            forecast_russia.projected_rate_30d,
            forecast_indonesia.projected_rate_30d,
            "Longer corridor (Russia 6150nm) must have higher freight $/MT than Indonesia (2800nm)",
        )
        self.assertLess(
            forecast_capesize.projected_rate_30d,
            forecast_handysize.projected_rate_30d,
            "Capesize vessel must achieve lower $/MT freight rate than Handysize due to bulk economies of scale",
        )
        self.assertIn(forecast_indonesia.trend, ["Rising", "Falling", "Stable"])
        self.assertGreaterEqual(forecast_indonesia.confidence_score, 50.0)


if __name__ == "__main__":
    unittest.main()


