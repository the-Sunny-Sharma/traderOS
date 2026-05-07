import pandas as pd
from parsers.base_parser import BaseParser


class ZerodhaParser(BaseParser):
    """
    Parses Zerodha's 'Tradewise P&L' XLSX export.
    Target sheet: 'Tradewise Exits'
    
    Zerodha column structure (as of 2024-25):
        Symbol, ISIN, Trade Date, Exchange, Segment,
        Series, Trade Type, Quantity, Buy Price (Average),
        Sell Price (Average), Buy Value, Sell Value, P&L
    """

    def broker_name(self) -> str:
        return 'zerodha'

    def get_sheet_name(self) -> str:
        return 'Tradewise Exits'

    def get_column_mapping(self) -> dict:
        return {
            'Symbol':               'symbol',
            'Trade Date':           'trade_date',
            'Buy Price (Average)':  'buy_price',
            'Sell Price (Average)': 'sell_price',
            'Quantity':             'quantity',
            'P&L':                  'pnl',
            'Sell Value':           'sell_value',
            'Segment':              'raw_segment',
            'Trade Type':           'trade_type',
        }

    def classify_segment(self, row: pd.Series) -> str:
        """
        Zerodha uses a 'Segment' column with values like:
            'NSE F&O', 'BSE F&O', 'NSE EQ', 'BSE EQ'
        
        And a 'Symbol' column where:
            'NIFTY24DECFUT'  → futures  (ends in FUT)
            'NIFTY24DEC24000CE' → call option (ends in CE)
            'NIFTY24DEC24000PE' → put option  (ends in PE)
            'RELIANCE'       → equity (no suffix)
        
        Trade Type column: 'Buy' or 'Sell' — but for our purposes
        what matters is the final P&L (we get tradewise exits, not
        individual legs).
        """
        symbol = str(row.get('symbol', '')).upper().strip()
        raw_segment = str(row.get('raw_segment', '')).upper().strip()

        # F&O segment detection
        if 'F&O' in raw_segment or 'FNO' in raw_segment:
            # Within F&O, distinguish futures from options by symbol suffix
            if symbol.endswith('FUT'):
                return 'fno_futures'
            elif symbol.endswith('CE') or symbol.endswith('PE'):
                return 'fno_options'
            else:
                # Fallback: if segment is F&O but can't determine type,
                # treat as futures (conservative — abs P&L either way)
                return 'fno_futures'

        # Equity segment
        if 'EQ' in raw_segment or 'NSE' in raw_segment or 'BSE' in raw_segment:
            # Zerodha's tradewise P&L only shows completed trades
            # We can't determine intraday vs delivery from this file alone
            # The 'Trade Type' field in Zerodha's export shows 'Intraday' or 'Delivery'
            trade_type = str(row.get('trade_type', '')).upper().strip()
            if 'INTRADAY' in trade_type or 'MIS' in trade_type:
                return 'intraday'
            return 'delivery'

        # Unknown segment — raise so we catch data quality issues in tests
        raise ValueError(
            f"Cannot classify segment for symbol='{symbol}', "
            f"raw_segment='{raw_segment}'"
        )