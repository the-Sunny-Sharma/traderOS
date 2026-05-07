from dataclasses import dataclass, field
from decimal import Decimal
from datetime import date
from typing import Optional


@dataclass
class Trade:
    """
    Internal normalised representation of a single trade.
    Every broker parser maps its raw data to this model.
    
    Segment values:
        'fno_futures'  - Futures contracts
        'fno_options'  - Options contracts  
        'intraday'     - Intraday equity (buy and sell same day)
        'delivery'     - Delivery equity (held overnight)
    """
    segment: str
    symbol: str
    trade_date: date
    buy_price: Decimal
    sell_price: Decimal
    quantity: int
    pnl: Decimal
    sell_value: Decimal
    is_squared: bool = True
    premium_received: Decimal = field(default_factory=lambda: Decimal('0'))
    broker: str = ''
    raw_segment: str = ''  # original segment string from broker file, for debugging

    def __post_init__(self):
        """Validate and coerce types after dataclass __init__."""
        # Ensure all monetary values are Decimal, not float
        # This is critical — float arithmetic loses precision with money
        if not isinstance(self.pnl, Decimal):
            self.pnl = Decimal(str(self.pnl))
        if not isinstance(self.buy_price, Decimal):
            self.buy_price = Decimal(str(self.buy_price))
        if not isinstance(self.sell_price, Decimal):
            self.sell_price = Decimal(str(self.sell_price))
        if not isinstance(self.sell_value, Decimal):
            self.sell_value = Decimal(str(self.sell_value))
        if not isinstance(self.premium_received, Decimal):
            self.premium_received = Decimal(str(self.premium_received))

        valid_segments = {'fno_futures', 'fno_options', 'intraday', 'delivery'}
        if self.segment not in valid_segments:
            raise ValueError(
                f"Invalid segment '{self.segment}'. "
                f"Must be one of: {valid_segments}"
            )