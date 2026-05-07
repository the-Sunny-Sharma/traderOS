import pytest
from decimal import Decimal
from datetime import date

from models.trade import Trade
from calculators.turnover_calculator import TurnoverCalculator
from calculators.tax_engine import TaxEngine


def make_trade(segment, pnl, sell_value=None, premium=None, qty=1):
    return Trade(
        segment=segment,
        symbol='TEST',
        trade_date=date.today(),
        buy_price=Decimal('100'),
        sell_price=Decimal('100') + Decimal(str(pnl)) / qty,
        quantity=qty,
        pnl=Decimal(str(pnl)),
        sell_value=Decimal(str(sell_value or abs(pnl))),
        premium_received=Decimal(str(premium or 0)),
        broker='test',
    )


class TestTurnoverCalculator:

    def setup_method(self):
        self.calc = TurnoverCalculator()

    def test_futures_turnover_is_absolute_pnl(self):
        trades = [
            make_trade('fno_futures', pnl=10_000),
            make_trade('fno_futures', pnl=-8_000),  # loss
        ]
        result = self.calc.calculate(trades)
        # 10000 + 8000 = 18000 (absolute, loss counts positively)
        assert result.fno_turnover == Decimal('18000')
        assert result.net_fno_pnl == Decimal('2000')  # signed

    def test_options_turnover_includes_premium(self):
        trades = [
            make_trade('fno_options', pnl=5_000, premium=20_000),
        ]
        result = self.calc.calculate(trades)
        # Options: premium (20000) + abs(pnl) (5000) = 25000
        assert result.options_turnover == Decimal('25000')
        assert result.fno_turnover == Decimal('25000')

    def test_intraday_turnover_is_absolute_pnl(self):
        trades = [
            make_trade('intraday', pnl=3_000),
            make_trade('intraday', pnl=-1_500),
        ]
        result = self.calc.calculate(trades)
        assert result.intraday_turnover == Decimal('4500')

    def test_delivery_turnover_is_sell_value(self):
        trades = [
            make_trade('delivery', pnl=50_000, sell_value=5_00_000),
        ]
        result = self.calc.calculate(trades)
        # Delivery: full sell value, not just P&L
        assert result.delivery_turnover == Decimal('500000')

    def test_mixed_portfolio(self):
        trades = [
            make_trade('fno_futures', pnl=10_000),
            make_trade('fno_options', pnl=-3_000, premium=15_000),
            make_trade('intraday', pnl=2_000),
            make_trade('delivery', pnl=25_000, sell_value=2_00_000),
        ]
        result = self.calc.calculate(trades)
        assert result.fno_turnover == Decimal('28000')   # 10000 + 15000+3000
        assert result.intraday_turnover == Decimal('2000')
        assert result.delivery_turnover == Decimal('200000')
        assert result.total_trades == 4

    def test_speculative_turnover_excludes_delivery(self):
        trades = [
            make_trade('fno_futures', pnl=5_000),
            make_trade('delivery', pnl=1_00_000, sell_value=10_00_000),
        ]
        result = self.calc.calculate(trades)
        # Audit threshold uses only F&O + intraday
        assert result.total_speculative_turnover == Decimal('5000')


class TestTaxEngine:

    def setup_method(self):
        self.engine = TaxEngine()
        self.calc = TurnoverCalculator()

    def _assess(self, trades, **kwargs):
        turnover = self.calc.calculate(trades)
        return self.engine.assess(turnover, **kwargs)

    def test_audit_required_above_10_crore(self):
        # Create a trade with turnover > ₹10 crore
        big_trade = make_trade('fno_futures', pnl=11_00_00_000)
        summary = self._assess([big_trade])
        assert summary.audit_required is True
        assert '10 crore' in summary.audit_reason

    def test_audit_required_on_fno_loss(self):
        trades = [make_trade('fno_futures', pnl=-50_000)]
        summary = self._assess(trades)
        assert summary.audit_required is True
        assert 'loss' in summary.audit_reason.lower()

    def test_no_audit_profitable_below_threshold(self):
        trades = [make_trade('fno_futures', pnl=50_000)]
        summary = self._assess(trades)
        assert summary.audit_required is False

    def test_itr3_for_fno_trader(self):
        trades = [make_trade('fno_futures', pnl=10_000)]
        summary = self._assess(trades)
        assert summary.itr_form == 'ITR-3'

    def test_itr3_for_intraday_trader(self):
        trades = [make_trade('intraday', pnl=5_000)]
        summary = self._assess(trades)
        assert summary.itr_form == 'ITR-3'

    def test_itr2_for_delivery_only(self):
        trades = [make_trade('delivery', pnl=50_000, sell_value=5_00_000)]
        summary = self._assess(trades)
        assert summary.itr_form == 'ITR-2'

    def test_advance_tax_schedule(self):
        # Create enough income to generate > ₹10,000 tax
        trades = [make_trade('fno_futures', pnl=10_00_000)]
        summary = self._assess(trades)
        assert summary.advance_tax_q1 > Decimal('0')
        # Q2 should be 3x Q1 (45% vs 15%)
        assert summary.advance_tax_q2 == (summary.advance_tax_q1 * 3).quantize(
            Decimal('0.01')
        )
        assert summary.advance_tax_q4 == summary.estimated_total_tax

    def test_no_advance_tax_below_threshold(self):
        # Very small profit — tax will be < ₹10,000
        trades = [make_trade('fno_futures', pnl=500)]
        summary = self._assess(trades)
        assert summary.advance_tax_q1 == Decimal('0')
        assert summary.advance_tax_q4 == Decimal('0')