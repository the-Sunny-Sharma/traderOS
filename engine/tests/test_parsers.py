import pytest
from decimal import Decimal
from unittest.mock import patch, MagicMock
import pandas as pd
from datetime import date

from parsers.zerodha_parser import ZerodhaParser
from models.trade import Trade


class TestZerodhaParser:

    def setup_method(self):
        self.parser = ZerodhaParser()

    def test_broker_name(self):
        assert self.parser.broker_name() == 'zerodha'

    def test_sheet_name(self):
        assert self.parser.get_sheet_name() == 'Tradewise Exits'

    def test_classify_futures(self):
        row = pd.Series({
            'symbol': 'NIFTY24DECFUT',
            'raw_segment': 'NSE F&O',
            'trade_type': 'Normal'
        })
        assert self.parser.classify_segment(row) == 'fno_futures'

    def test_classify_call_option(self):
        row = pd.Series({
            'symbol': 'NIFTY24DEC24000CE',
            'raw_segment': 'NSE F&O',
            'trade_type': 'Normal'
        })
        assert self.parser.classify_segment(row) == 'fno_options'

    def test_classify_put_option(self):
        row = pd.Series({
            'symbol': 'BANKNIFTY24DEC47000PE',
            'raw_segment': 'NSE F&O',
            'trade_type': 'Normal'
        })
        assert self.parser.classify_segment(row) == 'fno_options'

    def test_classify_intraday(self):
        row = pd.Series({
            'symbol': 'RELIANCE',
            'raw_segment': 'NSE EQ',
            'trade_type': 'Intraday'
        })
        assert self.parser.classify_segment(row) == 'intraday'

    def test_classify_delivery(self):
        row = pd.Series({
            'symbol': 'TCS',
            'raw_segment': 'NSE EQ',
            'trade_type': 'Delivery'
        })
        assert self.parser.classify_segment(row) == 'delivery'

    def test_classify_unknown_raises(self):
        row = pd.Series({
            'symbol': 'UNKNOWN',
            'raw_segment': 'SOME UNKNOWN EXCHANGE',
            'trade_type': ''
        })
        with pytest.raises(ValueError, match="Cannot classify segment"):
            self.parser.classify_segment(row)

    def test_trade_decimal_coercion(self):
        """Ensure float values from pandas are coerced to Decimal."""
        trade = Trade(
            segment='fno_futures',
            symbol='NIFTY24DECFUT',
            trade_date=date.today(),
            buy_price=100.5,    # float — should be coerced
            sell_price=105.75,  # float — should be coerced
            quantity=50,
            pnl=262.5,          # float — should be coerced
            sell_value=5287.5,
            broker='zerodha'
        )
        assert isinstance(trade.pnl, Decimal)
        assert isinstance(trade.buy_price, Decimal)
        assert trade.pnl == Decimal('262.5')

    def test_trade_invalid_segment_raises(self):
        with pytest.raises(ValueError, match="Invalid segment"):
            Trade(
                segment='invalid_segment',
                symbol='TEST',
                trade_date=date.today(),
                buy_price=Decimal('100'),
                sell_price=Decimal('105'),
                quantity=1,
                pnl=Decimal('5'),
                sell_value=Decimal('105'),
            )