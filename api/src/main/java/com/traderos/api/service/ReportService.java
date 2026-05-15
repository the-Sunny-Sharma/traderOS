package com.traderos.api.service;

import com.traderos.api.domain.entity.*;
import com.traderos.api.domain.enums.BrokerName;
import com.traderos.api.domain.enums.ReportStatus;
import com.traderos.api.domain.repository.*;
import com.traderos.api.dto.response.ReportDetailResponse;
import com.traderos.api.dto.response.ReportResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.*;
import java.util.List;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class ReportService {

    private final ReportRepository reportRepository;
    private final TaxSummaryRepository taxSummaryRepository;
    private final ProcessingJobRepository processingJobRepository;
    private final AsyncProcessor asyncProcessor;

    @Value("${upload.dir:./uploads}")
    private String uploadDir;

    /**
     * THE RACE CONDITION AND ITS FIX
     *
     * PROBLEM:
     * @Async submits the task to the thread pool immediately when called.
     * The thread pool may start executing before this @Transactional commits.
     * PostgreSQL default isolation = READ COMMITTED: the async thread's
     * findById() sees 0 rows because the INSERT hasn't committed yet.
     * Result: "Job not found" IllegalStateException.
     *
     * FIX: TransactionSynchronizationManager.registerSynchronization()
     * Registers an afterCommit() hook that fires only AFTER PostgreSQL
     * acknowledges the COMMIT. The async task is dispatched from there —
     * rows are guaranteed visible to all transactions at that point.
     *
     * INTERVIEW ANSWER:
     * "How do you safely fire async work from a @Transactional method?"
     * "Use TransactionSynchronizationManager.registerSynchronization() and
     * dispatch from afterCommit(). Calling @Async directly inside
     * @Transactional creates a race condition — the async thread can
     * outrun the commit and not find the rows it needs."
     *
     * ADVANCED — Outbox Pattern:
     * afterCommit() still has a gap: if the JVM crashes between COMMIT and
     * the async dispatch, the task is lost. The Transactional Outbox Pattern
     * solves this: write a 'pending_tasks' row in the SAME transaction, then
     * a scheduler polls and dispatches. Enterprise version: Debezium + Kafka.
     * We'll implement a simple version in TraderOS Phase 7.
     */
    @Transactional
    public ReportResponse uploadAndProcess(
            User user,
            MultipartFile file,
            String broker,
            String fy,
            double otherIncome,
            String regime
    ) throws IOException {

        // 1. Save file to disk
        Path uploadPath = Paths.get(uploadDir);
        Files.createDirectories(uploadPath);
        String filename = UUID.randomUUID() + "_" + file.getOriginalFilename();
        Path filePath = uploadPath.resolve(filename);
        Files.copy(file.getInputStream(), filePath, StandardCopyOption.REPLACE_EXISTING);

        // 2. Create Report record
        BrokerName brokerName = BrokerName.valueOf(broker.toUpperCase());
        Report report = Report.builder()
                .user(user)
                .brokerName(brokerName)
                .fy(fy)
                .filePath(filePath.toString())
                .status(ReportStatus.PENDING)
                .build();
        reportRepository.save(report);

        // 3. Create Job record
        Job job = Job.builder()
                .user(user)
                .report(report)
                .status("queued")
                .build();
        processingJobRepository.save(job);

        // 4. Capture IDs as final locals for the lambda
        // We cannot use entity objects inside afterCommit() — they'd be DETACHED.
        // UUIDs are plain values, safe to capture in a lambda across any boundary.
        final UUID reportId = report.getId();
        final UUID jobId = job.getId();
        final Path capturedPath = filePath;

        // 5. Register afterCommit hook — async dispatch happens AFTER DB commit
        TransactionSynchronizationManager.registerSynchronization(
                new TransactionSynchronization() {
                    @Override
                    public void afterCommit() {
                        asyncProcessor.process(
                                reportId,
                                jobId,
                                capturedPath,
                                broker,       // effectively final — method param
                                otherIncome,  // primitive, copied by value
                                regime        // effectively final — method param
                        );
                    }
                }
        );

        log.info("Report {} queued for processing", reportId);
        return toResponse(report);
    }

    public List<ReportResponse> getUserReports(User user) {
        return reportRepository
                .findByUserOrderByCreatedAtDesc(user)
                .stream()
                .map(this::toResponse)
                .toList();
    }

    public ReportDetailResponse getReportDetail(UUID reportId, User user) {
        Report report = reportRepository
                .findByIdAndUser(reportId, user)
                .orElseThrow(() -> new IllegalArgumentException(
                        "Report not found: " + reportId));

        TaxSummary taxSummary = taxSummaryRepository
                .findByReport(report)
                .orElse(null);

        return ReportDetailResponse.of(report, taxSummary);
    }

    private ReportResponse toResponse(Report report) {
        return new ReportResponse(
                report.getId(),
                report.getBrokerName().name(),
                report.getFy(),
                report.getStatus(),
                report.getCreatedAt()
        );
    }
}