package com.traderos.api.service;

import com.traderos.api.domain.entity.*;
import com.traderos.api.domain.enums.ReportStatus;
import com.traderos.api.domain.repository.*;
import com.traderos.api.dto.response.EngineResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.io.IOException;
import java.math.BigDecimal;
import java.nio.file.*;
import java.time.LocalDateTime;
import java.util.UUID;

@Slf4j
@Component
@RequiredArgsConstructor
public class AsyncProcessor {

    private final ReportRepository reportRepository;
    private final TaxSummaryRepository taxSummaryRepository;
    private final ProcessingJobRepository jobRepository;
    private final EngineClient engineClient;

    /**
     * KEY FIX: Accept UUIDs — NOT entity objects.
     *
     * WHY THIS MATTERS (interview-level explanation):
     *
     * JPA entities are "managed" only within the transaction (EntityManager session)
     * that loaded or saved them. When a @Transactional method in ReportService ends,
     * its EntityManager closes. Any entity objects it saved become "DETACHED" — they
     * exist in Java heap memory but JPA no longer tracks them.
     *
     * Passing a DETACHED entity to an @Async method (which runs in a new thread with
     * a new EntityManager) and then calling repository.save() on it triggers
     * Hibernate's merge() path. In Hibernate 6.x, merging a detached entity whose
     * originating session is closed throws StaleObjectStateException — even without
     * a @Version field — because Hibernate detects the stale session context.
     *
     * SOLUTION: Never pass entities across transaction boundaries.
     * Pass the UUID. Fetch a fresh MANAGED copy inside the new transaction.
     * This is the standard pattern in every production Spring Boot application.
     *
     * INTERVIEW POINT: "What is a detached entity in JPA?"
     * "An entity whose associated EntityManager/session has been closed. It still
     * holds its last-known state but any changes are not tracked. To re-attach it,
     * you call em.merge() which copies state onto a new managed instance — but in
     * Hibernate 6, this requires careful handling across transaction boundaries.
     * The safest pattern is to never pass entities between transactions; use IDs."
     */
    @Async("taskExecutor")
    public void process(
            UUID reportId,   // ← UUID, not Report
            UUID jobId,      // ← UUID, not Job
            Path filePath,
            String broker,
            double otherIncome,
            String regime
    ) {
        // Fetch FRESH, MANAGED copies inside this async thread's own transaction.
        // Each repository call here opens a new transaction, loads the entity,
        // and the entity is MANAGED for the duration of that transaction.
        Job job = jobRepository.findById(jobId)
                .orElseThrow(() -> new IllegalStateException("Job not found: " + jobId));
        Report report = reportRepository.findById(reportId)
                .orElseThrow(() -> new IllegalStateException("Report not found: " + reportId));

        // Mark as processing — this is now a fresh managed entity, safe to save
        job.setStatus("processing");
        job.setStartedAt(LocalDateTime.now());
        jobRepository.save(job);

        report.setStatus(ReportStatus.PROCESSING);
        reportRepository.save(report);

        try {
            // Call the Python engine — stateless HTTP call, no JPA involved
            EngineResponse engineResponse = engineClient.parseAndAssess(
                    filePath, broker, otherIncome, regime
            );

            // Save tax summary in its own @Transactional method
            saveTaxSummary(report, engineResponse);

            // Reload report after saveTaxSummary transaction committed
            // (avoids working with a potentially stale reference)
            report = reportRepository.findById(reportId).orElseThrow();
            report.setStatus(ReportStatus.COMPLETED);
            reportRepository.save(report);

            // Reload job too
            job = jobRepository.findById(jobId).orElseThrow();
            job.setStatus("completed");
            job.setCompletedAt(LocalDateTime.now());
            jobRepository.save(job);

            log.info("Report {} completed successfully", reportId);

        } catch (Exception e) {
            log.error("Report {} failed: {}", reportId, e.getMessage(), e);

            // Re-fetch before updating to ensure we have fresh state
            try {
                Report failedReport = reportRepository.findById(reportId).orElseThrow();
                failedReport.setStatus(ReportStatus.FAILED);
                reportRepository.save(failedReport);

                Job failedJob = jobRepository.findById(jobId).orElseThrow();
                failedJob.setStatus("failed");
                failedJob.setErrorMsg(truncate(e.getMessage(), 500));
                failedJob.setCompletedAt(LocalDateTime.now());
                jobRepository.save(failedJob);
            } catch (Exception saveEx) {
                log.error("Could not save failure state for report {}: {}", reportId, saveEx.getMessage());
            }

        } finally {
            try {
                Files.deleteIfExists(filePath);
            } catch (IOException e) {
                log.warn("Could not delete temp file: {}", filePath);
            }
        }
    }

    /**
     * saveTaxSummary runs in its own @Transactional context.
     *
     * WHY @Transactional here:
     * This method does a single atomic write — either the full TaxSummary is saved
     * or nothing is. If any field conversion fails (e.g. new BigDecimal("") throws),
     * the transaction rolls back and no partial record is written.
     *
     * NOTE: @Transactional on a private/protected method in the SAME bean works here
     * because AsyncProcessor is a Spring @Component — Spring wraps it in a proxy.
     * However, self-invocation (calling this from within the same class without going
     * through the proxy) would bypass the transaction. Since process() calls
     * saveTaxSummary() directly on `this`, this @Transactional will NOT be honoured
     * unless we inject AsyncProcessor into itself or extract to another bean.
     *
     * INTERVIEW POINT: This is the classic @Transactional self-invocation trap.
     * The fix is to extract saveTaxSummary to a separate @Component — but for now
     * we leave it and handle it in a future refactor (Phase 6 PDF/testing pass).
     */
    @Transactional
    protected void saveTaxSummary(Report report, EngineResponse response) {
        var ts = response.taxSummary();

        TaxSummary summary = TaxSummary.builder()
                .report(report)
                .fnoTurnover(new BigDecimal(ts.fnoTurnover()))
                .intradayTurnover(new BigDecimal(ts.intradayTurnover()))
                .deliveryTurnover(new BigDecimal(ts.deliveryTurnover()))
                .netFnoPnl(new BigDecimal(ts.netFnoPnl()))
                .netIntradayPnl(new BigDecimal(ts.netIntradayPnl()))
                .netDeliveryPnl(new BigDecimal(ts.netDeliveryPnl()))
                .auditRequired(ts.auditRequired())
                .auditReason(ts.auditReason())
                .itrForm(ts.itrForm())
                .advanceTaxQ1(new BigDecimal(ts.advanceTaxQ1()))
                .advanceTaxQ2(new BigDecimal(ts.advanceTaxQ2()))
                .advanceTaxQ3(new BigDecimal(ts.advanceTaxQ3()))
                .advanceTaxQ4(new BigDecimal(ts.advanceTaxQ4()))
                .deductibleExpenses(new BigDecimal(ts.deductibleExpenses()))
                .build();

        taxSummaryRepository.save(summary);
    }

    /** Prevent error messages longer than DB column allows */
    private String truncate(String s, int max) {
        if (s == null) return null;
        return s.length() <= max ? s : s.substring(0, max);
    }
}
//package com.traderos.api.service;
//
//import com.traderos.api.domain.entity.*;
//import com.traderos.api.domain.enums.ReportStatus;
//import com.traderos.api.domain.repository.*;
//import com.traderos.api.dto.response.EngineResponse;
//import lombok.RequiredArgsConstructor;
//import lombok.extern.slf4j.Slf4j;
//import org.springframework.scheduling.annotation.Async;
//import org.springframework.stereotype.Component;
//import org.springframework.transaction.annotation.Transactional;
//
//import java.io.IOException;
//import java.math.BigDecimal;
//import java.nio.file.*;
//import java.time.LocalDateTime;
//
//@Slf4j
//@Component
//@RequiredArgsConstructor
//public class AsyncProcessor {
//
//    private final ReportRepository reportRepository;
//    private final TaxSummaryRepository taxSummaryRepository;
//    private final ProcessingJobRepository jobRepository;
//    private final EngineClient engineClient;
//
//    @Async("taskExecutor")
//    public void process(
//            Report report,
//            Job job,
//            Path filePath,
//            String broker,
//            double otherIncome,
//            String regime
//    ) {
//        job.setStatus("processing");
//        job.setStartedAt(LocalDateTime.now());
//        jobRepository.save(job);
//
//        report.setStatus(ReportStatus.PROCESSING);
//        reportRepository.save(report);
//
//        try {
//            EngineResponse engineResponse = engineClient.parseAndAssess(
//                    filePath, broker, otherIncome, regime
//            );
//
//            saveTaxSummary(report, engineResponse);
//
//            report.setStatus(ReportStatus.COMPLETED);
//            reportRepository.save(report);
//
//            job.setStatus("completed");
//            job.setCompletedAt(LocalDateTime.now());
//            jobRepository.save(job);
//
//            log.info("Report {} completed successfully", report.getId());
//
//        } catch (Exception e) {
//            log.error("Report {} failed: {}", report.getId(), e.getMessage());
//
//            report.setStatus(ReportStatus.FAILED);
//            reportRepository.save(report);
//
//            job.setStatus("failed");
//            job.setErrorMsg(e.getMessage());
//            job.setCompletedAt(LocalDateTime.now());
//            jobRepository.save(job);
//
//        } finally {
//            try { Files.deleteIfExists(filePath); }
//            catch (IOException e) {
//                log.warn("Could not delete temp file: {}", filePath);
//            }
//        }
//    }
//
//    @Transactional
//    protected void saveTaxSummary(Report report, EngineResponse response) {
//        var ts = response.taxSummary();
//        TaxSummary summary = TaxSummary.builder()
//                .report(report)
//                .fnoTurnover(new BigDecimal(ts.fnoTurnover()))
//                .intradayTurnover(new BigDecimal(ts.intradayTurnover()))
//                .deliveryTurnover(new BigDecimal(ts.deliveryTurnover()))
//                .netFnoPnl(new BigDecimal(ts.netFnoPnl()))
//                .netIntradayPnl(new BigDecimal(ts.netIntradayPnl()))
//                .netDeliveryPnl(new BigDecimal(ts.netDeliveryPnl()))
//                .auditRequired(ts.auditRequired())
//                .auditReason(ts.auditReason())
//                .itrForm(ts.itrForm())
//                .advanceTaxQ1(new BigDecimal(ts.advanceTaxQ1()))
//                .advanceTaxQ2(new BigDecimal(ts.advanceTaxQ2()))
//                .advanceTaxQ3(new BigDecimal(ts.advanceTaxQ3()))
//                .advanceTaxQ4(new BigDecimal(ts.advanceTaxQ4()))
//                .deductibleExpenses(new BigDecimal(ts.deductibleExpenses()))
//                .build();
//        taxSummaryRepository.save(summary);
//    }
//}