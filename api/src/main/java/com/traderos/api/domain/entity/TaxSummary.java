package com.traderos.api.domain.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "tax_summaries")
@Getter @Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class TaxSummary {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "report_id", unique = true)
    private Report report;

    @Column(name = "fno_turnover", precision = 15, scale = 2)
    private BigDecimal fnoTurnover;

    @Column(name = "intraday_turnover", precision = 15, scale = 2)
    private BigDecimal intradayTurnover;

    @Column(name = "delivery_turnover", precision = 15, scale = 2)
    private BigDecimal deliveryTurnover;

    @Column(name = "net_fno_pnl", precision = 15, scale = 2)
    private BigDecimal netFnoPnl;

    @Column(name = "net_intraday_pnl", precision = 15, scale = 2)
    private BigDecimal netIntradayPnl;

    @Column(name = "net_delivery_pnl", precision = 15, scale = 2)
    private BigDecimal netDeliveryPnl;

    @Column(name = "audit_required")
    private Boolean auditRequired;

    @Column(name = "audit_reason", length = 500)
    private String auditReason;

    @Column(name = "itr_form", length = 10)
    private String itrForm;

    @Column(name = "advance_tax_q1", precision = 15, scale = 2)
    private BigDecimal advanceTaxQ1;

    @Column(name = "advance_tax_q2", precision = 15, scale = 2)
    private BigDecimal advanceTaxQ2;

    @Column(name = "advance_tax_q3", precision = 15, scale = 2)
    private BigDecimal advanceTaxQ3;

    @Column(name = "advance_tax_q4", precision = 15, scale = 2)
    private BigDecimal advanceTaxQ4;

    @Column(name = "deductible_expenses", precision = 15, scale = 2)
    private BigDecimal deductibleExpenses;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;
}