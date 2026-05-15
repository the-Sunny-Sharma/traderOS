package com.traderos.api.dto.response;

import com.traderos.api.domain.entity.Report;
import com.traderos.api.domain.entity.TaxSummary;
import com.traderos.api.domain.enums.ReportStatus;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

public record ReportDetailResponse(
        UUID id,
        String brokerName,
        String fy,
        ReportStatus status,
        LocalDateTime createdAt,
        TaxSummaryDetail taxSummary
) {
    public record TaxSummaryDetail(
            BigDecimal fnoTurnover,
            BigDecimal intradayTurnover,
            BigDecimal deliveryTurnover,
            BigDecimal netFnoPnl,
            BigDecimal netIntradayPnl,
            BigDecimal netDeliveryPnl,
            Boolean auditRequired,
            String auditReason,
            String itrForm,
            String itrReason,
            BigDecimal advanceTaxQ1,
            BigDecimal advanceTaxQ2,
            BigDecimal advanceTaxQ3,
            BigDecimal advanceTaxQ4,
            BigDecimal deductibleExpenses,
            BigDecimal estimatedTotalTax
    ) {}

    public static ReportDetailResponse of(Report report, TaxSummary ts) {
        TaxSummaryDetail detail = null;
        if (ts != null) {
            detail = new TaxSummaryDetail(
                    ts.getFnoTurnover(),
                    ts.getIntradayTurnover(),
                    ts.getDeliveryTurnover(),
                    ts.getNetFnoPnl(),
                    ts.getNetIntradayPnl(),
                    ts.getNetDeliveryPnl(),
                    ts.getAuditRequired(),
                    ts.getAuditReason(),
                    ts.getItrForm(),
                    null,
                    ts.getAdvanceTaxQ1(),
                    ts.getAdvanceTaxQ2(),
                    ts.getAdvanceTaxQ3(),
                    ts.getAdvanceTaxQ4(),
                    ts.getDeductibleExpenses(),
                    null
            );
        }
        return new ReportDetailResponse(
                report.getId(),
                report.getBrokerName().name(),
                report.getFy(),
                report.getStatus(),
                report.getCreatedAt(),
                detail
        );
    }
}