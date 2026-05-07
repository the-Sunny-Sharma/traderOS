from decimal import Decimal, ROUND_HALF_UP
from dataclasses import dataclass, field
from typing import List, Optional
from calculators.turnover_calculator import TurnoverResult


# ── Constants ────────────────────────────────────────────────────────────────

AUDIT_THRESHOLD         = Decimal('10_00_00_000')   # ₹10 crore
ADVANCE_TAX_THRESHOLD   = Decimal('10_000')          # ₹10,000

# Advance tax instalments — cumulative % by each due date (Section 211)
ADVANCE_TAX_SCHEDULE = [
    ('June 15',     Decimal('0.15')),
    ('September 15', Decimal('0.45')),
    ('December 15', Decimal('0.75')),
    ('March 15',    Decimal('1.00')),
]

# New tax regime slabs FY 2024-25 (Section 115BAC, default regime)
# These are the slabs an individual trader would typically fall under
NEW_REGIME_SLABS = [
    (Decimal('3_00_000'),   Decimal('0')),      # 0-3L: 0%
    (Decimal('7_00_000'),   Decimal('0.05')),   # 3-7L: 5%
    (Decimal('10_00_000'),  Decimal('0.10')),   # 7-10L: 10%
    (Decimal('12_00_000'),  Decimal('0.15')),   # 10-12L: 15%
    (Decimal('15_00_000'),  Decimal('0.20')),   # 12-15L: 20%
    (Decimal('999_99_99_999'), Decimal('0.30')), # 15L+: 30%
]


@dataclass
class TaxSummary:
    """Complete tax assessment for a trader's financial year."""

    # Turnover figures
    fno_turnover: Decimal
    intraday_turnover: Decimal
    delivery_turnover: Decimal

    # P&L figures
    net_fno_pnl: Decimal
    net_intraday_pnl: Decimal
    net_delivery_pnl: Decimal

    # Audit decision
    audit_required: bool
    audit_reason: str

    # ITR form
    itr_form: str
    itr_reason: str

    # Advance tax (quarterly instalments in INR)
    advance_tax_q1: Decimal    # Due June 15
    advance_tax_q2: Decimal    # Due September 15
    advance_tax_q3: Decimal    # Due December 15
    advance_tax_q4: Decimal    # Due March 15

    # Deductions applicable
    deductible_expenses: Decimal
    deductible_breakdown: List[str] = field(default_factory=list)

    # Estimated tax
    estimated_total_tax: Decimal = Decimal('0')
    tax_regime: str = 'new'
    assumed_other_income: Decimal = Decimal('0')


class TaxEngine:
    """
    Applies Indian Income Tax rules to a TurnoverResult.

    Key rules implemented:
        - Section 44AB: mandatory audit if F&O+intraday turnover > ₹10 Cr
        - Section 44AB proviso: audit if loss and want to carry forward
        - ITR-3 for business income (F&O/intraday), ITR-2 for delivery only
        - Section 211: advance tax quarterly schedule
        - Standard deductions for traders (Section 37)
    """

    def assess(
        self,
        turnover: TurnoverResult,
        other_income: Decimal = Decimal('0'),
        regime: str = 'new',
    ) -> TaxSummary:

        audit_required, audit_reason = self._determine_audit(turnover)
        itr_form, itr_reason         = self._determine_itr_form(turnover)
        deductible, breakdown        = self._estimate_deductions(turnover)
        estimated_tax                = self._estimate_tax(
                                            turnover, other_income,
                                            deductible, regime
                                        )
        q1, q2, q3, q4              = self._advance_tax_schedule(estimated_tax)

        return TaxSummary(
            fno_turnover=turnover.fno_turnover,
            intraday_turnover=turnover.intraday_turnover,
            delivery_turnover=turnover.delivery_turnover,
            net_fno_pnl=turnover.net_fno_pnl,
            net_intraday_pnl=turnover.net_intraday_pnl,
            net_delivery_pnl=turnover.net_delivery_pnl,
            audit_required=audit_required,
            audit_reason=audit_reason,
            itr_form=itr_form,
            itr_reason=itr_reason,
            advance_tax_q1=q1,
            advance_tax_q2=q2,
            advance_tax_q3=q3,
            advance_tax_q4=q4,
            deductible_expenses=deductible,
            deductible_breakdown=breakdown,
            estimated_total_tax=estimated_tax,
            tax_regime=regime,
            assumed_other_income=other_income,
        )

    def _determine_audit(self, t: TurnoverResult):
        speculative = t.total_speculative_turnover

        if speculative > AUDIT_THRESHOLD:
            return True, (
                f"F&O + intraday turnover ₹{speculative:,.2f} exceeds "
                f"₹10 crore threshold under Section 44AB"
            )

        total_pnl = t.net_fno_pnl + t.net_intraday_pnl
        if total_pnl < 0:
            return True, (
                f"Net F&O loss of ₹{abs(total_pnl):,.2f}. Audit required "
                f"to carry forward business loss under Section 44AB proviso"
            )

        return False, "Turnover below ₹10 crore threshold and no F&O loss. Audit optional."

    def _determine_itr_form(self, t: TurnoverResult):
        has_business_income = (
            t.fno_trade_count > 0 or t.intraday_trade_count > 0
        )

        if has_business_income:
            return 'ITR-3', (
                "F&O and/or intraday trading constitutes business income "
                "under Section 43(5). ITR-3 is mandatory."
            )

        if t.delivery_trade_count > 0:
            return 'ITR-2', (
                "Only delivery-based equity trades — treated as capital gains. "
                "ITR-2 is appropriate."
            )

        return 'ITR-1', "No trading activity detected."

    def _estimate_deductions(self, t: TurnoverResult):
        """
        Section 37 allows all expenses wholly and exclusively
        for business. Common deductions for traders:
        - Brokerage (typically 0.01-0.03% of turnover)
        - STT, exchange charges, SEBI fees (already deducted in P&L by brokers)
        - Internet and electricity (₹15,000 flat estimate)
        - Depreciation on computer (₹20,000 flat estimate)
        - CA/accountant fees (₹15,000 flat estimate)

        Note: STT is NOT deductible as expense — it can be credited only
        for delivery trades (Section 88E is removed, so actually STT is
        not deductible at all for F&O). We don't claim it.
        """
        breakdown = []
        total = Decimal('0')

        if t.fno_trade_count > 0 or t.intraday_trade_count > 0:
            internet = Decimal('15000')
            depreciation = Decimal('20000')
            ca_fees = Decimal('15000')

            breakdown.append(f"Internet/electricity: ₹{internet:,.0f}")
            breakdown.append(f"Computer depreciation: ₹{depreciation:,.0f}")
            breakdown.append(f"Professional fees (CA): ₹{ca_fees:,.0f}")

            total = internet + depreciation + ca_fees

        return total, breakdown

    def _estimate_tax(
        self,
        t: TurnoverResult,
        other_income: Decimal,
        deductions: Decimal,
        regime: str,
    ) -> Decimal:
        """
        Rough tax estimate using new regime slabs.
        Assumes individual taxpayer, no other deductions claimed.
        This is indicative — actual liability may vary.
        """
        business_income = (
            t.net_fno_pnl + t.net_intraday_pnl - deductions
        )
        # Losses can offset other income (with limits) — simplified here
        total_income = max(
            Decimal('0'),
            business_income + t.net_delivery_pnl + other_income
        )

        tax = self._apply_new_regime_slabs(total_income)

        # 4% Health and Education cess on tax
        cess = (tax * Decimal('0.04')).quantize(
            Decimal('0.01'), rounding=ROUND_HALF_UP
        )
        return tax + cess

    def _apply_new_regime_slabs(self, income: Decimal) -> Decimal:
        tax = Decimal('0')
        prev_limit = Decimal('0')

        for limit, rate in NEW_REGIME_SLABS:
            if income <= prev_limit:
                break
            taxable_in_slab = min(income, limit) - prev_limit
            tax += taxable_in_slab * rate
            prev_limit = limit

        return tax.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

    def _advance_tax_schedule(self, total_tax: Decimal):
        """
        Section 211: If total tax > ₹10,000, advance tax is due in
        four instalments. Returns the amount due BY each date
        (not the incremental amount — the cumulative amount).
        """
        if total_tax <= ADVANCE_TAX_THRESHOLD:
            zero = Decimal('0')
            return zero, zero, zero, zero

        def instalment(pct: Decimal) -> Decimal:
            return (total_tax * pct).quantize(
                Decimal('0.01'), rounding=ROUND_HALF_UP
            )

        q1 = instalment(Decimal('0.15'))
        q2 = instalment(Decimal('0.45'))
        q3 = instalment(Decimal('0.75'))
        q4 = total_tax  # 100%

        return q1, q2, q3, q4