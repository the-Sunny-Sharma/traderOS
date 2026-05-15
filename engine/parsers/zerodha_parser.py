"""
engine/parsers/zerodha_parser.py

Zerodha Tax P&L XLSX parser.
Returns list[Trade] — the canonical domain model used by TurnoverCalculator and TaxEngine.

Design pattern: Template Method (GoF)
  BaseParser defines the algorithm skeleton.
  ZerodhaParser overrides only broker-specific steps.

INTERVIEW TALKING POINT:
  "The Zerodha report is a multi-block document: one sheet with 9 labelled
   sections each having its own header row. I modelled parsing as a state
   machine — scan row by row, transition on section labels, collect Trade
   objects in the data state. The parser returns the canonical Trade domain
   model so TurnoverCalculator needs zero knowledge of Zerodha internals."
"""

import openpyxl
from datetime import datetime, date
from decimal import Decimal, InvalidOperation
from typing import Optional

from models.trade import Trade


# ── Section label → Trade.segment ────────────────────────────────────────────
#
# The Tax engine uses a 3-way split for ICAI turnover rules:
#   'intraday'    → turnover = |P&L|
#   'delivery'    → turnover = sell value
#   'fno_futures' → turnover = |P&L|
#   'fno_options' → turnover = premium received + |P&L|
#
# Zerodha's sections map as follows:
#   Short Term and Long Term are both 'delivery' for turnover purposes.
#   The distinction (STCG vs LTCG tax rate) is handled by TaxEngine separately.
#   ETFs (Non Equity) are treated as delivery equity.
#
# INTERVIEW POINT: The same data can require different categorisations
# depending on the question asked. TurnoverCalculator uses a 4-way split.
# TaxEngine uses a finer split for tax rates. The 'raw_segment' field on
# Trade preserves the original Zerodha section so TaxEngine can use it.

SECTION_TO_SEGMENT: dict[str, str] = {
    "Equity - Intraday":   "intraday",
    "Equity - Short Term": "delivery",
    "Equity - Long Term":  "delivery",
    "Equity - Buyback":    "delivery",   # Section 10(34A) exempt post Oct 2024
    "Non Equity":          "delivery",   # Gold/Silver ETFs — delivery treatment
    "Mutual Funds":        "delivery",
    "F&O":                 "fno_futures",  # refined to fno_options by symbol check
    "Currency":            "fno_futures",
    "Commodity":           "fno_futures",
}

# Sections excluded from turnover/tax calculation.
# Buyback: exempt under Section 10(34A). Mutual Funds: separate ITR treatment.
# We still parse them and store raw_segment so TaxEngine can report them.
TAX_EXCLUDED_SECTIONS: set[str] = {"Equity - Buyback", "Mutual Funds"}


class ZerodhaParser:
    """
    Parses a Zerodha Tax P&L XLSX file into a list of Trade objects.

    Stateless — reads the file, returns data, never writes to DB or network.
    One instance can be reused for multiple files safely (no instance state).
    """

    BROKER_NAME = "zerodha"

    def parse(self, file_path: str) -> list[Trade]:
        """
        Main entry point. Returns list[Trade] matching the domain model.

        Raises ValueError with a human-readable message on structural errors.
        Returns an empty list if the file has no trade rows (valid, not an error).
        """
        wb = self._load_workbook(file_path)
        sheet = self._find_tradewise_sheet(wb)
        return self._extract_trades(sheet)

    # ── Private: workbook loading ─────────────────────────────────────────────

    def _load_workbook(self, file_path: str):
        """
        Load with data_only=True (uses cached formula values, not formulas).
        NOT read_only — Zerodha files use merged cells that break read_only mode
        (all values come back as None in read_only).

        INTERVIEW POINT: openpyxl has two modes:
          read_only=True  — streams rows, low memory, fast for huge files,
                            but can't handle merged cells.
          default         — builds full cell model, handles merged cells,
                            safe for typical financial exports (<10MB).
        """
        try:
            return openpyxl.load_workbook(file_path, data_only=True)
        except Exception as e:
            raise ValueError(f"Cannot open '{file_path}': {e}") from e

    def _find_tradewise_sheet(self, workbook):
        """
        Match sheet by PREFIX — not exact name.

        Zerodha appends the date range dynamically:
          "Tradewise Exits from 2026-04-01"
        The date changes for every user. Hardcoding the name would break
        for every file except the one you tested with.

        INTERVIEW POINT: Never hardcode strings that embed runtime data.
        Match by pattern (startswith / regex) and fail with a helpful message
        that includes what was available vs what was expected.
        """
        for name in workbook.sheetnames:
            if name.startswith("Tradewise Exits"):
                return workbook[name]

        raise ValueError(
            f"Could not find 'Tradewise Exits' sheet. "
            f"Available sheets: {workbook.sheetnames}. "
            f"Please upload a Zerodha Tax P&L report, not a P&L Statement."
        )

    # ── Private: state machine ────────────────────────────────────────────────

    def _extract_trades(self, worksheet) -> list[Trade]:
        """
        State machine that scans the worksheet and builds Trade objects.

        WHY A STATE MACHINE:
        The Zerodha Tax P&L sheet is a 'multi-block' document — multiple
        labelled sections each with their own header row. You can't use
        pd.read_excel() or a fixed row offset because any extra blank row
        would shift all indices. A state machine reads sequentially and
        derives meaning from context (what came before), which handles
        arbitrary spacing and section ordering robustly.

        States:
          SCANNING   → looking for a section label
          IN_SECTION → found a label, expecting the header row next
          IN_DATA    → past the header, collecting Trade rows

        Transitions:
          SCANNING   + section label  → IN_SECTION (reset headers)
          IN_SECTION + "Symbol" row   → IN_DATA    (record headers)
          IN_DATA    + section label  → IN_SECTION (new section begins)
          IN_DATA    + blank row      → IN_DATA    (skip, stay)
          IN_DATA    + data row       → IN_DATA    (emit Trade)
        """
        trades: list[Trade] = []
        current_section: Optional[str] = None
        current_headers: Optional[dict[str, int]] = None

        for row_values in worksheet.iter_rows(values_only=True):
            first_val = next((v for v in row_values if v is not None), None)
            if first_val is None:
                continue  # blank row

            first_str = str(first_val).strip()

            # ── Transition: section label ─────────────────────────────────────
            if first_str in SECTION_TO_SEGMENT:
                current_section = first_str
                current_headers = None
                continue

            # ── Transition: header row ────────────────────────────────────────
            if current_section is not None and current_headers is None and first_str == "Symbol":
                current_headers = {
                    str(v).strip(): idx
                    for idx, v in enumerate(row_values)
                    if v is not None
                }
                continue

            # ── State: collect data rows ──────────────────────────────────────
            if current_section is not None and current_headers is not None:
                # Handle back-to-back sections without blank row between them
                if first_str in SECTION_TO_SEGMENT:
                    current_section = first_str
                    current_headers = None
                    continue

                trade = self._build_trade(row_values, current_headers, current_section)
                if trade is not None:
                    trades.append(trade)

        return trades

    # ── Private: Trade construction ───────────────────────────────────────────

    def _build_trade(
        self,
        row: tuple,
        headers: dict[str, int],
        section: str,
    ) -> Optional[Trade]:
        """
        Build one Trade from a data row. Returns None for empty/invalid rows.

        RETURN None vs RAISE:
        Invalid individual rows (blank separators, sub-totals) are expected
        in financial exports and should be silently skipped. Raise only for
        structural errors that invalidate the entire file.

        INTERVIEW POINT: This is 'defensive programming' — anticipate what
        external data might throw at you and degrade gracefully. A parser
        that crashes on one empty row is a bad parser.
        """

        def get(col_name: str, default=None):
            idx = headers.get(col_name)
            if idx is None or idx >= len(row):
                return default
            v = row[idx]
            return v if v is not None else default

        def to_decimal(val, default: Decimal = Decimal("0")) -> Decimal:
            """
            Safe Decimal conversion.

            INTERVIEW POINT: We use Decimal (not float) for ALL monetary values.
            IEEE 754 float: 0.1 + 0.2 = 0.30000000000000004
            Decimal:        Decimal("0.1") + Decimal("0.2") = Decimal("0.3")
            With thousands of trades, float rounding error accumulates into
            real rupee differences on SEBI-auditable turnover figures.
            """
            if val is None:
                return default
            try:
                return Decimal(str(val))
            except InvalidOperation:
                return default

        def parse_date(val) -> date:
            if val is None:
                return date.today()
            s = str(val).strip()
            try:
                return datetime.strptime(s, "%Y-%m-%d").date()
            except ValueError:
                return date.today()

        # ── Guard: Symbol must exist ──────────────────────────────────────────
        symbol_val = get("Symbol")
        if not symbol_val or str(symbol_val).strip() == "":
            return None  # blank separator row — skip silently

        symbol = str(symbol_val).strip()

        # ── Skip tax-excluded sections ────────────────────────────────────────
        # Buyback: exempt income, excluded from turnover calc.
        # Mutual Funds: separate ITR-2 treatment, not in this calculator scope.
        if section in TAX_EXCLUDED_SECTIONS:
            return None

        # ── Determine Trade.segment ───────────────────────────────────────────
        # Default from section mapping, then refine for options
        trade_segment = SECTION_TO_SEGMENT[section]

        # Options detection: symbol ends with CE (call) or PE (put)
        # e.g. "NIFTY23DECCE" or "BANKNIFTY24JAN45000PE"
        # INTERVIEW POINT: This is domain knowledge — you must know that
        # Indian exchange option symbols always end in CE or PE.
        if trade_segment == "fno_futures" and (symbol.endswith("CE") or symbol.endswith("PE")):
            trade_segment = "fno_options"

        # ── Extract fields ────────────────────────────────────────────────────
        # "Taxable Profit" = FMV-adjusted profit for LTCG (grandfathering rule)
        # "Profit" = raw profit before FMV adjustment
        # For LTCG we always want "Taxable Profit". For others they're equal.
        pnl_raw = get("Taxable Profit") or get("Profit", 0)

        sell_val = to_decimal(get("Sell Value"))
        buy_val = to_decimal(get("Buy Value"))

        # Quantity: Zerodha stores as float (1.0), Trade expects int
        try:
            quantity = max(1, int(float(str(get("Quantity", 1)))))
        except (ValueError, TypeError):
            quantity = 1

        # For options: premium_received = sell_value (total premium from sell leg)
        # For futures/intraday/delivery: 0
        premium = sell_val if trade_segment == "fno_options" else Decimal("0")

        # Use exit date as trade_date — this is the settlement date for tax purposes
        trade_date = parse_date(get("Exit Date") or get("Entry Date"))

        try:
            return Trade(
                segment=trade_segment,
                symbol=symbol,
                trade_date=trade_date,
                buy_price=buy_val,
                sell_price=to_decimal(get("Sell Value")),
                quantity=quantity,
                pnl=to_decimal(pnl_raw),
                sell_value=sell_val,
                is_squared=True,               # Tax P&L only shows squared-off trades
                premium_received=premium,
                broker=self.BROKER_NAME,
                raw_segment=section,           # preserve original for TaxEngine rate lookup
            )
        except ValueError as e:
            # Trade.__post_init__ raised (e.g. invalid segment) — log and skip
            import sys
            print(f"WARNING: Skipping trade {symbol!r}: {e}", file=sys.stderr)
            return None


# ── Standalone smoke test ─────────────────────────────────────────────────────
if __name__ == "__main__":
    import sys
    from collections import Counter

    if len(sys.argv) < 2:
        print("Usage: python zerodha_parser.py <path_to_xlsx>")
        sys.exit(1)

    parser = ZerodhaParser()
    trades = parser.parse(sys.argv[1])

    print(f"✅ Parsed {len(trades)} Trade objects\n")
    print("Segment breakdown:")
    for seg, count in Counter(t.segment for t in trades).items():
        print(f"  {seg:15} → {count} trades")

    print("\nSample trades:")
    for t in trades[:3]:
        print(f"  {t.symbol:15} | {t.segment:12} | exit:{t.trade_date} | "
              f"pnl:{t.pnl:>10} | sell_value:{t.sell_value:>10}")