# from fastapi import FastAPI
# from fastapi.middleware.cors import CORSMiddleware

# app = FastAPI(
#     title="TraderOS Engine",
#     description="Tax calculation and file parsing service",
#     version="1.0.0"
# )

# app.add_middleware(
#     CORSMiddleware,
#     allow_origins=["http://localhost:8080"],
#     allow_methods=["*"],
#     allow_headers=["*"],
# )

# @app.get("/health")
# def health():
#     return {"status": "up", "service": "traderos-engine"}

import os
import shutil
import uuid
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, File, UploadFile, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from models.trade import Trade
from parsers.zerodha_parser import ZerodhaParser
from calculators.turnover_calculator import TurnoverCalculator, TurnoverResult
from calculators.tax_engine import TaxEngine, TaxSummary


# ── App setup ────────────────────────────────────────────────────────────────

app = FastAPI(
    title="TraderOS Engine",
    description="Stateless tax calculation and file parsing microservice",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8080", "http://api:8080"],
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", "/tmp/traderos-uploads"))
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

PARSER_REGISTRY = {
    "zerodha": ZerodhaParser,
    # Future: "groww": GrowwParser, "upstox": UpstoxParser
}

BrokerName = Literal["zerodha", "groww", "upstox", "dhan"]


# ── Pydantic response models ─────────────────────────────────────────────────

class TradeOut(BaseModel):
    segment: str
    symbol: str
    trade_date: str
    buy_price: str
    sell_price: str
    quantity: int
    pnl: str
    sell_value: str
    broker: str

    @classmethod
    def from_trade(cls, t: Trade) -> "TradeOut":
        return cls(
            segment=t.segment,
            symbol=t.symbol,
            trade_date=str(t.trade_date),
            buy_price=str(t.buy_price),
            sell_price=str(t.sell_price),
            quantity=t.quantity,
            pnl=str(t.pnl),
            sell_value=str(t.sell_value),
            broker=t.broker,
        )


class TurnoverOut(BaseModel):
    fno_turnover: str
    intraday_turnover: str
    delivery_turnover: str
    total_speculative_turnover: str
    net_fno_pnl: str
    net_intraday_pnl: str
    net_delivery_pnl: str
    futures_turnover: str
    options_turnover: str
    total_trades: int
    fno_trade_count: int
    intraday_trade_count: int
    delivery_trade_count: int

    @classmethod
    def from_result(cls, r: TurnoverResult) -> "TurnoverOut":
        return cls(
            fno_turnover=str(r.fno_turnover),
            intraday_turnover=str(r.intraday_turnover),
            delivery_turnover=str(r.delivery_turnover),
            total_speculative_turnover=str(r.total_speculative_turnover),
            net_fno_pnl=str(r.net_fno_pnl),
            net_intraday_pnl=str(r.net_intraday_pnl),
            net_delivery_pnl=str(r.net_delivery_pnl),
            futures_turnover=str(r.futures_turnover),
            options_turnover=str(r.options_turnover),
            total_trades=r.total_trades,
            fno_trade_count=r.fno_trade_count,
            intraday_trade_count=r.intraday_trade_count,
            delivery_trade_count=r.delivery_trade_count,
        )


class TaxSummaryOut(BaseModel):
    fno_turnover: str
    intraday_turnover: str
    delivery_turnover: str
    net_fno_pnl: str
    net_intraday_pnl: str
    net_delivery_pnl: str
    audit_required: bool
    audit_reason: str
    itr_form: str
    itr_reason: str
    advance_tax_q1: str
    advance_tax_q2: str
    advance_tax_q3: str
    advance_tax_q4: str
    deductible_expenses: str
    deductible_breakdown: list[str]
    estimated_total_tax: str
    tax_regime: str

    @classmethod
    def from_summary(cls, s: TaxSummary) -> "TaxSummaryOut":
        return cls(
            fno_turnover=str(s.fno_turnover),
            intraday_turnover=str(s.intraday_turnover),
            delivery_turnover=str(s.delivery_turnover),
            net_fno_pnl=str(s.net_fno_pnl),
            net_intraday_pnl=str(s.net_intraday_pnl),
            net_delivery_pnl=str(s.net_delivery_pnl),
            audit_required=s.audit_required,
            audit_reason=s.audit_reason,
            itr_form=s.itr_form,
            itr_reason=s.itr_reason,
            advance_tax_q1=str(s.advance_tax_q1),
            advance_tax_q2=str(s.advance_tax_q2),
            advance_tax_q3=str(s.advance_tax_q3),
            advance_tax_q4=str(s.advance_tax_q4),
            deductible_expenses=str(s.deductible_expenses),
            deductible_breakdown=s.deductible_breakdown,
            estimated_total_tax=str(s.estimated_total_tax),
            tax_regime=s.tax_regime,
        )


class ParseAndAssessResponse(BaseModel):
    job_id: str
    broker: str
    trades: list[TradeOut]
    turnover: TurnoverOut
    tax_summary: TaxSummaryOut
    warnings: list[str]


# ── Endpoints ────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "up", "service": "traderos-engine"}


@app.post("/parse-and-assess", response_model=ParseAndAssessResponse)
async def parse_and_assess(
    file: UploadFile = File(...),
    broker: BrokerName = Form(...),
    other_income: float = Form(default=0.0),
    regime: str = Form(default="new"),
):
    """
    Main endpoint called by Spring Boot after a file upload.
    
    Accepts a multipart form with:
        file        — the broker XLSX/CSV file
        broker      — broker identifier: zerodha | groww | upstox | dhan
        other_income — trader's other annual income (salary, etc.) in INR
        regime      — tax regime: 'new' or 'old'
    
    Returns complete tax assessment as JSON.
    """
    # Validate broker
    if broker not in PARSER_REGISTRY:
        raise HTTPException(
            status_code=422,
            detail=f"Broker '{broker}' not yet supported. "
                   f"Supported: {list(PARSER_REGISTRY.keys())}"
        )

    # Validate file type
    filename = file.filename or ""
    if not any(filename.lower().endswith(ext) for ext in ('.xlsx', '.xls', '.csv')):
        raise HTTPException(
            status_code=422,
            detail="Only .xlsx, .xls, and .csv files are supported"
        )

    # Save uploaded file to temp location
    job_id = str(uuid.uuid4())
    suffix = Path(filename).suffix
    tmp_path = UPLOAD_DIR / f"{job_id}{suffix}"

    try:
        with open(tmp_path, "wb") as f:
            shutil.copyfileobj(file.file, f)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save file: {e}")

    warnings = []

    try:
        # Parse
        parser_class = PARSER_REGISTRY[broker]
        parser = parser_class()
        trades = parser.parse(str(tmp_path))

        if not trades:
            raise HTTPException(
                status_code=422,
                detail="No trades found in the file. "
                       "Check that you selected the correct broker."
            )

        # Calculate turnover
        turnover_calc = TurnoverCalculator()
        turnover = turnover_calc.calculate(trades)

        # Tax assessment
        tax_engine = TaxEngine()
        from decimal import Decimal
        summary = tax_engine.assess(
            turnover,
            other_income=Decimal(str(other_income)),
            regime=regime,
        )

        # Warn if broker not fully verified
        if broker == "zerodha":
            warnings.append(
                "Zerodha parser is in beta. "
                "Verify turnover figures against your CA's calculation."
            )

        return ParseAndAssessResponse(
            job_id=job_id,
            broker=broker,
            trades=[TradeOut.from_trade(t) for t in trades],
            turnover=TurnoverOut.from_result(turnover),
            tax_summary=TaxSummaryOut.from_summary(summary),
            warnings=warnings,
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Processing failed: {str(e)}"
        )
    finally:
        # Always clean up the temp file
        if tmp_path.exists():
            tmp_path.unlink()


@app.get("/supported-brokers")
def supported_brokers():
    """Returns the list of supported brokers and their status."""
    return {
        "supported": [
            {"broker": "zerodha", "status": "beta", "file_type": "xlsx"},
        ],
        "coming_soon": ["groww", "upstox", "dhan", "angelone"],
    }