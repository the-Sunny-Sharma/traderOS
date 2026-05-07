from decimal import Decimal
from typing import List
from dataclasses import dataclass
from models.trade import Trade


@dataclass
class TurnoverResult:
    """
    Complete turnover breakdown per ICAI 8th Edition.
    All values in INR.
    """
    fno_turnover: Decimal          # abs(P&L) for futures + options premium
    intraday_turnover: Decimal     # abs(P&L) for intraday equity
    delivery_turnover: Decimal     # sell value for delivery equity

    net_fno_pnl: Decimal           # actual profit/loss from F&O (signed)
    net_intraday_pnl: Decimal      # actual profit/loss from intraday (signed)
    net_delivery_pnl: Decimal      # actual profit/loss from delivery (signed)

    futures_turnover: Decimal      # breakdown: futures only
    options_turnover: Decimal      # breakdown: options only

    total_trades: int
    fno_trade_count: int
    intraday_trade_count: int
    delivery_trade_count: int

    @property
    def total_speculative_turnover(self) -> Decimal:
        """F&O + intraday — what determines audit eligibility."""
        return self.fno_turnover + self.intraday_turnover

    @property
    def total_turnover(self) -> Decimal:
        return self.fno_turnover + self.intraday_turnover + self.delivery_turnover


class TurnoverCalculator:
    """
    Implements ICAI Guidance Note on Tax Audit (8th Edition, 2023)
    for computing turnover from F&O and equity trades.

    The rules:
        Futures turnover     = Σ |P&L per trade|
        Options turnover     = Σ (premium received on sell + |P&L per trade|)
        Intraday turnover    = Σ |P&L per trade|
        Delivery turnover    = Σ sell value (full sale consideration)
    """

    ZERO = Decimal('0')

    def calculate(self, trades: List[Trade]) -> TurnoverResult:
        futures_turnover   = self.ZERO
        options_turnover   = self.ZERO
        intraday_turnover  = self.ZERO
        delivery_turnover  = self.ZERO

        net_fno_pnl        = self.ZERO
        net_intraday_pnl   = self.ZERO
        net_delivery_pnl   = self.ZERO

        fno_count          = 0
        intraday_count     = 0
        delivery_count     = 0

        for trade in trades:
            pnl       = Decimal(str(trade.pnl))
            abs_pnl   = abs(pnl)
            sell_val  = Decimal(str(trade.sell_value))
            premium   = Decimal(str(trade.premium_received))

            if trade.segment == 'fno_futures':
                # ICAI 8th Ed: futures turnover = absolute P&L
                futures_turnover += abs_pnl
                net_fno_pnl      += pnl
                fno_count        += 1

            elif trade.segment == 'fno_options':
                # ICAI 8th Ed: options turnover = premium received + absolute P&L
                # premium_received is the total premium on the sell leg
                options_turnover += premium + abs_pnl
                net_fno_pnl      += pnl
                fno_count        += 1

            elif trade.segment == 'intraday':
                # Same rule as futures — absolute P&L
                intraday_turnover += abs_pnl
                net_intraday_pnl  += pnl
                intraday_count    += 1

            elif trade.segment == 'delivery':
                # Delivery: turnover = full sell consideration
                delivery_turnover += sell_val
                net_delivery_pnl  += pnl
                delivery_count    += 1

        fno_turnover = futures_turnover + options_turnover

        return TurnoverResult(
            fno_turnover=fno_turnover,
            intraday_turnover=intraday_turnover,
            delivery_turnover=delivery_turnover,
            net_fno_pnl=net_fno_pnl,
            net_intraday_pnl=net_intraday_pnl,
            net_delivery_pnl=net_delivery_pnl,
            futures_turnover=futures_turnover,
            options_turnover=options_turnover,
            total_trades=len(trades),
            fno_trade_count=fno_count,
            intraday_trade_count=intraday_count,
            delivery_trade_count=delivery_count,
        )