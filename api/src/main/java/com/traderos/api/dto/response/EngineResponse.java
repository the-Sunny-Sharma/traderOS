package com.traderos.api.dto.response;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import java.util.List;

@JsonIgnoreProperties(ignoreUnknown = true)
public record EngineResponse(
        String jobId,
        String broker,
        TaxSummaryPayload taxSummary,
        TurnoverPayload turnover,
        List<String> warnings
) {
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record TaxSummaryPayload(
            String fnoTurnover,
            String intradayTurnover,
            String deliveryTurnover,
            String netFnoPnl,
            String netIntradayPnl,
            String netDeliveryPnl,
            boolean auditRequired,
            String auditReason,
            String itrForm,
            String itrReason,
            String advanceTaxQ1,
            String advanceTaxQ2,
            String advanceTaxQ3,
            String advanceTaxQ4,
            String deductibleExpenses,
            List<String> deductibleBreakdown,
            String estimatedTotalTax,
            String taxRegime
    ) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record TurnoverPayload(
            String fnoTurnover,
            String intradayTurnover,
            String deliveryTurnover,
            String totalSpeculativeTurnover,
            int totalTrades,
            int fnoTradeCount,
            int intradayTradeCount,
            int deliveryTradeCount
    ) {}
}