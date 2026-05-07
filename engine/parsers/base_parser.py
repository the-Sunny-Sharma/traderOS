from abc import ABC, abstractmethod
from pathlib import Path
from typing import List
import pandas as pd

from models.trade import Trade


class BaseParser(ABC):
    """
    Template Method pattern — defines the skeleton of the parsing algorithm.
    
    Subclasses implement the broker-specific steps:
        - get_sheet_name()     → which sheet to read
        - get_column_mapping() → how to rename broker columns to our standard names
        - classify_segment()   → how to detect trade type from this broker's data
    
    The orchestration logic (open file, iterate rows, build Trade objects)
    lives here and never changes.
    """

    def parse(self, file_path: str) -> List[Trade]:
        """
        Template method — the fixed algorithm every broker goes through.
        Subclasses never override this method.
        """
        path = Path(file_path)
        if not path.exists():
            raise FileNotFoundError(f"File not found: {file_path}")
        if path.suffix.lower() not in ('.xlsx', '.xls', '.csv'):
            raise ValueError(f"Unsupported file type: {path.suffix}")

        df = self._load_dataframe(path)
        df = self._normalise_columns(df)
        df = self._clean_dataframe(df)
        trades = self._build_trades(df)
        return trades

    def _load_dataframe(self, path: Path) -> pd.DataFrame:
        """Load the correct sheet from the broker file."""
        sheet = self.get_sheet_name()
        try:
            if path.suffix.lower() == '.csv':
                return pd.read_csv(path)
            return pd.read_excel(path, sheet_name=sheet)
        except Exception as e:
            raise ValueError(
                f"Failed to read file {path.name} "
                f"(sheet='{sheet}'): {e}"
            )

    def _normalise_columns(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Rename broker-specific column names to our standard names.
        
        Standard column names we expect after this step:
            symbol, trade_date, buy_price, sell_price,
            quantity, pnl, sell_value
        """
        mapping = self.get_column_mapping()
        # Strip whitespace from column names first — broker files often have spaces
        df.columns = df.columns.str.strip()
        df = df.rename(columns=mapping)
        return df

    def _clean_dataframe(self, df: pd.DataFrame) -> pd.DataFrame:
        """Remove rows that are headers, totals, or blank."""
        # Drop rows where pnl is not numeric (catches 'Total', 'Grand Total' rows)
        df = df[pd.to_numeric(df['pnl'], errors='coerce').notna()].copy()
        df['pnl'] = pd.to_numeric(df['pnl'])
        df.reset_index(drop=True, inplace=True)
        return df

    def _build_trades(self, df: pd.DataFrame) -> List[Trade]:
        """Convert each DataFrame row to a Trade object."""
        trades = []
        for idx, row in df.iterrows():
            try:
                segment = self.classify_segment(row)
                trade = Trade(
                    segment=segment,
                    symbol=str(row.get('symbol', '')).strip(),
                    trade_date=self._parse_date(row.get('trade_date')),
                    buy_price=self._to_decimal(row.get('buy_price', 0)),
                    sell_price=self._to_decimal(row.get('sell_price', 0)),
                    quantity=int(row.get('quantity', 0)),
                    pnl=self._to_decimal(row.get('pnl', 0)),
                    sell_value=self._to_decimal(
                        row.get('sell_value',
                                row.get('sell_price', 0)) *
                        row.get('quantity', 1)
                    ),
                    broker=self.broker_name(),
                    raw_segment=str(row.get('raw_segment', '')),
                )
                trades.append(trade)
            except Exception as e:
                # Log bad row but continue — don't fail entire file for one bad row
                print(f"Warning: skipping row {idx}: {e}")
        return trades

    # ── Utility helpers ──────────────────────────────────────────────────────

    @staticmethod
    def _to_decimal(value) -> 'Decimal':
        from decimal import Decimal
        if value is None or (isinstance(value, float) and __import__('math').isnan(value)):
            return Decimal('0')
        return Decimal(str(value))

    @staticmethod
    def _parse_date(value) -> 'date':
        from datetime import date
        import pandas as pd
        if isinstance(value, date):
            return value
        if pd.isna(value) if not isinstance(value, str) else not value:
            return date.today()
        return pd.to_datetime(value).date()

    # ── Abstract methods — every broker subclass must implement these ─────────

    @abstractmethod
    def get_sheet_name(self) -> str:
        """Return the sheet name to read from the XLSX file."""
        pass

    @abstractmethod
    def get_column_mapping(self) -> dict:
        """
        Return a dict mapping broker column names → our standard names.
        Example: {'P&L': 'pnl', 'Scrip': 'symbol', 'Trade Date': 'trade_date'}
        """
        pass

    @abstractmethod
    def classify_segment(self, row: pd.Series) -> str:
        """
        Classify a row as 'fno_futures', 'fno_options', 'intraday', or 'delivery'.
        Logic is broker-specific because each broker expresses segments differently.
        """
        pass

    @abstractmethod
    def broker_name(self) -> str:
        """Return the broker identifier string, e.g. 'zerodha'."""
        pass