package com.traderos.api.domain.repository;

import com.traderos.api.domain.entity.Report;
import com.traderos.api.domain.entity.TaxSummary;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface TaxSummaryRepository extends JpaRepository<TaxSummary, UUID> {
    Optional<TaxSummary> findByReport(Report report);
}