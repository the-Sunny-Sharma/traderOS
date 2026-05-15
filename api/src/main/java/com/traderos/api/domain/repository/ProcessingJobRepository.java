package com.traderos.api.domain.repository;

import com.traderos.api.domain.entity.Job;
import com.traderos.api.domain.entity.Report;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;
import java.util.UUID;

public interface ProcessingJobRepository extends JpaRepository<Job, UUID> {
    Optional<Job> findTopByReportOrderByStartedAtDesc(Report report);
}